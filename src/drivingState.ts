import { Quaternion, Vector3 } from 'three';
import { IDLE, Route, type Controls } from './core';
import type { Simulation, NPC, Patch } from './simulation';

export type TrafficVehicle=Pick<NPC,'id'|'kind'|'vehicle'|'color'|'signal'|'lane'|'targetLane'|'pos'|'q'>;
export type RoadPatch=Pick<Patch,'id'|'seg'|'wrong'|'vertices'|'indices'>;
type Telemetry=Pick<Simulation,'s'|'distance'|'elapsed'|'fuel'|'speed'|'grounded'|'steering'|'assistStatus'|'fuelFactor'|'rawInput'|'input'|'failure'|'lateral'|'height'>;
export type VisualState={position:Vector3;rotation:Quaternion;npcs:TrafficVehicle[]};
export type DrivingState=Telemetry&VisualState&{seed:number;route:Route;patches:RoadPatch[];currentFrame:Simulation['currentFrame'];sampleVisualState?:(now:number,active:boolean)=>VisualState};
export type WireVehicle=Omit<TrafficVehicle,'pos'|'q'>&{pos:number[];q:number[]};
export type StatePacket={
  telemetry:Telemetry;position:number[];rotation:number[];velocity:number[];npcs:WireVehicle[];
  routeLength:number;patches:{id:number;segment:number;wrong:boolean;vertices:Float32Array;indices:Uint32Array}[];patchIds:number[];
  sentAt:number;tickMaxMs:number;reset?:boolean;
};
export type WorkerRequest={type:'init';seed:number}|{type:'input';controls:Controls}|{type:'pause'|'resume'};
export type WorkerReply={type:'state';ready:boolean;packet:StatePacket}|{type:'error';message:string};

/** Small render-only mirror of the worker's authoritative simulation. */
export class GameState implements DrivingState {
  route:Route;patches:RoadPatch[]=[];npcs:TrafficVehicle[]=[];currentFrame:Simulation['currentFrame'];
  s=0;distance=0;elapsed=0;fuel=100;speed=80/3.6;grounded=true;steering=0;assistStatus='待机';fuelFactor=1;
  rawInput:Controls={...IDLE};input:Controls={...IDLE};failure:Simulation['failure']=null;lateral=0;height=0;
  position=new Vector3(0,.89,0);rotation=new Quaternion();velocity=new Vector3();tickMaxMs=0;
  private history:StatePacket[]=[];
  private visual:VisualState={position:new Vector3(),rotation:new Quaternion(),npcs:[]};
  constructor(public seed:number){this.route=new Route(seed);this.currentFrame=this.route.sample(0);}
  apply(packet:StatePacket) {
    Object.assign(this,packet.telemetry);this.position.fromArray(packet.position);this.rotation.fromArray(packet.rotation);this.velocity.fromArray(packet.velocity);this.tickMaxMs=packet.tickMaxMs;
    this.route.extend(packet.routeLength-.001);this.currentFrame=this.route.sample(this.s);
    const active=new Set(packet.patchIds);this.patches=this.patches.filter(p=>active.has(p.id));
    for(const p of packet.patches)if(!this.patches.some(existing=>existing.id===p.id))this.patches.push({...p,seg:this.route.segments[p.segment]});
    this.npcs=packet.npcs.map(n=>({...n,pos:new Vector3().fromArray(n.pos),q:new Quaternion().fromArray(n.q)}));
    if(packet.reset)this.history=[];this.history.push(packet);if(this.history.length>16)this.history.shift();
  }
  sampleVisualState(now:number,active:boolean):VisualState {
    if(!active||this.failure||this.history.length<2)return this;
    const latest=this.history.at(-1)!;
    // A 60 ms visual buffer absorbs worker scheduling jitter; collisions and input remain at 120 Hz.
    const target=latest.telemetry.elapsed+(performance.timeOrigin+now-latest.sentAt)/1000-.060;
    let a=this.history[0],b=a;
    for(const packet of this.history){if(packet.telemetry.elapsed<=target)a=packet;if(packet.telemetry.elapsed>=target){b=packet;break;}b=packet;}
    const span=b.telemetry.elapsed-a.telemetry.elapsed,alpha=span>0?Math.max(0,Math.min(1,(target-a.telemetry.elapsed)/span)):1;
    const {position,rotation,npcs}=this.visual;
    position.fromArray(a.position).lerp(new Vector3().fromArray(b.position),alpha);rotation.fromArray(a.rotation).slerp(new Quaternion().fromArray(b.rotation),alpha);
    const extrapolate=Math.max(0,Math.min(.025,target-latest.telemetry.elapsed));
    if(extrapolate)position.fromArray(latest.position).addScaledVector(new Vector3().fromArray(latest.velocity),extrapolate);
    const previous=new Map(a.npcs.map(n=>[n.id,n]));npcs.length=0;
    for(const n of b.npcs){const old=previous.get(n.id)||n;npcs.push({...n,pos:new Vector3().fromArray(old.pos).lerp(new Vector3().fromArray(n.pos),alpha),q:new Quaternion().fromArray(old.q).slerp(new Quaternion().fromArray(n.q),alpha)});}
    return this.visual;
  }
}

export class SimulationClient {
  state:GameState;worker:Worker;ready:Promise<void>;onUpdate=()=>{};onError=(error:Error)=>console.error(error);
  constructor(seed:number) {
    this.state=new GameState(seed);this.worker=new Worker(new URL('./simulation.worker.ts',import.meta.url),{type:'module'});
    this.ready=new Promise<void>((resolve,reject)=>{
      this.worker.onmessage=({data}:{data:WorkerReply})=>{
        if(data.type==='error'){const error=new Error(data.message);reject(error);this.onError(error);return;}
        this.state.apply(data.packet);if(data.ready)resolve();this.onUpdate();
      };
      this.worker.onerror=e=>{const error=new Error(e.message||'物理线程未能启动');reject(error);this.onError(error);};
    });
    this.send({type:'init',seed});
  }
  send(message:WorkerRequest){this.worker.postMessage(message);}
  dispose(){this.worker.onmessage=null;this.worker.onerror=null;this.worker.terminate();}
}
