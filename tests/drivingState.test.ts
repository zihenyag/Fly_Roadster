import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState, type StatePacket } from '../src/drivingState';
import { IDLE } from '../src/core';

function packet(elapsed=0,z=0,sentAt=performance.timeOrigin+performance.now()):StatePacket {
  return {telemetry:{s:0,distance:0,elapsed,fuel:50,speed:50,grounded:true,steering:0,assistStatus:'待机',fuelFactor:1,rawInput:{...IDLE},input:{...IDLE},failure:null,lateral:0,height:.89},position:[0,.89,z],rotation:[0,0,0,1],velocity:[0,0,-50],npcs:[{id:1,kind:'normal',vehicle:'sedan',color:0xffffff,signal:0,lane:0,targetLane:0,pos:[0,1,z-10],q:[0,0,0,1]}],routeLength:6000,patches:[],patchIds:[],sentAt,tickMaxMs:0};
}
test('worker packets preserve authoritative controls and failures without copying a physics world',()=>{
  const state=new GameState(3),p=packet();p.telemetry.rawInput={...IDLE,gas:1,lift:1};p.telemetry.failure={reason:'发生擦碰',detail:'护栏'};
  state.apply(structuredClone(p));assert.deepEqual(state.rawInput,p.telemetry.rawInput);assert.deepEqual(state.failure,p.telemetry.failure);assert.equal(state.fuel,50);assert.equal('world' in state,false);
});
test('player and traffic use the same buffered visual instant, while pause uses the exact frozen pose',()=>{
  const state=new GameState(3),clock=performance.now();state.apply(packet(0,0,performance.timeOrigin+clock));state.apply(packet(.02,-1,performance.timeOrigin+clock+20));
  const visual=state.sampleVisualState(clock+70,true);assert.ok(Math.abs(visual.position.z+.5)<1e-5);assert.ok(Math.abs(visual.npcs[0].pos.z+10.5)<1e-5);
  assert.equal(state.position.z,-1);assert.equal(state.sampleVisualState(clock+500,false).position.z,-1);
  const resumed=packet(.02,-1,performance.timeOrigin+clock+500);resumed.reset=true;state.apply(resumed);assert.equal(state.sampleVisualState(clock+500,true).position.z,-1);
});
test('incremental road packet geometry stays attached to the correct seeded segment and retires cleanly',()=>{
  const state=new GameState(3),p=packet();p.patchIds=[2];p.patches=[{id:2,segment:1,wrong:false,vertices:new Float32Array([1,2,3]),indices:new Uint32Array([0])}];
  state.apply(structuredClone(p));assert.equal(state.patches[0].seg,state.route.segments[1]);assert.deepEqual([...state.patches[0].vertices],[1,2,3]);
  const next=packet();next.patchIds=[2];state.apply(next);assert.equal(state.patches.length,1);state.apply(packet());assert.equal(state.patches.length,0);
});
