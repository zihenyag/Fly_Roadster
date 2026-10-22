import { IDLE, STEP, type Controls } from './core';
import { initPhysics, Simulation } from './simulation';
import type { StatePacket, WorkerRequest, WorkerReply } from './drivingState';

let sim:Simulation|undefined,running=false,controls:Controls={...IDLE},lastTime=0,accumulator=0,lastSend=0,tickMaxMs=0;
let timer:ReturnType<typeof setTimeout>|undefined;
const sentPatches=new Set<number>();
const send=(reply:WorkerReply)=>postMessage(reply);
function publish(ready=false,simulatedAt=performance.now(),reset=false) {
  if(!sim)return;
  const s=sim,velocity=s.body.linvel();
  const packet:StatePacket={
    telemetry:{s:s.s,distance:s.distance,elapsed:s.elapsed,fuel:s.fuel,speed:s.speed,grounded:s.grounded,steering:s.steering,assistStatus:s.assistStatus,fuelFactor:s.fuelFactor,rawInput:s.rawInput,input:s.input,failure:s.failure,lateral:s.lateral,height:s.height},
    position:s.position.toArray(),rotation:s.rotation.toArray(),velocity:[velocity.x,velocity.y,velocity.z],
    npcs:s.npcs.map(n=>({id:n.id,kind:n.kind,vehicle:n.vehicle,color:n.color,signal:n.signal,lane:n.lane,targetLane:n.targetLane,pos:n.pos.toArray(),q:n.q.toArray()})),
    routeLength:s.route.length,patchIds:s.patches.map(p=>p.id),patches:s.patches.filter(p=>!sentPatches.has(p.id)).map(p=>({id:p.id,segment:p.seg.id,wrong:p.wrong,vertices:p.vertices,indices:p.indices})),
    sentAt:performance.timeOrigin+simulatedAt,tickMaxMs,reset
  };
  for(const p of s.patches)sentPatches.add(p.id);send({type:'state',ready,packet});lastSend=performance.now();
}
function pump() {
  const now=performance.now();
  if(sim&&running) {
    accumulator+=Math.min(.1,(now-lastTime)/1000);
    while(accumulator>=STEP&&!sim.failure){const start=performance.now();sim.tick(controls);tickMaxMs=Math.max(tickMaxMs,performance.now()-start);accumulator-=STEP;}
    if(sim.failure){running=false;accumulator=0;publish();}
    else if(now-lastSend>=1000/60)publish(false,now);
  }
  lastTime=now;timer=running?setTimeout(pump,4):undefined;
}
globalThis.onmessage=async({data}:{data:WorkerRequest})=>{
  try {
    if(data.type==='init'){await initPhysics();sim=new Simulation(data.seed);sim.warmValidation();lastTime=performance.now();publish(true);return;}
    if(!sim)return;
    if(data.type==='input'){controls=data.controls;return;}
    controls={...IDLE};sim.rawInput={...IDLE};sim.input={...IDLE};accumulator=0;lastTime=performance.now();running=data.type==='resume';
    if(timer){clearTimeout(timer);timer=undefined;}publish(false,performance.now(),true);if(running)pump();
  }catch(error){running=false;send({type:'error',message:String(error)});}
};
