import { mkdirSync,writeFileSync,createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { initPhysics,Simulation } from '../src/simulation';
import { Autopilot } from './autopilot';

await initPhysics();
const seed=Number(process.argv[2]??0),target=Number(process.argv[3]??12000),out=`output/autoplay/${Date.now()}-seed-${seed}`;
mkdirSync(out,{recursive:true});const sim=new Simulation(seed,true),pilot=new Autopilot(),log=createWriteStream(`${out}/ticks.jsonl`);
const events:unknown[]=[];const event=(kind:string,data:unknown)=>{const row={kind,time:sim.elapsed,s:sim.s,distance:sim.distance,data};events.push(row);console.log(JSON.stringify(row));};
let milestone=0,lastSegment=-1;const seen=new Set<number>();event('start',{seed,target,traffic:true,physicsHz:120});
for(let i=0;i<120*1800&&!sim.failure&&(sim.s<target||sim.distance<target);i++){
  const controls=pilot.controls(sim);sim.tick(controls);
  const row={tick:i,t:sim.elapsed,s:sim.s,distance:sim.distance,speedKmh:sim.speed*3.6,fuel:sim.fuel,lane:pilot.lane,lateral:sim.lateral,segment:sim.currentSegment.kind,position:sim.position.toArray(),rotation:sim.rotation.toArray(),controls,failure:sim.failure};
  if(!log.write(JSON.stringify(row)+'\n'))await once(log,'drain');
  if(sim.currentSegment.id!==lastSegment){lastSegment=sim.currentSegment.id;event('segment',{id:lastSegment,kind:sim.currentSegment.kind,terrain:sim.currentSegment.terrain});}
  for(const n of sim.npcs)if(n.kind!=='normal'&&!seen.has(n.id)){seen.add(n.id);event('hazard',{id:n.id,kind:n.kind,gap:n.s-sim.s,speedKmh:n.speed*3.6});}
  if(sim.distance>=milestone){event('progress',{speedKmh:sim.speed*3.6,fuel:sim.fuel,npcs:sim.npcs.length});milestone+=1000;}
}
const result={seed,target,passed:!sim.failure&&sim.s>=target&&sim.distance>=target,s:sim.s,distance:sim.distance,seconds:sim.elapsed,failure:sim.failure,hazards:seen.size,nearby:sim.npcs.filter(n=>Math.abs(n.s-sim.s)<100).map(n=>({kind:n.kind,vehicle:n.vehicle,gap:n.s-sim.s,lane:n.lane,targetLane:n.targetLane,signal:n.signal,speedKmh:n.speed*3.6,crashed:n.crashed,pos:n.pos.toArray()})),events};
event('finish',{...result,events:undefined});writeFileSync(`${out}/report.json`,JSON.stringify(result,null,2));log.end();await once(log,'finish');sim.dispose();if(!result.passed)process.exitCode=1;
