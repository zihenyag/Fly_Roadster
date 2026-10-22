import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3,Quaternion } from 'three';
import { initPhysics,Simulation,type NPC } from '../src/simulation';
import { IDLE,LANE_WIDTH,UP } from '../src/core';
import { verificationControls } from '../scripts/driver';

await initPhysics();
test('road lanes exceed twice the Roadster body width',()=>assert.ok(LANE_WIDTH>=1.84*2));
test('keyboard steering allows lane-scale correction instead of a sharp swerve',()=>{
  const sim=new Simulation(0,false);for(let i=0;i<120;i++)sim.tick({...IDLE,steer:1});
  assert.equal(sim.failure,null);assert.ok(Math.abs(sim.lateral)<4.6,`${sim.lateral}`);assert.ok(Math.abs(sim.lateral)>0.2);sim.dispose();
});
test('inverted airborne vehicle automatically rights itself and burns fuel',()=>{
  const sim=new Simulation(0,false);sim.fuel=50;sim.body.setTranslation({x:0,y:30,z:0},true);sim.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI),true);sim.body.setLinvel({x:0,y:0,z:-10},true);
  for(let i=0;i<220&&!sim.failure;i++)sim.tick(IDLE);
  const up=UP.clone().applyQuaternion(sim.rotation);assert.ok(up.y>0.9,`up=${up.y}`);assert.ok(sim.fuel<60);assert.equal(sim.failure,null);sim.dispose();
});
test('magnetic half-ring constraint permits inversion without assistance fighting the road',()=>{
  const sim=new Simulation(3,false);sim.route.extend(12000);const seg=sim.route.segments.find(s=>s.kind==='loop')!;
  sim.s=seg.start+Math.PI*36-6;sim.currentSegment=seg;sim.ensureWorld();const f=sim.route.sample(sim.s);
  sim.body.setTranslation(f.p.clone().addScaledVector(f.up,0.86),true);sim.body.setRotation(f.q,true);sim.body.setLinvel(f.forward.clone().multiplyScalar(25),true);
  sim.tick({...IDLE,grip:1});assert.equal(sim.assistStatus,'环面约束');assert.ok(UP.clone().applyQuaternion(sim.rotation).y<0);assert.equal(sim.failure,null);sim.dispose();
});
test('inverted loop and cross-barrier flight can land with the physical floor enabled',()=>{
  for(const seed of [0,5,11,32,33,39,40,47]) {
    const sim=new Simulation(seed,false);const seen=new Set<string>(),target=seed===11?20000:seed===39?15000:8000;
    for(let i=0;i<120*600&&!sim.failure&&sim.s<target;i++) {seen.add(sim.currentSegment.kind);sim.tick(verificationControls(sim));}
    assert.equal(sim.failure,null,`seed=${seed}, s=${sim.s}, ${JSON.stringify(sim.failure)}`);
    assert.ok(sim.s>=target);assert.ok(seen.has('loop')&&seen.has('jump'));sim.dispose();
  }
});
test('a shallow upright floor brush is allowed while heavy body contact still fails',()=>{
  const light=new Simulation(0,false);light.body.setTranslation({x:0,y:0.44,z:0},true);light.body.setLinvel({x:0,y:-2,z:-20},true);light.tick(IDLE);
  assert.equal(light.failure,null);assert.ok((light as unknown as {floorContactTime:number}).floorContactTime>0);light.dispose();
  const deep=new Simulation(0,false);deep.body.setTranslation({x:0,y:0.55,z:0},true);deep.body.setLinvel({x:0,y:-9,z:-20},true);
  for(let i=0;i<60&&!deep.failure;i++)deep.tick(IDLE);
  assert.equal(deep.failure?.reason,'车身触地');deep.dispose();
});
test('an uncushioned hard landing still fails with the physical floor enabled',()=>{
  const sim=new Simulation(0,false);sim.body.setTranslation({x:0,y:4,z:0},true);sim.body.setLinvel({x:0,y:-18,z:-20},true);
  for(let i=0;i<120&&!sim.failure;i++)sim.tick(IDLE);
  assert.ok(sim.failure);assert.ok(['落地冲击过大','车身触地'].includes(sim.failure.reason));sim.dispose();
});
test('steering wheel feedback follows airborne steering input',()=>{
  const sim=new Simulation(0,false);sim.body.setTranslation({x:0,y:15,z:0},true);
  for(let i=0;i<25;i++)sim.tick({...IDLE,steer:1});
  assert.ok(sim.steering>0.01);assert.equal(sim.grounded,false);sim.dispose();
});
test('traffic contacts create persistent dynamic wrecks instead of overlapping vehicles',()=>{
  const sim=new Simulation(7,true);for(const n of sim.npcs)sim.world.removeRigidBody(n.body);sim.npcs=[];
  const helper=sim as unknown as {addNPC(kind:'normal',s:number,lane:number,speed:number):NPC};
  const a=helper.addNPC('normal',100,1,20),b=helper.addNPC('normal',103,1,20);
  for(let i=0;i<12;i++)sim.tick(IDLE);
  assert.ok(a.crashed&&b.crashed);assert.ok(a.body.isDynamic()&&b.body.isDynamic());assert.equal(sim.failure,null);sim.dispose();
});
test('hazard admission replays a physically safe escape before revealing the vehicle',()=>{
  const sim=new Simulation(19,true);for(const n of sim.npcs)sim.world.removeRigidBody(n.body);sim.npcs=[];
  sim.s=600;sim.ensureWorld();const f=sim.route.sample(600);sim.body.setTranslation(f.p.clone().addScaledVector(f.up,0.85),true);sim.body.setRotation(f.q,true);sim.body.setLinvel(f.forward.clone().multiplyScalar(28),true);sim.traffic=false;sim.world.step();sim.tick(IDLE);sim.traffic=true;
  const helper=sim as unknown as {spawnHazard(h:unknown):void};helper.spawnHazard({id:999,at:500,kind:'v800',lane:0,reaction:5,witness:'left',side:1});
  assert.ok(sim.certifiedHazards>0,`certified=${sim.certifiedHazards}, rejected=${sim.rejectedHazards}, ${JSON.stringify(sim.witnessReports)}`);assert.equal(sim.failure,null);sim.dispose();
});
