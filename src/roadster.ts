import * as T from 'three';

/** Complete exterior and rear cabin, in the same body coordinates as the cockpit. */
export function makeRoadsterBody() {
  const car=new T.Group();car.name='Roadster exterior';
  const base=0.8;
  const paint=new T.MeshPhysicalMaterial({color:0xece9df,roughness:0.29,metalness:0.20,clearcoat:1,clearcoatRoughness:0.18,side:T.DoubleSide});
  const trim=new T.MeshStandardMaterial({color:0x202a2c,roughness:0.48});
  const leather=new T.MeshStandardMaterial({color:0x263234,roughness:0.92});
  const seam=new T.MeshStandardMaterial({color:0x737f7e,roughness:0.6});
  const glass=new T.MeshPhysicalMaterial({color:0x25414c,transparent:true,opacity:0.90,roughness:0.17,metalness:0.32,clearcoat:1,side:T.FrontSide,depthWrite:false});
  const insideGlass=new T.MeshStandardMaterial({color:0x96b5bb,transparent:true,opacity:0.055,roughness:0.18,side:T.BackSide,depthWrite:false});
  const alloy=new T.MeshStandardMaterial({color:0xacb5b6,metalness:0.8,roughness:0.25});
  const rubber=new T.MeshStandardMaterial({color:0x141b1e,roughness:0.93});
  const block=(size:number[],position:number[],material:T.Material,name='')=>{
    const m=new T.Mesh(new T.BoxGeometry(...size as [number,number,number]),material);m.position.set(position[0],position[1]-base,position[2]);m.name=name;car.add(m);return m;
  };
  const skin=(points:number[][],indices:number[],material:T.Material,name:string)=>{
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>[p[0],p[1]-base,p[2]]),3));g.setIndex(indices);g.computeVertexNormals();
    const m=new T.Mesh(g,material);m.name=name;car.add(m);return m;
  };
  const panel=(points:number[][],material:T.Material,name:string)=>skin(points,[0,1,2,0,2,3],material,name);
  const glazing=(points:number[][],reverse:boolean,name:string)=>{
    const m=skin(points,reverse?[0,2,1,0,3,2]:[0,1,2,0,2,3],glass,name);
    const inside=new T.Mesh(m.geometry,insideGlass);inside.name=name+' interior';car.add(inside);
  };
  const line=(points:number[][],material:T.Material,r=0.005)=>{
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],p[1]-base,p[2])));
    const m=new T.Mesh(new T.TubeGeometry(curve,32,r,6,false),material);car.add(m);return m;
  };
  const profile=new T.CatmullRomCurve3([
    [-2.35,0.72,0.67],[-2.05,0.90,0.79],[-1.48,0.99,0.92],[-0.85,0.99,0.91],
    [0.35,0.98,0.94],[1.10,1.00,1.04],[1.55,0.98,1.10],[2.05,0.91,0.92],[2.35,0.76,0.77],
  ].map(([z,w,y])=>new T.Vector3(w,y,z)));
  const samples=120;
  for(const side of [-1,1]) {
    const points:number[][]=[],indices:number[]=[];
    for(let i=0;i<=samples;i++) {
      const {x:w,y:top,z}=profile.getPoint(i/samples);
      let bottom=0.32;
      for(const axle of [-1.48,1.48])if(Math.abs(z-axle)<0.405)bottom=Math.max(bottom,0.36+Math.sqrt(0.405**2-(z-axle)**2));
      const ring=[[w-0.13,top-0.025],[w-0.065,top+0.012],[w,top-0.075],[w*0.975,bottom],[w-0.14,bottom],[w-0.14,top-0.08]];
      for(const [x,y]of ring)points.push([side*x,y,z]);
      if(i)for(let j=0;j<6;j++){const a=(i-1)*6+j,b=(i-1)*6+(j+1)%6,c=i*6+j,d=i*6+(j+1)%6;indices.push(a,c,b,b,c,d);}
    }
    for(const end of [0,samples*6])for(let j=1;j<5;j++)indices.push(end,end+j,end+j+1);
    skin(points,indices,paint,side<0?'Left solid body and wheel arches':'Right solid body and wheel arches');
    block([0.10,0.09,2.03],[side*0.94,0.30,-0.05],trim,'Side skirt');
    panel([[side*0.86,0.88,-0.67],[side*0.86,0.93,0.95],[side*0.86,0.48,0.95],[side*0.86,0.48,-0.67]],leather,'Inner door lining');
    line([[side*0.998,0.86,-0.64],[side*0.992,0.61,-0.62],[side*0.981,0.41,-0.45],[side*0.981,0.41,0.64],[side*0.995,0.71,0.89],[side*0.995,0.96,0.89]],seam);
    block([0.014,0.027,0.17],[side*0.995,0.88,0.57],trim,'Flush door handle');
    const window=[[side*0.99,0.94,-0.64],[side*0.87,1.55,-0.63],[side*0.85,1.47,0.91],[side*0.98,1.03,1.08]];
    glazing(window,side<0,'Side glass');line([...window,window[0]],trim,0.018);
    panel([[side*0.85,1.47,0.91],[side*0.79,1.45,1.08],[side*0.86,1.06,1.70],[side*0.98,1.03,1.08]],paint,'Rear buttress');
    for(const axle of [-1.48,1.48]) {
      const x=side*0.93;
      const tire=new T.Mesh(new T.CylinderGeometry(0.36,0.36,0.24,40),rubber);tire.rotation.z=Math.PI/2;tire.position.set(x,0.36-base,axle);car.add(tire);
      const disk=new T.Mesh(new T.CylinderGeometry(0.265,0.265,0.245,40),trim);disk.rotation.z=Math.PI/2;disk.position.copy(tire.position);car.add(disk);
      for(let j=0;j<10;j++) {const a=j/10*Math.PI*2;const spoke=block([0.018,0.032,0.235],[x+side*0.127,0.36+Math.sin(a)*0.115,axle+Math.cos(a)*0.115],alloy);spoke.rotation.x=-a;}
      const hub=new T.Mesh(new T.SphereGeometry(0.065,12,8),alloy);hub.scale.x=0.35;hub.position.set(x+side*0.142,0.36-base,axle);car.add(hub);
    }
  }
  // Closed front/rear decks meet the side skins; the passenger well remains open.
  panel([[-0.79,0.81,-2.08],[0.79,0.81,-2.08],[0.86,0.91,-0.85],[-0.86,0.91,-0.85]],paint,'Hood');
  panel([[-0.86,0.91,-0.85],[0.86,0.91,-0.85],[0.88,0.93,-0.64],[-0.88,0.93,-0.64]],trim,'Windshield cowl');
  panel([[-0.86,1.065,1.68],[0.86,1.065,1.68],[0.78,0.82,2.26],[-0.78,0.82,2.26]],paint,'Rear deck');
  block([1.70,0.11,0.21],[0,0.39,-2.20],trim,'Front splitter');
  block([1.45,0.22,0.23],[0,0.62,-2.27],paint,'Front bumper');
  block([1.53,0.35,0.25],[0,0.60,2.22],paint,'Rear bumper');
  block([1.54,0.14,0.17],[0,0.37,2.27],trim,'Rear diffuser');
  block([1.73,0.09,2.50],[0,0.31,0.15],trim,'Closed underbody');
  glazing([[-0.99,0.91,-0.85],[0.99,0.91,-0.85],[0.87,1.55,-0.63],[-0.87,1.55,-0.63]],true,'Windshield');
  glazing([[-0.87,1.55,-0.63],[0.87,1.55,-0.63],[0.79,1.45,1.08],[-0.79,1.45,1.08]],true,'Panoramic roof');
  glazing([[-0.79,1.45,1.08],[0.79,1.45,1.08],[0.86,1.065,1.68],[-0.86,1.065,1.68]],true,'Rear window');
  block([1.70,0.055,0.09],[0,1.05,1.62],leather,'Rear parcel shelf');
  for(const x of [-0.42,0.44]) {
    block([0.43,0.12,0.53],[x,0.47,0.20],leather,'Seat cushion');
    const seat=block([0.43,0.57,0.13],[x,0.83,0.76],leather,'Seat back');seat.rotation.x=0.14;
    block([0.28,0.19,0.13],[x,1.20,0.81],leather,'Headrest');
  }
  const red=new T.MeshBasicMaterial({color:0xf34c3d});
  for(const side of [-1,1]) {
    block([0.43,0.035,0.024],[side*0.49,0.72,-2.397],new T.MeshBasicMaterial({color:0xf6f2df}),'Headlight');
    block([0.66,0.038,0.025],[side*0.40,0.765,2.359],red,'Taillight');
  }
  block([0.29,0.032,0.024],[0,0.765,2.359],red,'Rear light bridge');
  block([0.43,0.13,0.026],[0,0.56,2.36],new T.MeshStandardMaterial({color:0x8dabae,roughness:0.5}),'Rear plate');
  car.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=true;});
  return car;
}
