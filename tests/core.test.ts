import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlsFromKeys, fuelStep, Route, FUNCTION_KEYS } from '../src/core';

test('physical-key whitelist and Space modifier are exhaustive',()=>{
  for(const k of ['KeyA','KeyS','KeyH','KeyL','Digit0','Enter','Escape','Tab','ShiftLeft','ArrowLeft'])assert.equal(FUNCTION_KEYS.has(k),false,k);
  assert.equal(controlsFromKeys(new Set(['KeyD'])).steer,-0.46);
  assert.equal(controlsFromKeys(new Set(['KeyF','Space'])).steer,1);
  assert.equal(controlsFromKeys(new Set(['KeyD','KeyF','Space'])).steer,0);
  assert.equal(controlsFromKeys(new Set(['KeyJ','KeyK'])).gas,0);
});
test('multiple propulsion keys never stack, global modifier changes all held functions',()=>{
  const a=controlsFromKeys(new Set(['KeyQ','KeyZ','KeyD','KeyJ']));
  assert.deepEqual(a,controlsFromKeys(new Set(['KeyQ','KeyW','KeyP','KeyZ','KeyX','KeyD','KeyJ'])));
  const b=controlsFromKeys(new Set(['Space','BracketLeft','Slash','KeyF','KeyK']));
  assert.deepEqual(b,{steer:1,gas:0,brake:1,lift:1,grip:1});
});
test('fuel caps, regenerates, and charges opposing thrusters independently',()=>{
  const idle=controlsFromKeys(new Set());assert.equal(fuelStep(100,idle,false,1).fuel,100);assert.equal(fuelStep(0,idle,false,1).fuel,6);
  assert.equal(fuelStep(90,controlsFromKeys(new Set(['KeyQ','KeyZ','Space'])),true,1).fuel,48);
  assert.ok(fuelStep(0,controlsFromKeys(new Set(['KeyQ','Space'])),false,1).fuel>=0);
});
test('routes reproduce by seed and differ between seeds',()=>{
  const a=new Route(123),b=new Route(123),c=new Route(124);assert.deepEqual(a.events,b.events);assert.notDeepEqual(a.events,c.events);
});
test('incremental extension has exactly the same geometry and events as bulk generation',()=>{
  const a=new Route(100),b=new Route(100);for(let n=6100;n<30000;n+=100)a.extend(n);b.extend(a.length);
  assert.deepEqual(a.events,b.events);assert.deepEqual(a.segments,b.segments);
});
test('half ring inverts surface frame at 72 metres and returns onto opposite-direction road',()=>{
  const r=new Route(7);r.extend(30000);const seg=r.segments.find(s=>s.kind==='loop')!;assert.ok(seg);
  const entry=r.sampleSegment(seg,0),top=r.sampleSegment(seg,Math.PI*36),exit=r.sampleSegment(seg,Math.PI*36+120);
  assert.ok(top.up.y<-0.999);assert.ok(Math.abs(top.p.y-entry.p.y-72)<1e-6);assert.ok(entry.forward.dot(exit.forward)<-0.999);assert.equal(exit.exists,true);
});
test('1000 random seeds retain protected roads, warnings, and unblocked spaced special routes',()=>{
  for(let seed=0;seed<1000;seed++) {const r=new Route(seed);r.extend(30000);r.validate();assert.ok(r.hazards.every(h=>h.at>=300));assert.ok(r.segments.filter(s=>s.start<300).every(s=>s.kind==='road'&&!s.bump));}
});
