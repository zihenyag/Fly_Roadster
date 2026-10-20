import { Vector3, Quaternion, Matrix4 } from 'three';

export const STEP = 1 / 120;
export const MAX_SPEED = 250 / 3.6;
export const LANE_WIDTH = 4.6;
export const ROAD_HALF = LANE_WIDTH*1.5+0.25;
export const RAIL_X = ROAD_HALF+0.3;
export const LIFT_KEYS = new Set(['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight']);
export const GRIP_KEYS = new Set(['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash']);
export const FUNCTION_KEYS = new Set(['KeyD','KeyF','KeyJ','KeyK','Space', ...LIFT_KEYS, ...GRIP_KEYS]);
export type Controls = { steer: number; gas: number; brake: number; lift: number; grip: number };
export const IDLE: Controls = { steer:0, gas:0, brake:0, lift:0, grip:0 };
export function controlsFromKeys(keys: Set<string>): Controls {
  const strength = keys.has('Space') ? 1 : 0.46;
  const any = (s:Set<string>) => [...s].some(k=>keys.has(k));
  return { steer: ((+keys.has('KeyF'))-(+keys.has('KeyD'))) * strength,
    gas:keys.has('KeyK') ? 0 : +keys.has('KeyJ')*strength, brake:+keys.has('KeyK')*strength,
    lift:+any(LIFT_KEYS)*strength, grip:+any(GRIP_KEYS)*strength };
}
export function fuelStep(fuel:number, input:Controls, assisting:boolean, dt:number) {
  const rate = (input.lift ? (input.lift>0.5?28:14):0) + (input.grip?(input.grip>0.5?16:8):0) + (assisting?4:0);
  const available = Math.min(100,fuel+6*dt);
  const factor = rate ? Math.min(1,available/(rate*dt)) : 1;
  return { fuel:Math.max(0,available-rate*dt), factor, rate };
}
export class Random {
  constructor(public seed:number) { this.seed >>>= 0; }
  next() { let t=this.seed+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }
  range(a:number,b:number) { return a+(b-a)*this.next(); }
  pick<T>(a:T[]) { return a[Math.floor(this.next()*a.length)]; }
}
export const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export const smooth=(x:number)=>{ x=clamp(x,0,1); return x*x*(3-2*x); };
export const UP=new Vector3(0,1,0);
export type RoadKind='road'|'fork'|'loop'|'jump';
export type RoadFrame={ p:Vector3; forward:Vector3; up:Vector3; right:Vector3; q:Quaternion; exists:boolean };
export type RoadSegment={ id:number; start:number; length:number; kind:RoadKind; origin:Vector3; heading:number; turn:number; side:number; bend:number; bump:number; terrain:'coast'|'mountain'|'bridge' };
export type RoadEvent={ id:number; at:number; kind:'fork'|'loop'|'jump'|'bump'; side:number; reserve:number };
export type HazardSpec={ id:number; at:number; kind:'v800'|'su7'; lane:number; reaction:number; witness:'left'|'right'; side:number };
export function frame(p:Vector3, forward:Vector3, up=UP, exists=true):RoadFrame {
  const f=forward.clone().normalize(); const r=f.clone().cross(up).normalize();
  const u=r.clone().cross(f).normalize();
  return { p,forward:f,up:u,right:r,q:new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(r,u,f.clone().negate())),exists };
}
export class Route {
  segments:RoadSegment[]=[]; events:RoadEvent[]=[]; hazards:HazardSpec[]=[];
  rng:Random; private hazardRng:Random;length=0; private lastSpecial=-2000; private nextHazard=460; private hazardId=0;
  constructor(public seed:number) { this.rng=new Random(seed);this.hazardRng=new Random(seed^0x27a491); this.extend(6000); }
  extend(until:number) {
    while(this.length<until) {
      const prev=this.segments.at(-1); const end=prev?this.sampleSegment(prev,prev.length):frame(new Vector3(),new Vector3(0,0,-1));
      const id=this.segments.length; let kind:RoadKind='road';
      if(this.length>=2300 && this.length-this.lastSpecial>=1550 && this.rng.next()<0.64) {
        kind=this.events.some(e=>e.kind==='fork') ? this.rng.pick<RoadKind>(['fork','loop','jump']) : 'fork';
        if(this.events.some(e=>e.kind==='fork')&&!this.events.some(e=>e.kind==='loop'))kind='loop';
        else if(this.events.some(e=>e.kind==='loop')&&!this.events.some(e=>e.kind==='jump'))kind='jump';
      }
      const side=this.rng.next()<0.5?-1:1;
      const seg:RoadSegment={ id,start:this.length,length:kind==='loop'?Math.PI*36+440:kind==='fork'?420:kind==='jump'?470:360,
        kind,origin:end.p.clone(),heading:Math.atan2(-end.forward.x,-end.forward.z),turn:0,side,
        bend:kind==='road'&&this.length>=300?this.rng.range(-0.075,0.075):0,
        bump:this.length>=300 && kind==='road'&&this.rng.next()<0.45?this.rng.range(0.04,0.14):0,
        terrain:this.length<2000?'coast':this.rng.pick(['coast','mountain','bridge']) };
      if(kind!=='road') { const at=this.length+(kind==='fork'?105:kind==='jump'?150:0);this.lastSpecial=at; this.events.push({ id,at,kind,side,reserve:kind==='loop'?85:kind==='jump'?45:0 }); }
      if(seg.bump) this.events.push({id,at:this.length+95,kind:'bump',side:0,reserve:0});
      this.segments.push(seg); this.length+=seg.length;
    }
    while(this.nextHazard<this.length-400) {
      const s=this.nextHazard;
      const blocked=this.events.some(e=>e.kind!=='bump'&&s>e.at-400&&s<e.at+850);
      if(!blocked) {
        const lane=this.hazardRng.pick([-1,0,1]);
        this.hazards.push({id:this.hazardId++,at:s,kind:this.hazardRng.next()<0.5?'v800':'su7',lane,reaction:Math.max(3.2,5-(s-300)/15000*1.8),witness:lane<0?'right':'left',side:this.hazardRng.next()<0.5?-1:1});
      }
      this.nextHazard+= s<3000?this.hazardRng.range(400,650):s<10000?this.hazardRng.range(250,450):this.hazardRng.range(150,300);
    }
  }
  segmentAt(s:number) {
    let lo=0,hi=this.segments.length-1;
    while(lo<hi) { const mid=(lo+hi+1)>>1;if(this.segments[mid].start<=s)lo=mid;else hi=mid-1; }
    return this.segments[lo];
  }
  sample(s:number, branch=false):RoadFrame { const seg=this.segmentAt(s);return this.sampleSegment(seg,clamp(s-seg.start,0,seg.length),branch); }
  sampleSegment(seg:RoadSegment,t:number,wrong=false):RoadFrame {
    const f=new Vector3(-Math.sin(seg.heading),0,-Math.cos(seg.heading));const r=f.clone().cross(UP);
    let x=0,y=0,z=t;let dir=f.clone(),up=UP.clone(),exists=true;
    if(seg.kind==='road') {
      x=seg.bend*t*t/360; dir.addScaledVector(r,2*seg.bend*t/360).normalize();
      if(seg.bump && t>70 && t<260) { const w=Math.sin(Math.PI*(t-70)/190)**2; y=seg.bump*Math.sin((t-70)*0.72)*w; }
    }
    if(seg.kind==='fork') { const side=wrong?-seg.side:seg.side; x=side*42*smooth((t-65)/240);const u=clamp((t-65)/240,0,1);dir.addScaledVector(r,side*42*6*u*(1-u)/240).normalize(); }
    if(seg.kind==='jump') {
      x=seg.side*22*smooth((t-150)/100);
      if(t>=150&&t<250) { exists=false; y=5*Math.sin(Math.PI*(t-150)/100); }
      const u=clamp((t-150)/100,0,1);dir.addScaledVector(r,seg.side*22*6*u*(1-u)/100).normalize();
    }
    if(seg.kind==='loop') {
      const arc=Math.PI*36;
      if(t<=arc) { const a=t/36;y=36*(1-Math.cos(a));z=36*Math.sin(a);dir=f.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP,Math.sin(a));up=UP.clone().multiplyScalar(Math.cos(a)).addScaledVector(f,-Math.sin(a)); }
      else { const u=t-arc;x=seg.side*24*smooth(u/110);y=u<110?8+64*(1-u/110)**2:8;z=-u;dir=f.clone().negate();exists=u>=110; }
    }
    return frame(seg.origin.clone().addScaledVector(r,x).addScaledVector(UP,y).addScaledVector(f,z),dir,up,exists);
  }
  project(p:Vector3,near:number,wide=false) {
    const active=this.segmentAt(near);const arc=Math.PI*36;
    if(active.kind==='loop'&&near>active.start+arc+0.2) {
      const entry=this.sampleSegment(active,0);const u=p.clone().sub(active.origin).dot(entry.forward.clone().negate());
      const s=clamp(active.start+arc+u,active.start+arc+0.3,active.start+active.length);
      const f=this.sample(s);return {s,frame:f,lateral:p.clone().sub(f.p).dot(f.right),height:p.clone().sub(f.p).dot(f.up),distance:p.distanceTo(f.p)};
    }
    let best=near,dist=Infinity;
    const start=Math.max(0,near-(wide?60:12)),end=Math.min(this.length-1,near+(wide?260:45));
    for(let s=start;s<=end;s+=wide?3:1.5) {const d=this.sample(s).p.distanceToSquared(p);if(d<dist){dist=d;best=s;}}
    let f=this.sample(best);
    best=clamp(best+clamp(p.clone().sub(f.p).dot(f.forward),-3,3),start,end);f=this.sample(best);
    return {s:best,frame:f,lateral:p.clone().sub(f.p).dot(f.right),height:p.clone().sub(f.p).dot(f.up),distance:Math.sqrt(dist)};
  }
  nextEvents(s:number) { return this.events.filter(e=>e.at>s-8 && e.at-s<=(e.kind==='bump'?500:2000)).sort((a,b)=>a.at-b.at); }
  validate() {
    for(const e of this.events) { if(e.kind!=='bump'&&e.at<2300)throw new Error('protected preview'); }
    const special=this.events.filter(e=>e.kind!=='bump');
    for(let i=1;i<special.length;i++)if(special[i].at-special[i-1].at<1500)throw new Error('fuel spacing');
    for(const h of this.hazards) {if(h.at<300||h.reaction<3.2)throw new Error('hazard unfair');if(this.events.some(e=>e.kind!=='bump'&&h.at>e.at-400&&h.at<e.at+850))throw new Error('special blocked');}
  }
}
export function eventText(e:RoadEvent) {const side=e.side<0?'左':'右';return e.kind==='fork'?`前方岔路 · 靠${side}行驶`:e.kind==='loop'?`半圆环飞跃 · 落入${side}侧道路`:e.kind==='jump'?`飞越护栏 · 进入${side}侧道路`:'前方连续起伏 · 注意抓地';}
