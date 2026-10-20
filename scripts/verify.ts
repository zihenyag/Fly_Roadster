import { mkdirSync,writeFileSync } from 'node:fs';
import { initPhysics,Simulation } from '../src/simulation';
import { Route } from '../src/core';
import { verificationControls } from './driver';

await initPhysics();const started=Date.now();
for(let seed=0;seed<1000;seed++){const r=new Route(seed);r.extend(30000);r.validate();}
console.log('1000 seeded route generations checked to 30 km.');
const results:{seed:number;distance:number;seconds:number;failure:unknown}[]=[];
const count=Number(process.env.ROADSTER_VERIFY_SEEDS||50),target=Number(process.env.ROADSTER_VERIFY_DISTANCE||20000);
for(let seed=0;seed<count;seed++) {
  const sim=new Simulation(seed,false);
  for(let i=0;i<120*1800&&!sim.failure&&sim.s<target;i++)sim.tick(verificationControls(sim));
  const row={seed,distance:sim.s,seconds:sim.elapsed,failure:sim.failure};results.push(row);sim.dispose();
  console.log(JSON.stringify(row));
}
const report={generatedSeeds:1000,generatedDistance:30000,physicsSeedCount:count,physicsDistanceTarget:target,passed:results.filter(r=>!r.failure&&r.distance>=target).length,elapsedSeconds:(Date.now()-started)/1000,results};
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/verification.json',JSON.stringify(report,null,2));
if(report.passed!==count)process.exitCode=1;
