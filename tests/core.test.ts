import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlsFromKeys, fuelStep, Route, FUNCTION_KEYS, fuelRate, FIRST_LOOP_AT } from '../src/core';

test('WASD and arrow keys are equivalent, mix freely, and opposing inputs cancel',()=>{
  for(const [a,b] of [['KeyW','ArrowUp'],['KeyS','ArrowDown'],['KeyA','ArrowLeft'],['KeyD','ArrowRight']])assert.deepEqual(controlsFromKeys(new Set([a])),controlsFromKeys(new Set([b])));
  assert.equal(controlsFromKeys(new Set(['KeyW','ArrowUp'])).gas,1);
  assert.equal(controlsFromKeys(new Set(['KeyA','ArrowLeft'])).steer,-1);
  assert.equal(controlsFromKeys(new Set(['KeyA','ArrowRight'])).steer,0);
  assert.equal(controlsFromKeys(new Set(['KeyW','ArrowDown'])).gas,0);
  assert.equal(controlsFromKeys(new Set(['KeyW','ArrowDown'])).brake,1);
  for(const k of ['KeyQ','KeyE','KeyF','KeyJ','KeyK','KeyH','Digit0','Enter','Escape','Tab','ControlLeft'])assert.equal(FUNCTION_KEYS.has(k),false,k);
});
test('propulsion aliases use the same fixed output immediately and never stack',()=>{
  const one=controlsFromKeys(new Set(['Space','ShiftLeft']));
  assert.deepEqual(one,controlsFromKeys(new Set(['Space','ControlRight','ShiftLeft','ShiftRight'])));
  assert.deepEqual(one,{steer:0,gas:0,brake:0,lift:1,grip:1});
  assert.equal(controlsFromKeys(new Set()).lift,0);
});
test('fixed propulsion rates, fuel cap, recharge, and opposing fuel costs are consistent',()=>{
  const idle=controlsFromKeys(new Set()),lift=controlsFromKeys(new Set(['Space'])),both=controlsFromKeys(new Set(['Space','ShiftRight']));
  assert.equal(fuelStep(100,idle,false,1).fuel,100);assert.equal(fuelStep(0,idle,false,1).fuel,6);
  assert.equal(fuelRate(lift,false),25);assert.equal(fuelRate(controlsFromKeys(new Set(['ShiftLeft'])),false),15);
  assert.equal(fuelRate(idle,true),5);assert.equal(fuelRate(both,true),45);
  assert.equal(fuelStep(90,both,true,1).fuel,51);
  let fine=90;for(let i=0;i<120;i++)fine=fuelStep(fine,lift,false,1/120).fuel;
  assert.ok(Math.abs(fine-fuelStep(90,lift,false,1).fuel)<1e-9);
  assert.ok(fuelStep(0,lift,false,1).fuel>=0);
});
test('routes reproduce by seed and differ between seeds',()=>{
  const a=new Route(123),b=new Route(123),c=new Route(124);assert.deepEqual(a.events,b.events);assert.notDeepEqual(a.events,c.events);
});
test('incremental extension has exactly the same geometry and events as bulk generation',()=>{
  const a=new Route(100),b=new Route(100);for(let n=6100;n<30000;n+=100)a.extend(n);b.extend(a.length);
  assert.deepEqual(a.events,b.events);assert.deepEqual(a.segments,b.segments);assert.deepEqual(a.hazards,b.hazards);
});
test('half ring inverts surface frame at 72 metres and returns onto opposite-direction road',()=>{
  const r=new Route(7);r.extend(30000);const seg=r.segments.find(s=>s.kind==='loop')!;assert.ok(seg);
  const entry=r.sampleSegment(seg,0),top=r.sampleSegment(seg,Math.PI*36),exit=r.sampleSegment(seg,Math.PI*36+120);
  assert.ok(top.up.y<-0.999);assert.ok(Math.abs(top.p.y-entry.p.y-72)<1e-6);assert.ok(entry.forward.dot(exit.forward)<-0.999);assert.equal(exit.exists,true);
});
test('1000 random seeds retain protected roads, warnings, and unblocked spaced special routes',()=>{
  for(let seed=0;seed<1000;seed++) {const r=new Route(seed);r.extend(30000);r.validate();assert.ok(r.hazards.every(h=>h.at>=300));assert.ok(r.segments.filter(s=>s.start<300).every(s=>s.kind==='road'&&!s.bump));const first=r.events.find(e=>e.kind!=='bump')!;assert.equal(first.kind,'loop');assert.equal(first.at,FIRST_LOOP_AT);assert.ok(r.nextEvents(0).some(e=>e.kind==='loop'&&e.at===2000));}
});
test('hazards start after the protected section, recur more often, and alternate vehicle types',()=>{
  for(let seed=0;seed<1000;seed++) {
    const r=new Route(seed),early=r.hazards.filter(h=>h.at<1600);
    assert.equal(early[0].at,360);assert.ok(early.length>=4);
    for(let i=1;i<early.length;i++) {assert.notEqual(early[i].kind,early[i-1].kind);assert.ok(early[i].at-early[i-1].at>=220&&early[i].at-early[i-1].at<=340);}
    assert.ok(r.hazards.every(h=>h.reaction>=5));
  }
});
