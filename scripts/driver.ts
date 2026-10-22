import { Vector3 } from 'three';
import { Simulation } from '../src/simulation';
import { controlsFromKeys, type Controls } from '../src/core';

/** Verification-only driver, using the same fixed-output keys as the game. */
export function verificationControls(sim:Simulation):Controls {
  const f=sim.grounded?new Vector3(0,0,-1).applyQuaternion(sim.rotation):new Vector3(sim.velocity.x,0,sim.velocity.z).normalize();
  const r=sim.grounded?new Vector3(1,0,0).applyQuaternion(sim.rotation):f.clone().cross(new Vector3(0,1,0));
  const seg=sim.currentSegment,t=sim.s-seg.start;
  const landing=seg.kind==='loop'&&t>Math.PI*36;
  const lookahead=sim.grounded?Math.max(10,sim.speed*0.45):Math.max(35,sim.speed*1.2);
  const aim=sim.route.sample(landing?Math.max(sim.s+lookahead,seg.start+Math.PI*36+160):sim.s+lookahead).p.clone().sub(sim.position).setY(0).normalize();
  // Anticipate steering's mechanical release time instead of oscillating around the flight path.
  const err=Math.atan2(aim.dot(r),aim.dot(f))-(sim.grounded?0:sim.input.steer*0.10);const keys=new Set<string>();
  if(Math.abs(err)>(sim.grounded?0.014:0.025))keys.add(err<0?'KeyA':'KeyD');
  const next=sim.route.segments.find(s=>s.kind==='loop'&&s.start>sim.s&&s.start-sim.s<220);const target=seg.kind==='loop'||next?49:35;
  if(sim.speed<target-0.3)keys.add('KeyW');if(sim.speed>target+1)keys.add('KeyS');
  if(seg.kind==='loop'&&t<Math.PI*36-0.3)keys.add('ShiftLeft');
  if(seg.kind==='jump'&&t>125&&t<182)keys.add('Space');
  const landingY=seg.origin.y+(seg.kind==='loop'?8:0),height=sim.position.y-landingY,vy=sim.body.linvel().y;
  // Ease onto the suspension before releasing lift; ray contact starts above rest height.
  const landingSpeed=1;
  if(!sim.grounded&&vy<-landingSpeed&&height<(vy*vy-landingSpeed*landingSpeed)/(2*9.81*0.75)+Math.abs(vy)*0.45+2)keys.add('Space');
  return controlsFromKeys(keys);
}
