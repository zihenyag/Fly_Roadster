import { Vector3 } from 'three';
import { Simulation } from '../src/simulation';
import { IDLE, type Controls } from '../src/core';

/** Verification-only driver. It sends the same two-strength inputs available to the human. */
export function verificationControls(sim:Simulation):Controls {
  const f=sim.grounded?new Vector3(0,0,-1).applyQuaternion(sim.rotation):new Vector3(sim.velocity.x,0,sim.velocity.z).normalize();
  const r=sim.grounded?new Vector3(1,0,0).applyQuaternion(sim.rotation):f.clone().cross(new Vector3(0,1,0));
  const aim=sim.route.sample(sim.s+Math.max(10,sim.speed*0.45)).p.clone().sub(sim.position).setY(0).normalize();
  const err=Math.atan2(aim.dot(r),aim.dot(f));const ctrl:Controls={...IDLE,steer:Math.abs(err)>0.014?Math.sign(err)*(Math.abs(err)>0.14?1:0.46):0};
  const seg=sim.currentSegment,t=sim.s-seg.start;
  const next=sim.route.segments.find(s=>s.kind==='loop'&&s.start>sim.s&&s.start-sim.s<220);const target=seg.kind==='loop'||next?49:35;
  ctrl.gas=sim.speed<target-0.3?0.46:0;ctrl.brake=sim.speed>target+1?0.46:0;
  if(seg.kind==='loop'&&t<Math.PI*36-0.3)ctrl.grip=0.46;
  if(seg.kind==='jump'&&t>125&&t<235)ctrl.lift=0.46;
  const landingY=seg.origin.y+(seg.kind==='loop'?8:0),height=sim.position.y-landingY,vy=sim.body.linvel().y;
  const landingSpeed=3.2;
  if(!sim.grounded&&vy<-landingSpeed&&height<(vy*vy-landingSpeed*landingSpeed)/(2*9.81*0.75)+1.6)ctrl.lift=1;
  const heavy=Object.values(ctrl).some(v=>Math.abs(v)>0.5);
  if(heavy)for(const k of ['steer','gas','brake','lift','grip']as const)ctrl[k]=Math.sign(ctrl[k]);
  return ctrl;
}
