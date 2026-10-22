import { Vector3 } from 'three';
import { LANE_WIDTH, clamp, type Controls } from '../src/core';
import type { Simulation, NPC } from '../src/simulation';
import { VEHICLES } from '../src/vehicles';
import { verificationControls } from './driver';

/** Local demonstration driver: emits ordinary fixed-output controls, never changes the world. */
export class Autopilot {
  lane=0;private nextDecision=0;private takeoffUntil=0;
  private predictedLane(n:NPC,t:number) {
    if(n.kind==='su7'){
      const age=n.age+t;
      if(age<2)return n.entryLane+(n.targetLane-n.entryLane)*clamp((age-.35)/1.4,0,1)**2*(3-2*clamp((age-.35)/1.4,0,1));
      const u=age-2;return n.targetLane+n.side*(u<3?.08*Math.sin(u*4):.10*(u-3)**2);
    }
    if(n.signal)return n.lane+(n.targetLane-n.lane)*(1-Math.exp(-2*Math.max(0,t-Math.max(0,n.signal-1.2))));
    return n.lane;
  }
  controls(sim:Simulation):Controls {
    const c=verificationControls(sim),seg=sim.currentSegment;
    if(seg.kind!=='road'){this.lane=0;return c;}
    if(sim.elapsed<this.takeoffUntil){c.lift=1;return c;}
    if(!sim.grounded)return c;
    const special=sim.route.events.find(e=>e.kind!=='bump'&&e.at>=sim.s-5);
    const prepare=!!special&&special.at-sim.s<260;
    if(sim.elapsed>=this.nextDecision&&Math.abs(sim.lateral-this.lane*LANE_WIDTH)<.65){
      this.nextDecision=sim.elapsed+.25;
      const current=clamp(Math.round(sim.lateral/LANE_WIDTH),-1,1);
      const score=(lane:number)=>{
        let cost=Math.abs(lane-this.lane)*7+Math.abs(lane)*(prepare?4:.3);
        for(const n of sim.npcs){
          const half=(VEHICLES[n.vehicle].length+4.6)/2;
          for(const t of [0,.75,1.5,2.5,4,6]){
            const lateral=this.predictedLane(n,t),width=(n.kind==='su7'?1.2:.78);
            if(Math.abs(lateral-lane)>width)continue;
            const gap=n.s-sim.s+(n.speed-sim.speed)*t;
            if(Math.abs(gap)<half+10)cost+=2000*(1+t*.1);
            else if(gap>0&&gap<half+75)cost+=(half+75-gap)*2;
          }
          if(n.kind==='v800'&&n.s<sim.s&&sim.s-n.s<130&&Math.abs(n.lane-lane)<.8)cost+=500;
          if(lane!==current&&Math.abs(n.s-sim.s)<24&&n.lane>=Math.min(current,lane)-.65&&n.lane<=Math.max(current,lane)+.65)cost+=10000;
        }
        return cost;
      };
      const choices=[-1,0,1].filter(l=>Math.abs(l-current)<=1).sort((a,b)=>score(a)-score(b));
      if(score(choices[0])+5<score(this.lane))this.lane=choices[0];
    }
    const nowLane=sim.lateral/LANE_WIDTH;
    const impending=sim.npcs.some(n=>{
      if(Math.abs(n.s-sim.s)>160)return false;
      const half=(VEHICLES[n.vehicle].length+4.6)/2+4;
      return [.4,.8,1.2,1.6,2,2.4].some(t=>{
        const ownLane=nowLane+(this.lane-nowLane)*(1-Math.exp(-1.1*t));
        return Math.abs(n.s-sim.s+(n.speed-sim.speed)*t)<half&&Math.abs(this.predictedLane(n,t)-ownLane)<.85;
      });
    });
    if(impending&&sim.fuel>45&&(!special||special.at-sim.s>190)){
      this.takeoffUntil=sim.elapsed+1;c.lift=1;return c;
    }
    const lookahead=Math.max(26,sim.speed*.9),frame=sim.route.sample(sim.s+lookahead);
    const aim=frame.p.clone().addScaledVector(frame.right,this.lane*LANE_WIDTH).sub(sim.position).setY(0).normalize();
    const f=new Vector3(0,0,-1).applyQuaternion(sim.rotation),r=new Vector3(1,0,0).applyQuaternion(sim.rotation);
    const err=Math.atan2(aim.dot(r),aim.dot(f));c.steer=Math.abs(err)>.014?Math.sign(err):0;
    const nextLoop=prepare&&special?.kind==='loop';let target=nextLoop?49:35;
    for(const n of sim.npcs){
      const gap=n.s-sim.s-(VEHICLES[n.vehicle].length+4.6)/2;
      if(gap<=0||gap>130)continue;
      const overlaps=Math.abs(n.lane-sim.lateral/LANE_WIDTH)<.75||Math.abs(this.predictedLane(n,1)-this.lane)<.8;
      if(overlaps)target=Math.min(target,Math.max(0,n.speed+(gap-24-sim.speed*.7)*.55));
    }
    c.gas=+(sim.speed<target-.3);c.brake=+(sim.speed>target+.6);
    return c;
  }
}
