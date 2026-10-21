import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, Simulation, type NPC } from '../src/simulation';
import { IDLE, STEP, V800_MAX_SPEED_DELTA, SU7_LOSS_AT, type HazardSpec } from '../src/core';
import { verificationControls } from '../scripts/driver';

await initPhysics();

type Internals={
  spawnHazard(h:HazardSpec):boolean;
  trafficStep(dt:number):void;
  addNPC(kind:NPC['kind'],s:number,lane:number,speed:number):NPC;
  validating:boolean;
  fired:Set<number>;
};
function fixture(speed=80) {
  const sim=new Simulation(19,false);sim.s=600;sim.ensureWorld();const f=sim.route.sample(sim.s);
  sim.body.setTranslation(f.p.clone().addScaledVector(f.up,0.85),true);sim.body.setRotation(f.q,true);
  sim.body.setLinvel(f.forward.clone().multiplyScalar(speed/3.6),true);sim.world.step();sim.tick(IDLE);sim.traffic=true;
  const helper=sim as unknown as Internals;helper.validating=true;
  return {sim,helper};
}
const spec=(sim:Simulation,kind:HazardSpec['kind']):HazardSpec=>({id:999,at:sim.s,kind,lane:0,reaction:6.5,witness:'left',side:1});

test('V800 never exceeds the player by 20 km/h, including after braking to a stop',()=>{
  for(const speed of [0,40,80,160,250]) {
    const {sim,helper}=fixture(speed);
    assert.equal(helper.spawnHazard(spec(sim,'v800')),true,`speed=${speed}`);
    const n=sim.npcs.find(n=>n.kind==='v800')!;
    assert.ok(n.speed<=sim.speed+V800_MAX_SPEED_DELTA+1e-8);
    assert.ok(sim.s-n.s>=52&&sim.s-n.s<=78);
    for(const playerSpeed of [250,160,80,40,0,80,250]) {
      sim.speed=playerSpeed/3.6;helper.trafficStep(STEP);
      assert.ok(n.speed<=sim.speed+V800_MAX_SPEED_DELTA+1e-8,`player=${playerSpeed}, V800=${n.speed*3.6}`);
    }
    sim.dispose();
  }
});

test('both admitted hazards allow at least five seconds of ordinary lane keeping',()=>{
  for(const kind of ['v800','su7'] as const)for(const speed of [80,160,250]) {
    const {sim,helper}=fixture(speed);
    assert.equal(helper.spawnHazard(spec(sim,kind)),true,`${kind} at ${speed}`);
    assert.ok(sim.witnessReports.some(r=>!r.failure));
    for(let i=0;i<5/STEP&&!sim.failure;i++) {
      const c=verificationControls(sim);c.gas=sim.speed<speed/3.6-0.2?0.46:0;c.brake=sim.speed>speed/3.6+0.3?0.46:0;
      if(Math.abs(c.steer)>0.5){c.gas=Math.sign(c.gas);c.brake=Math.sign(c.brake);}
      sim.tick(c);
    }
    assert.equal(sim.failure,null,`${kind} at ${speed}: ${JSON.stringify(sim.failure)}`);
    assert.ok(sim.npcs.some(n=>n.kind===kind));sim.dispose();
  }
});

test('SU7 cuts in, loses control at 2 seconds, and keeps a fixed trajectory',()=>{
  const a=fixture(),b=fixture();
  for(const f of [a,b])assert.equal(f.helper.spawnHazard(spec(f.sim,'su7')),true);
  const na=a.sim.npcs.find(n=>n.kind==='su7')!,nb=b.sim.npcs.find(n=>n.kind==='su7')!;
  const initialLane=na.lane;
  for(let i=0;i<7/STEP;i++) {
    a.sim.speed=0;b.sim.speed=250/3.6;a.helper.trafficStep(STEP);b.helper.trafficStep(STEP);
    assert.equal(na.s,nb.s);assert.equal(na.lane,nb.lane);assert.equal(na.speed,nb.speed);
    if(i<0.3/STEP)assert.equal(na.lane,initialLane);
    if(i===Math.round(1/STEP))assert.ok(na.lane>0&&na.lane<initialLane);
    if(i===Math.round(1.9/STEP)){assert.ok(Math.abs(na.lane-na.targetLane)<1e-8);assert.equal(na.phase,1);}
    if(i===Math.round(SU7_LOSS_AT/STEP))assert.equal(na.phase,2);
  }
  assert.equal(na.phase,2);a.sim.dispose();b.sim.dispose();
});

test('an occluding vehicle prevents an unseen V800 from being admitted behind it',()=>{
  const {sim,helper}=fixture();const blocker=helper.addNPC('v800',sim.s-25,0,sim.speed);blocker.kind='normal';
  sim.world.step();assert.equal(helper.spawnHazard(spec(sim,'v800')),false);
  assert.equal(sim.certifiedHazards,0);sim.dispose();
});

test('a temporarily blocked hazard retries before its placement window expires',()=>{
  const {sim,helper}=fixture();const h=spec(sim,'v800');sim.route.hazards=[h];
  const blockers=[-1,1].map(l=>helper.addNPC('normal',sim.s,l,0));
  helper.validating=false;helper.trafficStep(STEP);assert.equal(helper.fired.has(h.id),false);
  for(const n of blockers){sim.metadata.delete(n.collider.handle);sim.world.removeRigidBody(n.body);sim.npcs.splice(sim.npcs.indexOf(n),1);}
  sim.elapsed+=0.6;helper.trafficStep(STEP);
  assert.equal(helper.fired.has(h.id),true);assert.equal(sim.certifiedHazards,1);sim.dispose();
});

test('ordinary rear traffic keeps room for an observable V800 approach',()=>{
  const {sim,helper}=fixture();const follower=helper.addNPC('normal',sim.s-130,0,120/3.6);
  for(let i=0;i<10/STEP&&!sim.failure;i++) {
    const c=verificationControls(sim);c.gas=sim.speed<80/3.6-0.2?0.46:0;c.brake=sim.speed>80/3.6+0.3?0.46:0;
    if(Math.abs(c.steer)>0.5){c.gas=Math.sign(c.gas);c.brake=Math.sign(c.brake);}sim.tick(c);
  }
  assert.equal(sim.failure,null);assert.ok(sim.s-follower.s>=85,`gap=${sim.s-follower.s}`);
  assert.equal(helper.spawnHazard(spec(sim,'v800')),true);sim.dispose();
});
