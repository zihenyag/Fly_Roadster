import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion } from 'three';
import { Route, Random, STEP, MAX_SPEED, V800_MAX_SPEED_DELTA, SU7_LOSS_AT, MIRROR_HORIZONTAL_FOV, UP, IDLE, LANE_WIDTH, ROAD_HALF, RAIL_X, clamp, smooth, fuelStep, fuelRate, type Controls, type RoadSegment, type RoadFrame, type HazardSpec } from './core';
import { VEHICLES,centerHeight,type VehicleType } from './vehicles';

let initialization:Promise<void>|undefined;
export const initPhysics=()=>initialization??=RAPIER.init();
export type NPC={id:number;kind:'normal'|'v800'|'su7';vehicle:VehicleType;crashed:boolean;crashAge:number;s:number;lane:number;entryLane:number;targetLane:number;speed:number;cruise:number;signal:number;phase:number;age:number;side:number;body:RAPIER.RigidBody;collider:RAPIER.Collider;pos:Vector3;q:Quaternion;color:number;reaction:number;spawnS:number};
export type Patch={id:number;seg:RoadSegment;wrong:boolean;vertices:Float32Array;indices:Uint32Array;colliders:RAPIER.Collider[]};
export type Failure={reason:string;detail:string};
export class Simulation {
  route:Route; world:RAPIER.World; body:RAPIER.RigidBody; collider:RAPIER.Collider; rng:Random;
  patches:Patch[]=[]; npcs:NPC[]=[]; metadata=new Map<number,string>();
  s=0; distance=0; elapsed=0; fuel=100; speed=80/3.6; maxSpeed=80;
  grounded=true; contacts=4; steering=0; assist=false; assistStatus='待机'; stableTime=0;
  input:Controls={...IDLE}; rawInput:Controls={...IDLE}; fuelFactor=1; failure:Failure|null=null;
  position=new Vector3(0,0.89,0); rotation=new Quaternion(); velocity=new Vector3(0,0,-80/3.6);
  currentFrame:RoadFrame; currentSegment:RoadSegment; lateral=0; height=0;
  private npcId=0; private fired=new Set<number>(); private topSeen=new Set<number>();
  private built=new Set<number>(); private lastPosition=new Vector3(); private liftLatch=false;
  private starved=false;
  private validating=false;
  private hazardAttemptAt=0;
  certifiedHazards=0; rejectedHazards=0;
  incidents=0;private nextIncident=1750;private playerHandles:number[]=[];
  private floorHandle:number;private floorContactTime=0;
  witnessReports:{lane:number;failure:Failure|null;lateral:number}[]=[];
  private sensorPoints=[new Vector3(-0.77,-0.12,-1.35),new Vector3(0.77,-0.12,-1.35),new Vector3(-0.77,-0.12,1.35),new Vector3(0.77,-0.12,1.35)];
  constructor(public seed:number,public traffic=true) {
    this.route=new Route(seed);this.rng=new Random(seed^0x149293);this.currentFrame=this.route.sample(0);this.currentSegment=this.route.segmentAt(0);
    this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=STEP;
    this.world.integrationParameters.numSolverIterations=6;
    this.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,0.89,0).setCanSleep(false).setCcdEnabled(true).setLinearDamping(0.01).setAngularDamping(3));
    this.collider=this.world.createCollider(RAPIER.ColliderDesc.roundCuboid(0.94,0.22,2.27,0.05).setMass(1450).setFriction(0.3).setRestitution(0),this.body);
    this.playerHandles.push(this.collider.handle);
    for(const side of [-1,1]) {const m=this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.205,0.132,0.046).setTranslation(side*1.24,0.60,-0.882).setMass(1),this.body);this.playerHandles.push(m.handle);this.metadata.set(m.handle,'车身');}
    const floor=this.world.createCollider(RAPIER.ColliderDesc.roundCuboid(0.78,0.025,1.64,0.025).setTranslation(0,-0.4,0).setMass(0).setFriction(0).setRestitution(0),this.body);this.floorHandle=floor.handle;this.playerHandles.push(floor.handle);this.metadata.set(floor.handle,'车身');
    this.body.setLinvel(this.velocity,true);this.metadata.set(this.collider.handle,'车身');this.ensureWorld();
    if(traffic) for(let i=0;i<18;i++)this.spawnNormal(120+i*72);
  }
  fail(reason:string,detail:string) {this.failure??={reason,detail};}
  ensureWorld() {
    this.route.extend(this.s+4500);
    for(const seg of this.route.segments) {
      if(seg.start>this.s+1500||seg.start+seg.length<this.s-250||this.built.has(seg.id))continue;
      this.built.add(seg.id);this.makePatch(seg,false);if(seg.kind==='fork')this.makePatch(seg,true);
    }
    for(const patch of [...this.patches])if(patch.seg.start+patch.seg.length<this.s-450) {for(const c of patch.colliders){this.metadata.delete(c.handle);this.world.removeCollider(c,true);}this.patches.splice(this.patches.indexOf(patch),1);}
  }
  private makePatch(seg:RoadSegment,wrong:boolean) {
    const verts:number[]=[],inds:number[]=[],colliders:RAPIER.Collider[]=[];const step=seg.kind==='loop'?1.8:4;
    const frames:{f:RoadFrame;t:number}[]=[];
    for(let t=seg.id===0?-300:0;t<seg.length;t+=step)frames.push({f:this.route.sampleSegment(seg,t,wrong),t});frames.push({f:this.route.sampleSegment(seg,seg.length,wrong),t:seg.length});
    for(let i=0;i<frames.length;i++) {
      const {f,t}=frames[i];for(const x of [-ROAD_HALF,ROAD_HALF]) {const p=f.p.clone().addScaledVector(f.right,x);verts.push(p.x,p.y,p.z);}
      if(i && f.exists && frames[i-1].f.exists) {const a=(i-1)*2;inds.push(a,a+1,a+2,a+1,a+3,a+2);}
      if(i%4===0 && f.exists && !(seg.kind==='fork'&&t>40&&t<300)) {
        const next=this.route.sampleSegment(seg,Math.min(seg.length,t+step*4),wrong);
        const len=Math.max(0.2,f.p.distanceTo(next.p));
        for(const x of [-RAIL_X,RAIL_X]) {
          const center=f.p.clone().lerp(next.p,0.5).addScaledVector(f.right,x).addScaledVector(f.up,0.7);
          const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.13,0.28,len/2+0.05).setTranslation(center.x,center.y,center.z).setRotation(f.q));colliders.push(c);this.metadata.set(c.handle,'护栏');
        }
      }
    }
    const vertices=new Float32Array(verts),indices=new Uint32Array(inds);
    const road=this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices).setFriction(0.9));colliders.push(road);this.metadata.set(road.handle,'路面');
    if(seg.kind==='jump') {
      const f=this.route.sampleSegment(seg,155);const p=f.p.clone().addScaledVector(f.up,0.6);
      // A real cross-road barrier; flight authorization does not disable its collider.
      const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(RAIL_X+0.5,0.6,0.16).setTranslation(p.x,p.y,p.z).setRotation(f.q));colliders.push(c);this.metadata.set(c.handle,'跨越护栏');
    }
    this.patches.push({id:seg.id*2+(+wrong),seg,wrong,vertices,indices,colliders});
  }
  private addNPC(kind:NPC['kind'],s:number,lane:number,speed:number,side=1,reaction=5) {
    const vehicle:VehicleType=kind==='v800'?'mpv':kind==='su7'?'sports':this.rng.pick<VehicleType>(['sedan','hatchback','van','smallTruck','lorry','tractor','sedan','hatchback']);
    const spec=VEHICLES[vehicle];
    const f=this.route.sample(Math.max(0,s));const p=f.p.clone().addScaledVector(f.right,lane*LANE_WIDTH).addScaledVector(f.up,centerHeight(vehicle));
    if(s<0)p.addScaledVector(f.forward,s);
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z).setRotation(f.q));
    const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(spec.width/2,spec.height/2,spec.length/2).setTranslation(0,-0.16,0).setMass(spec.mass).setFriction(0.7).setRestitution(0.05).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),body);
    const npc:NPC={id:this.npcId++,kind,vehicle,crashed:false,crashAge:0,s,lane,entryLane:lane,targetLane:lane,speed,cruise:speed,side,signal:0,phase:0,age:0,body,collider,pos:p,q:f.q.clone(),color:kind==='v800'?0x263642:kind==='su7'?0x76b9cb:this.rng.pick([0xc7c3b8,0x344c51,0xe9e6dd,0x8a6261,0x36516b,0xd7ba75]),reaction,spawnS:this.s};
    this.npcs.push(npc);this.metadata.set(collider.handle,spec.name);return npc;
  }
  private spawnNormal(s:number) {
    const seg=this.route.segmentAt(Math.max(0,s));if(seg.kind!=='road')return;
    const lanes=[-1,0,1].filter(l=>!this.npcs.some(n=>Math.abs(n.s-s)<38&&Math.abs(n.lane-l)<0.6));if(!lanes.length)return;
    this.addNPC('normal',s,this.rng.pick(lanes),this.rng.range(60,120)/3.6);
  }
  private spawnHazard(h:HazardSpec) {
    // Hazards are admitted once, before becoming visible, never changed to rescue the player.
    if(this.s<300||!this.grounded||this.currentSegment.kind!=='road')return false;
    if(this.route.events.some(e=>e.kind!=='bump'&&this.s>e.at-420&&this.s<e.at+850))return false;
    const active=this.npcs.filter(n=>n.kind!=='normal'&&!n.crashed&&Math.abs(n.s-this.s)<140&&n.age<n.reaction+8);
    if(active.length>=(this.s<10000?1:2))return false;
    const lane=clamp(Math.round(this.lateral/LANE_WIDTH),-1,1);
    const free=[-1,0,1].filter(l=>l!==lane&&!this.npcs.some(n=>Math.abs(n.s-this.s)<28+VEHICLES[n.vehicle].length/2&&Math.abs(n.lane-l)<0.7));
    if(!free.length)return false;
    const speed=h.kind==='v800'?this.speed+this.rng.range(14/3.6,V800_MAX_SPEED_DELTA):clamp(this.speed,35/3.6,260/3.6);
    const baseGap=h.kind==='v800'?Math.max(52,(speed-this.speed)*(h.reaction+2.5)+6):clamp(45+this.speed*0.6,60,90);
    const spawnLane=h.kind==='v800'?lane:free.includes(lane+h.side)?lane+h.side:free[0];
    for(const extra of [0,12,24]) {
      const gap=baseGap+extra;if(h.kind==='v800'&&gap>78)continue;
      const at=this.s+(h.kind==='v800'?-gap:gap),spec=VEHICLES[h.kind==='v800'?'mpv':'sports'];
      if(this.route.segmentAt(at).kind!=='road'||this.npcs.some(n=>Math.abs(n.s-at)<(spec.length+VEHICLES[n.vehicle].length)/2+12&&Math.abs(n.lane-spawnLane)<0.7))continue;
      const created=this.addNPC(h.kind,at,spawnLane,speed,h.side,h.kind==='su7'?SU7_LOSS_AT:h.reaction);if(h.kind==='su7')created.targetLane=lane;
      if(this.hazardVisible(created)&&free.some(target=>this.replayEscape(target,h.reaction+6,3.2))) {this.certifiedHazards++;return true;}
      this.rejectedHazards++;this.metadata.delete(created.collider.handle);this.world.removeRigidBody(created.body);this.npcs.splice(this.npcs.indexOf(created),1);
    }
    return false;
  }
  private hazardVisible(n:NPC) {
    const rear=n.kind==='v800',eye=new Vector3(...(rear?[-0.02,0.68,-0.76]:[-0.39,0.63,0.42]) as [number,number,number]).applyQuaternion(this.rotation).add(this.position);
    const delta=n.pos.clone().sub(eye),heading=new Vector3(0,0,rear?1:-1).applyQuaternion(this.rotation),right=new Vector3(1,0,0).applyQuaternion(this.rotation);
    const distance=delta.length(),along=delta.dot(heading),fov=rear?MIRROR_HORIZONTAL_FOV.rear:112;
    if(along<=0||Math.abs(Math.atan2(delta.dot(right),along))>fov*Math.PI/360-0.035)return false;
    const ray=new RAPIER.Ray(eye,delta.normalize());
    return !this.world.castRay(ray,distance-1,true,undefined,undefined,this.collider,this.body,c=>c.handle!==n.collider.handle&&this.metadata.get(c.handle)!=='车身');
  }
  private replayEscape(lane:number,seconds:number,reactionDelay=0) {
    const shadow=Object.assign(Object.create(Simulation.prototype),this) as Simulation;
    shadow.world=RAPIER.World.restoreSnapshot(this.world.takeSnapshot());
    shadow.body=shadow.world.getRigidBody(this.body.handle);shadow.collider=shadow.world.getCollider(this.collider.handle);
    shadow.validating=true;shadow.rng=new Random(this.rng.seed);shadow.metadata=new Map(this.metadata);
    shadow.position=this.position.clone();shadow.rotation=this.rotation.clone();shadow.velocity=this.velocity.clone();shadow.lastPosition=this.lastPosition.clone();
    shadow.input={...this.input};shadow.rawInput={...this.rawInput};shadow.fired=new Set(this.fired);shadow.topSeen=new Set(this.topSeen);
    shadow.npcs=this.npcs.map(n=>({...n,pos:n.pos.clone(),q:n.q.clone(),body:shadow.world.getRigidBody(n.body.handle),collider:shadow.world.getCollider(n.collider.handle)}));
    const targetSpeed=Math.max(60/3.6,this.speed);
    const entryLane=this.lateral/LANE_WIDTH;
    for(let i=0;i<seconds/STEP&&!shadow.failure;i++) {
      const frame=shadow.route.sample(shadow.s+Math.max(25,shadow.speed*0.9));
      const aim=frame.p.clone().addScaledVector(frame.right,(i*STEP<reactionDelay?entryLane:lane)*LANE_WIDTH).sub(shadow.position).setY(0).normalize();
      const f=new Vector3(0,0,-1).applyQuaternion(shadow.rotation),r=new Vector3(1,0,0).applyQuaternion(shadow.rotation);
      const err=Math.atan2(aim.dot(r),aim.dot(f));
      const controls={steer:Math.abs(err)>0.014?Math.sign(err):0,gas:shadow.speed<targetSpeed?1:0,brake:shadow.speed>targetSpeed+1?1:0,lift:0,grip:0};
      shadow.tick(controls);
    }
    const valid=!shadow.failure&&Math.abs(shadow.lateral-lane*LANE_WIDTH)<1.5;
    this.witnessReports.push({lane,failure:shadow.failure,lateral:shadow.lateral});if(this.witnessReports.length>8)this.witnessReports.shift();
    shadow.dispose();return valid;
  }
  private trafficStep(dt:number) {
    if(!this.traffic)return;
    if(!this.validating&&this.elapsed>=this.hazardAttemptAt) {
      this.hazardAttemptAt=this.elapsed+0.5;
      for(const h of this.route.hazards)if(h.at<=this.s&&!this.fired.has(h.id)) {
        if(this.s-h.at>220){this.fired.add(h.id);continue;}
        if(this.spawnHazard(h))this.fired.add(h.id);
        break;
      }
    }
    for(const n of [...this.npcs]) {
      n.age+=dt;
      if(n.crashed) {
        n.crashAge+=dt;n.pos.copy(n.body.translation());n.q.copy(n.body.rotation());
        const pr=this.route.project(n.pos,n.s);n.s=pr.s;n.lane=pr.lateral/LANE_WIDTH;
        if(n.s<this.s-270||n.crashAge>45){this.metadata.delete(n.collider.handle);this.world.removeRigidBody(n.body);this.npcs.splice(this.npcs.indexOf(n),1);}continue;
      }
      if(n.kind==='normal') {
        let target=n.cruise;
        const ahead=this.npcs.filter(o=>o!==n&&o.s>n.s&&Math.abs(o.lane-n.lane)<0.65).sort((a,b)=>a.s-b.s)[0];
        const safeGap=ahead?18+(VEHICLES[n.vehicle].length+VEHICLES[ahead.vehicle].length)/2:18;
        if(ahead&&ahead.s-n.s<safeGap+n.speed*1.7)target=Math.min(target,Math.max(0,ahead.speed+(ahead.s-n.s-safeGap-n.speed*1.5)*0.8));
        if(this.s>n.s&&Math.abs(this.lateral/LANE_WIDTH-n.lane)<0.65&&this.speed>=60/3.6-0.02) {
          const gap=this.s-n.s,followingGap=Math.max(95,20+n.speed*1.6);
          target=Math.min(target,Math.max(0,this.speed+(gap-followingGap)*0.8));
        }
        if(n.phase===10)target=n.cruise;
        n.speed+=clamp(target-n.speed,-12*dt,2*dt);
        if(n.signal) {
          n.signal-=dt;if(n.signal<=1.2)n.lane+=(n.targetLane-n.lane)*Math.min(1,dt*2);
          if(n.signal<=0){n.lane=n.targetLane;n.signal=0;}
        } else if(n.age>3&&(ahead&&ahead.speed<n.cruise-1.5&&ahead.s-n.s<100||this.rng.next()<dt*0.025)) {
          const lane=clamp(Math.round(n.lane)+this.rng.pick([-1,1]),-1,1);
          if(lane!==n.lane&&Math.abs(n.s-this.s)>65&&!this.npcs.some(o=>o!==n&&(Math.abs(o.lane-lane)<0.7||o.signal&&Math.abs(o.targetLane-lane)<0.7)&&Math.abs(o.s-n.s)<65)) {n.targetLane=lane;n.signal=3.2;}
        }
      }
      if(n.kind==='v800')n.speed=Math.min(n.cruise,n.speed+2*dt,this.speed+V800_MAX_SPEED_DELTA);
      if(n.kind==='su7') {
        n.phase=n.age<0.35?0:n.age<SU7_LOSS_AT?1:2;
        if(n.phase<2){n.speed=n.cruise;n.lane=n.entryLane+(n.targetLane-n.entryLane)*smooth((n.age-0.35)/1.4);}
        else {const t=n.age-SU7_LOSS_AT;n.speed=Math.max(4,n.cruise-t*6);n.lane=n.targetLane+n.side*(t<3?0.08*Math.sin(t*4):0.10*(t-3)**2);}
      }
      n.s+=n.speed*dt;
      const seg=this.route.segmentAt(Math.max(0,n.s));
      if(n.s<this.s-270||n.s>this.s+1500||seg.kind!=='road') {this.metadata.delete(n.collider.handle);this.world.removeRigidBody(n.body);this.npcs.splice(this.npcs.indexOf(n),1);continue;}
      const f=this.route.sample(Math.max(0,n.s));n.pos.copy(f.p).addScaledVector(f.right,n.lane*LANE_WIDTH).addScaledVector(f.up,centerHeight(n.vehicle));
      if(n.s<0)n.pos.addScaledVector(f.forward,n.s);
      n.q.copy(f.q);if(n.kind==='su7'&&n.phase===2)n.q.multiply(new Quaternion().setFromAxisAngle(UP,n.side*Math.min(1.3,(n.age-SU7_LOSS_AT)*0.65)));
      n.body.setNextKinematicTranslation(n.pos);n.body.setNextKinematicRotation(n.q);
    }
    if(!this.validating&&this.elapsed%1<dt) {
      if(this.npcs.filter(n=>n.kind==='normal'&&n.s>this.s).length<20)this.spawnNormal(this.s+this.rng.range(450,1250));
      if(this.s>300&&this.npcs.filter(n=>n.s<this.s&&n.kind==='normal').length<4)this.spawnNormal(this.s-this.rng.range(150,240));
    }
    if(!this.validating&&this.s>this.nextIncident) {
      this.nextIncident=this.s+this.rng.range(1500,2600);
      const at=this.s+Math.max(200,this.speed*7),lane=this.rng.pick([-1,1]);
      if(this.route.segmentAt(at).kind==='road'&&!this.route.events.some(e=>e.kind!=='bump'&&Math.abs(e.at-at)<650)&&!this.npcs.some(n=>Math.abs(n.s-at)<80)) {
        const a=this.addNPC('normal',at,lane,18);const b=this.addNPC('normal',at-35,lane,32);
        b.phase=10;b.cruise=32; // A seeded traffic incident, visible long before reaching the player.
        const ok=this.replayEscape(0,7);
        if(ok){this.incidents++;}else for(const n of [a,b]){this.world.removeRigidBody(n.body);this.metadata.delete(n.collider.handle);this.npcs.splice(this.npcs.indexOf(n),1);}
      }
    }
  }
  tick(raw:Controls,dt=STEP) {
    if(this.failure)return;
    this.elapsed+=dt;this.rawInput={...raw};
    for(const k of ['steer','gas','brake'] as const)this.input[k]+=(raw[k]-this.input[k])*Math.min(1,dt*(k==='steer'?5:12));
    this.input.lift=raw.lift;this.input.grip=raw.grip;
    this.position.copy(this.body.translation());this.rotation.copy(this.body.rotation());this.velocity.copy(this.body.linvel());
    const projection=this.route.project(this.position,this.s,this.currentSegment.kind==='loop');
    this.s=projection.s;this.currentFrame=projection.frame;this.currentSegment=this.route.segmentAt(this.s);this.lateral=projection.lateral;this.height=projection.height;
    const localUp=UP.clone().applyQuaternion(this.rotation),forward=new Vector3(0,0,-1).applyQuaternion(this.rotation),right=new Vector3(1,0,0).applyQuaternion(this.rotation);
    if(localUp.dot(UP)<=0)this.assist=true;
    if(localUp.dot(UP)>=Math.cos(Math.PI/12))this.stableTime+=dt;else this.stableTime=0;
    if(this.stableTime>=0.4)this.assist=false;
    const seg=this.currentSegment;const loopT=this.s-seg.start;const attachedLoop=seg.kind==='loop'&&loopT<=Math.PI*36+0.2&&Math.abs(this.lateral)<5.2&&Math.abs(this.height)<2.8&&raw.grip>0&&!raw.lift;
    this.assistStatus=this.assist?(attachedLoop?'环面约束':this.fuel>0.1?'稳定中':'缺油'):'待机';
    const request=fuelRate(raw,this.assist&&!attachedLoop);
    if(request*dt>this.fuel+6*dt)this.starved=true;
    if(this.fuel>=5)this.starved=false;
    const energy=fuelStep(this.fuel,this.starved?IDLE:raw,!this.starved&&this.assist&&!attachedLoop,dt);
    if(this.starved){energy.factor=0;if(this.assist&&!attachedLoop)this.assistStatus='缺油';}
    this.fuel=energy.fuel;this.fuelFactor=energy.factor;
    this.contacts=0;const normals=new Vector3();let suspensionForce=0;
    for(const offset of this.sensorPoints) {
      const start=offset.clone().applyQuaternion(this.rotation).add(this.position);
      const ray=new RAPIER.Ray(start,localUp.clone().negate());
      const hit=this.world.castRayAndGetNormal(ray,1.06,true,undefined,undefined,this.collider,this.body,c=>this.metadata.get(c.handle)==='路面');
      if(hit) {
        const compression=0.77-hit.timeOfImpact;
        if(compression>-0.08) {
          this.contacts++;normals.add(hit.normal);
          const velocityAt=this.body.velocityAtPoint(start);const vn=new Vector3(velocityAt.x,velocityAt.y,velocityAt.z).dot(localUp);
          const force=clamp(compression*38000-vn*3300,0,40000);suspensionForce+=force;
          this.body.applyImpulseAtPoint(localUp.clone().multiplyScalar(force*dt),start,true);
        }
      }
    }
    const wasGrounded=this.grounded;this.grounded=this.contacts>=2||attachedLoop;
    this.speed=this.velocity.length();this.maxSpeed=Math.max(this.maxSpeed,Math.min(250,this.speed*3.6));
    if(this.grounded) {
      const n=normals.lengthSq()?normals.normalize():this.currentFrame.up;
      const signedSpeed=this.velocity.dot(forward);const longitudinal=Math.max(0,signedSpeed);
      const accel=this.input.gas*9.0-this.input.brake*17-0.18-longitudinal*longitudinal*0.0004;
      this.body.applyImpulse(forward.clone().multiplyScalar(1450*accel*dt),true);
      const sideVelocity=this.velocity.dot(right);const frictionLimit=Math.max(1450*6,suspensionForce*1.35)*(1+raw.grip*0.6);
      this.body.applyImpulse(right.clone().multiplyScalar(clamp(-sideVelocity*1450*7,-frictionLimit,frictionLimit)*dt),true);
      const steeringAngle=this.input.steer*0.30/(1+(longitudinal/11)**2);
      this.steering=steeringAngle;const yaw=-longitudinal/2.9*Math.tan(steeringAngle);
      const angular=new Vector3().copy(this.body.angvel());const along=angular.dot(n);
      angular.addScaledVector(n,yaw-along);this.body.setAngvel(angular,true);
      if(!wasGrounded&&this.velocity.dot(n)<-14)this.fail('落地冲击过大','尝试提早用起飞推力减缓下降');
    } else {
      const horiz=new Vector3(this.velocity.x,0,this.velocity.z);const angle=-this.input.steer*dt*0.50;
      this.steering=this.input.steer*0.30/(1+(horiz.length()/11)**2);
      horiz.applyAxisAngle(UP,angle).multiplyScalar(Math.exp(-dt*0.032));
      this.body.setLinvel({x:horiz.x,y:this.velocity.y,z:horiz.z},true);
      const ang=new Vector3().copy(this.body.angvel());ang.y=-this.input.steer*0.50;
      if(!this.assist)ang.addScaledVector(forward,-this.input.steer*dt*1.8);
      this.body.setAngvel(ang,true);
    }
    if(raw.lift&&energy.factor>0.15) {
      if(this.grounded&&!this.liftLatch)this.body.applyImpulse(UP.clone().multiplyScalar(1450*3.2),true);
      this.liftLatch=true;
      this.body.applyImpulse(UP.clone().multiplyScalar(1450*9.81*1.75*energy.factor*dt),true);
    }
    if(!raw.lift)this.liftLatch=false;
    if(raw.grip&&energy.factor>0.15&&!attachedLoop) {
      const dir=this.grounded?localUp.clone().negate():UP.clone().negate();this.body.applyImpulse(dir.multiplyScalar(1450*9.81*1.1*energy.factor*dt),true);
    }
    if(attachedLoop && energy.factor>0.15) {
      const f=this.currentFrame;const v=Math.max(0,this.velocity.dot(f.forward)+this.input.gas*9*dt-this.input.brake*17*dt-0.1*dt);
      const target=f.p.clone().addScaledVector(f.right,this.lateral).addScaledVector(f.up,0.86);
      this.body.setTranslation(target,true);this.body.setRotation(f.q,true);
      this.body.setLinvel(f.forward.clone().multiplyScalar(v).addScaledVector(f.right,this.input.steer*v*0.14),true);
      this.body.setAngvel({x:0,y:0,z:0},true);
      if(loopT>Math.PI*36-4)this.topSeen.add(seg.id);
    } else if(this.assist&&energy.factor>0.15) {
      const flat=forward.clone().setY(0);if(flat.lengthSq()<0.01)flat.copy(this.currentFrame.forward).setY(0);flat.normalize();
      const desiredUp=UP;const error=localUp.clone().cross(desiredUp);
      // At 180 degrees cross product is zero: choose a roll axis, preserving horizontal heading.
      if(localUp.dot(UP)<-0.98)error.copy(flat).multiplyScalar(1.2);
      const ang=new Vector3().copy(this.body.angvel());const headingRate=ang.dot(UP);
      const correction=error.multiplyScalar(22).addScaledVector(ang.clone().addScaledVector(UP,-headingRate),-6);
      this.body.setAngvel(ang.addScaledVector(correction,dt),true);
    }
    const v=new Vector3().copy(this.body.linvel());if(v.length()>MAX_SPEED)this.body.setLinvel(v.setLength(MAX_SPEED),true);
    this.trafficStep(dt);this.world.step();
    this.position.copy(this.body.translation());this.rotation.copy(this.body.rotation());
    let shallowFloorContact=false;
    for(const handle of this.playerHandles) {const own=this.world.getCollider(handle);this.world.contactPairsWith(own,c=>{const label=this.metadata.get(c.handle);if(label&&label!=='车身') {
      let touching=false,penetration=0;this.world.contactPair(own,c,m=>{for(let i=0;i<m.numSolverContacts();i++){touching=true;penetration=Math.max(penetration,-m.solverContactDist(i));}});
      if(touching){
        // Upright, shallow underbody brushes get a brief grace period; mirror and obstacle contacts remain strict.
        const mildFloor=label==='路面'&&(handle===this.floorHandle||handle===this.collider.handle)&&penetration<=0.1&&localUp.dot(this.currentFrame.up)>Math.cos(Math.PI/6)&&this.velocity.dot(this.currentFrame.up)>-6;
        if(mildFloor)shallowFloorContact=true;
        else this.fail(label==='路面'?'车身触地':'发生擦碰',label==='路面'?'车身重撞路面、翻覆或严重托底':`碰撞对象：${label}`);
      }
    }});}
    this.floorContactTime=shallowFloorContact?this.floorContactTime+dt:0;
    if(this.floorContactTime>0.3)this.fail('持续托底','底盘持续压在路面上超过0.3秒');
    const crashed=new Set<NPC>();
    for(const n of this.npcs)if(!n.crashed)this.world.contactPairsWith(n.collider,c=>{const other=this.npcs.find(o=>o.collider.handle===c.handle);if(!other)return;let hit=false;this.world.contactPair(n.collider,c,m=>{if(m.numSolverContacts()>0)hit=true;});if(hit){crashed.add(n);crashed.add(other);}});
    for(const n of crashed)if(!n.crashed) {n.crashed=true;n.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);n.body.enableCcd(true);const f=this.route.sample(n.s).forward;n.body.setLinvel(f.multiplyScalar(n.speed*0.45),true);n.body.setAngularDamping(3);n.body.setLinearDamping(0.7);n.signal=0;}
    // Account for physical displacement, not airborne height or projection jumps.
    const advance=this.position.clone().sub(this.lastPosition).dot(this.currentFrame.forward);this.distance+=Math.max(0,advance);this.lastPosition.copy(this.position);
    if(this.position.y<-24)this.fail('驶离道路','车辆坠落，未落入接续道路');
    const authorized=seg.kind==='jump'&&loopT>110&&loopT<310||seg.kind==='loop'&&loopT>Math.PI*36-5;
    const inFork=seg.kind==='fork'&&loopT>55&&loopT<330;
    if(inFork) {
      const wrong=this.route.sampleSegment(seg,loopT,true);if(wrong.p.distanceTo(this.position)<5.7&&loopT>165)this.fail('走错岔路','必须沿中屏标出的导航路线行驶');
    }
    if(Math.abs(this.lateral)>RAIL_X+0.1&&!authorized&&!inFork)this.fail('偏离导航路线','未获导航授权，不能跨越护栏抄近路');
    if(seg.kind==='loop'&&loopT>Math.PI*36+105&&!this.topSeen.has(seg.id))this.fail('跳过半圆环','必须经过倒挂顶端，不能直接飞往旁路');
    if(!this.validating&&this.elapsed%0.5<dt)this.ensureWorld();
  }
  dispose(){this.world.free();}
}
