import { Euler, Quaternion, Vector3 } from 'three';
import { Random, ROAD_HALF, type RoadSegment, type Route } from './core';

const CELL=128, SAMPLE_STEP=12;
const ROAD_CLEARANCE=ROAD_HALF+9+SAMPLE_STEP/2;
export type SceneryItem={id:string;kind:'rock'|'tree';position:Vector3;rotation:Quaternion;scale:Vector3;radius:number};

/** Protect both fork branches and the whole flight corridor, including elevated roads. */
export class RoadClearance {
  private cells=new Map<string,{x:number;z:number}[]>();
  constructor(route:Route) {
    for(const seg of route.segments)for(const wrong of seg.kind==='fork'?[false,true]:[false]) {
      for(let t=seg.id===0?-300:0;t<seg.length+SAMPLE_STEP;t+=SAMPLE_STEP) {
        const p=route.positionOnSegment(seg,Math.min(t,seg.length),wrong);
        const key=`${Math.floor(p.x/CELL)},${Math.floor(p.z/CELL)}`;
        const list=this.cells.get(key)||[];list.push({x:p.x,z:p.z});this.cells.set(key,list);
      }
    }
  }
  isClear(position:Vector3,radius:number) {
    const reach=radius+ROAD_CLEARANCE,limit=reach*reach;
    for(let x=Math.floor((position.x-reach)/CELL);x<=Math.floor((position.x+reach)/CELL);x++)
      for(let z=Math.floor((position.z-reach)/CELL);z<=Math.floor((position.z+reach)/CELL);z++)
        for(const p of this.cells.get(`${x},${z}`)||[])if((p.x-position.x)**2+(p.z-position.z)**2<=limit)return false;
    return true;
  }
}

/** World-space placement depends on the route seed and segment, never camera height or travel direction. */
export function sceneryForSegment(route:Route,seg:RoadSegment,clearance:RoadClearance):SceneryItem[] {
  const rng=new Random(route.seed^Math.imul(seg.id+1,0x1b873593)),items:SceneryItem[]=[];
  for(let i=0,t=18;t<seg.length;t+=55,i++) {
    const f=route.sampleSegment(seg,t);
    for(const side of [-1,1]) {
      const scale=new Vector3(rng.range(15,37),rng.range(10,44),rng.range(18,39));
      const radius=Math.max(scale.x,scale.y,scale.z);
      const rotation=new Quaternion().setFromEuler(new Euler(rng.range(-.22,.22),rng.range(0,Math.PI*2),rng.range(-.18,.18)));
      const offset=ROAD_HALF+25+radius+rng.range(0,50);
      if(side>0||i%3===0)for(let attempt=0;attempt<5;attempt++) {
        const position=f.p.clone().addScaledVector(f.right,side*(offset+attempt*32)).setY(-4.4);
        if(clearance.isClear(position,radius)){items.push({id:`${seg.id}:${i}:${side}:rock`,kind:'rock',position,rotation,scale,radius});break;}
      }
      const treeOffset=ROAD_HALF+rng.range(22,65);
      if(side>0||i%2===0)for(let attempt=0;attempt<5;attempt++) {
        const position=f.p.clone().addScaledVector(f.right,side*(treeOffset+attempt*22)).setY(-1.4);
        if(clearance.isClear(position,3.2)){items.push({id:`${seg.id}:${i}:${side}:tree`,kind:'tree',position,rotation:new Quaternion(),scale:new Vector3(1,1,1),radius:3.2});break;}
      }
    }
  }
  return items;
}
