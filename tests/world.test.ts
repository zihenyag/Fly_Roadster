import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {Route,ROAD_HALF} from '../src/core';
import {roadDeckGeometry} from '../src/roadGeometry';
import {RoadClearance,sceneryForSegment} from '../src/scenery';

test('road underside and edges are opaque front-facing surfaces, with intentional gaps preserved',()=>{
  const vertices=new Float32Array([-7,0,0,7,0,0,-7,0,-4,7,0,-4,-7,0,-20,7,0,-20,-7,0,-24,7,0,-24]);
  const deck=roadDeckGeometry(vertices,new Uint32Array([0,1,2,1,3,2,4,5,6,5,7,6]));
  const material=new MeshBasicMaterial(),mesh=new Mesh(deck,material);mesh.updateMatrixWorld(true);
  const underside=new Raycaster(new Vector3(0,-2,-2),new Vector3(0,1,0)).intersectObject(mesh);
  assert.ok(underside.length);assert.ok(Math.abs(underside[0].point.y+.45)<1e-6);assert.ok(underside[0].face!.normal.y<-.99);
  assert.ok(new Raycaster(new Vector3(10,-.2,-2),new Vector3(-1,0,0)).intersectObject(mesh).length);
  assert.equal(new Raycaster(new Vector3(0,-2,-10),new Vector3(0,1,0)).intersectObject(mesh).length,0);
  deck.dispose();material.dispose();
});

test('the half-ring deck follows the inverted surface instead of using world-down extrusion',()=>{
  const route=new Route(0),seg=route.segments.find(s=>s.kind==='loop')!,vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=80;i++) {const f=route.sampleSegment(seg,i*Math.PI*36/80);for(const side of [-1,1])vertices.push(...f.p.clone().addScaledVector(f.right,side*ROAD_HALF).toArray());if(i){const a=(i-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
  const deck=roadDeckGeometry(new Float32Array(vertices),new Uint32Array(indices)),material=new MeshBasicMaterial(),mesh=new Mesh(deck,material);mesh.updateMatrixWorld(true);
  const f=route.sampleSegment(seg,Math.PI*36*.5),hit=new Raycaster(f.p.clone().addScaledVector(f.up,-3),f.up).intersectObject(mesh);
  assert.ok(hit.length);assert.ok(hit[0].face!.normal.dot(f.up)<-.98);deck.dispose();material.dispose();
});

test('seeded scenery is stable and its complete rock bounds clear every planned road and fork branch',()=>{
  let count=0;
  for(let seed=0;seed<40;seed++) {
    const route=new Route(seed);route.extend(12000);const clearance=new RoadClearance(route),samples:Vector3[]=[];
    for(const seg of route.segments)for(const wrong of seg.kind==='fork'?[false,true]:[false])for(let t=seg.id===0?-300:0;t<=seg.length;t+=4)samples.push(route.positionOnSegment(seg,t,wrong));
    for(const seg of route.segments.slice(0,10)) {
      const items=sceneryForSegment(route,seg,clearance);assert.deepEqual(items,sceneryForSegment(route,seg,clearance));
      for(const item of items) {count++;const radius=item.radius+ROAD_HALF+5;for(const p of samples)assert.ok((p.x-item.position.x)**2+(p.z-item.position.z)**2>radius*radius,`seed ${seed}, ${item.id}`);}
    }
  }
  assert.ok(count>4000);
});
