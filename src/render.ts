import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Simulation, NPC, Patch } from './simulation';
import { UP, eventText, clamp, LANE_WIDTH, ROAD_HALF, RAIL_X, type RoadFrame } from './core';
import { VEHICLES,centerHeight } from './vehicles';

const mat=(color:number,roughness=0.65,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const DARK=mat(0x151d1d),GLASS=mat(0x334d55,0.16,0.4),WHITE=mat(0xe9e5dc,0.25,0.45),RUBBER=mat(0x111717);
const ROAD=mat(0x515655,0.97),RAIL=mat(0xa4aaa2,0.42,0.5),LINE=new T.MeshBasicMaterial({color:0xe9e7d8});
const boxGeometry=new T.BoxGeometry(1,1,1);
function box(parent:T.Object3D,size:number[],pos:number[],material:T.Material) {const m=new T.Mesh(boxGeometry,material);m.scale.set(size[0],size[1],size[2]);m.position.set(pos[0],pos[1],pos[2]);parent.add(m);return m;}
function rounded(w:number,h:number,d:number,r:number) {
  const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  return new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:0.012,bevelThickness:0.012,curveSegments:8});
}
function pill(parent:T.Object3D,w:number,h:number,d:number,pos:number[],material:T.Material) {const m=new T.Mesh(rounded(w,h,d,Math.min(w,h)*0.18),material);m.position.set(...pos as [number,number,number]);parent.add(m);return m;}
function roundedFace(w:number,h:number,r:number) {
  const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  const geo=new T.ShapeGeometry(s,10),p=geo.getAttribute('position'),uv=geo.getAttribute('uv');for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+w/2)/w,(p.getY(i)+h/2)/h);return geo;
}
function batchStatic(g:T.Group,except:T.Mesh[]=[]) {
  const groups=new Map<T.Material,T.BufferGeometry[]>();
  for(const child of [...g.children])if(child instanceof T.Mesh&&!(child instanceof T.InstancedMesh)&&!except.includes(child)&&!Array.isArray(child.material)) {
    child.updateMatrix();const geom=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix);
    const list=groups.get(child.material)||[];list.push(geom);groups.set(child.material,list);g.remove(child);if(child.geometry!==boxGeometry)child.geometry.dispose();
  }
  for(const [material,geos]of groups){const merged=mergeGeometries(geos,false);if(merged)g.add(new T.Mesh(merged,material));for(const geo of geos)geo.dispose();}
}
export function makeCar(n:NPC) {
  const g=new T.Group(),spec=VEHICLES[n.vehicle],paint=mat(n.color,0.26,0.45),metal=mat(0x85918d,0.35,0.8);
  const base=centerHeight(n.vehicle),w=spec.width,l=spec.length,h=spec.height;
  const truck=['smallTruck','lorry','tractor'].includes(n.vehicle),van=['van','mpv'].includes(n.vehicle);
  const part=(size:number[],p:number[],m:T.Material)=>box(g,size,[p[0],p[1]-base,p[2]],m);
  const wheel=(z:number,r=spec.wheel)=>{for(const side of [-1,1]) {
    const x=side*(w/2-0.08),tire=new T.Mesh(new T.CylinderGeometry(r,r,0.22,24),RUBBER);tire.rotation.z=Math.PI/2;tire.position.set(x,r-base,z);g.add(tire);
    const rim=new T.Mesh(new T.CylinderGeometry(r*0.62,r*0.62,0.235,12),metal);rim.rotation.z=Math.PI/2;rim.position.copy(tire.position);g.add(rim);
  }};
  if(truck) {
    const cabLength=n.vehicle==='smallTruck'?1.8:2.6,front=-l/2;
    part([w*0.82,0.25,l-0.35],[0,0.61,0],DARK);
    pill(g,w-0.08,n.vehicle==='smallTruck'?1.55:2.12,cabLength,[0,(n.vehicle==='smallTruck'?1.32:1.73)-base,front],paint);
    part([w-0.25,n.vehicle==='smallTruck'?0.65:0.88,0.035],[0,n.vehicle==='smallTruck'?1.75:2.30,front-0.02],GLASS);
    for(const side of [-1,1]){part([0.04,0.75,1.15],[side*(w/2-0.015),2.15,front+1.35],GLASS);part([0.15,0.40,0.22],[side*(w/2+0.08),1.92,front+0.25],DARK);part([0.30,0.12,0.28],[side*0.82,0.55,front+0.50],metal);}
    part([w*0.73,0.45,0.035],[0,1.10,front-0.025],DARK);
    for(let j=0;j<5;j++)part([w*0.70,0.025,0.04],[0,0.95+j*0.075,front-0.045],metal);
    const cargoStart=front+cabLength+(n.vehicle==='tractor'?0.6:0.12),cargoLength=l/2-cargoStart-0.15;
    const cargo=mat(n.vehicle==='tractor'?0xc4c9bf:n.vehicle==='lorry'?0x9faeaa:0xe6e3d8,0.8,0.15);
    part([w-0.05,h-0.85,cargoLength],[0,(h+0.85)/2,cargoStart+cargoLength/2],cargo);
    for(let z=cargoStart+0.3;z<l/2;z+=0.62)for(const side of [-1,1])part([0.025,h-0.98,0.035],[side*(w/2-0.015),(h+0.85)/2,z],metal);
    part([0.04,h-1.05,0.04],[0,(h+0.85)/2,l/2-0.10],metal);
    for(const side of [-1,1])part([0.025,h-1.25,0.06],[side*w*0.23,(h+0.85)/2,l/2-0.08],metal);
    wheel(front+1.2);wheel(l/2-1.0);if(n.vehicle!=='smallTruck')wheel(l/2-2.15);if(n.vehicle==='tractor')wheel(front+3.6);
  } else {
    const bodyHeight=van?1.06:0.53,bodyY=van?0.91:0.64;
    pill(g,w-0.06,bodyHeight,l,[0,bodyY-base,-l/2],paint);
    const cabinLength=van?l*0.72:l*0.48,cabinStart=van?-l/2+0.65:-0.85;
    pill(g,w*0.84,van?0.79:0.61,cabinLength,[0,(van?1.70:1.10)-base,cabinStart],GLASS);
    part([w*0.85,0.07,cabinLength*0.83],[0,h-0.07,cabinStart+cabinLength*0.5],paint);
    const screen=part([w*0.81,van?0.70:0.50,0.045],[0,van?1.67:1.08,cabinStart-0.015],GLASS);screen.rotation.x=van?-0.1:-0.3;
    for(const side of [-1,1]) {
      for(let z=cabinStart+0.45;z<cabinStart+cabinLength-0.2;z+=0.85)part([0.065,van?0.78:0.57,0.045],[side*w*0.425,van?1.70:1.10,z],paint);
      part([0.17,0.11,0.24],[side*(w/2+0.025),van?1.38:1.0,-0.85],paint);
      part([0.20,0.025,0.04],[side*w*0.505,0.90,0.30],metal);
    }
    wheel(-l*0.31);wheel(l*0.31);
    if(n.vehicle==='sports'){part([w*0.90,0.035,0.18],[0,0.96,l/2-0.12],DARK);}
  }
  const front=-l/2-0.025,back=l/2+0.025,head=new T.MeshBasicMaterial({color:0xf8efd4}),tail=new T.MeshBasicMaterial({color:0xf63c2c});
  for(const side of [-1,1]){part([w*0.22,0.07,0.04],[side*w*0.32,truck?0.84:0.70,front],head);part([w*0.22,0.075,0.04],[side*w*0.32,truck?0.63:0.70,back],tail);}
  part([0.46,0.15,0.03],[0,truck?0.58:0.49,back+0.01],mat(0xb4c9ad));
  const signals=[-1,1].map(side=>part([0.15,0.075,0.05],[side*w*0.40,truck?0.63:0.70,back+0.03],new T.MeshBasicMaterial({color:0xffad30})));signals.forEach(s=>s.visible=false);
  g.userData.signals=signals;batchStatic(g,signals);return g;
}

type Mirror={camera:T.PerspectiveCamera;target:T.WebGLRenderTarget;offset:T.Vector3;aim:T.Vector3;mesh:T.Mesh};
export class View {
  renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(70,1,0.06,2300);
  cockpit=new T.Group();shell=new T.Group();wheel=new T.Group();mirrors:Mirror[]=[];
  roads=new Map<number,T.Group>();cars=new Map<number,T.Group>();decor=new T.Group();
  driverCanvas=document.createElement('canvas');navCanvas=document.createElement('canvas');
  driverTexture:T.CanvasTexture;navTexture:T.CanvasTexture;
  private lastMirror=-1;private lastScreens=-1;private environmentCenter=new T.Vector3(1e6,0,0);
  quality:'high'|'low'='high';fps=60;private avgTime=16.7;private lastRender=performance.now();
  constructor(public canvas:HTMLCanvasElement,public sim:Simulation) {
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.16;
    this.scene.background=new T.Color(0xb7d4dc);this.scene.fog=new T.FogExp2(0xb6cbd0,0.00078);
    this.scene.add(new T.HemisphereLight(0xf9f1dd,0x667c76,2.7));
    const sun=new T.DirectionalLight(0xffe6bd,3.0);sun.position.set(-300,500,150);this.scene.add(sun);
    const sea=new T.Mesh(new T.PlaneGeometry(30000,30000),mat(0x699ba5,0.32,0.12));sea.rotation.x=-Math.PI/2;sea.position.y=-17;this.scene.add(sea);
    const land=new T.Mesh(new T.PlaneGeometry(30000,30000),mat(0xaaa68e,0.95));land.rotation.x=-Math.PI/2;land.position.set(15030,-2,0);this.scene.add(land);
    const island=new T.Mesh(new T.ConeGeometry(720,190,9),mat(0x9eafa6));island.position.set(-1800,-6,-2900);this.scene.add(island);
    this.scene.add(this.decor);
    this.driverCanvas.width=960;this.driverCanvas.height=400;this.navCanvas.width=800;this.navCanvas.height=650;
    this.driverTexture=new T.CanvasTexture(this.driverCanvas);this.navTexture=new T.CanvasTexture(this.navCanvas);
    this.driverTexture.colorSpace=this.navTexture.colorSpace=T.SRGBColorSpace;
    this.makeShell();this.makeCockpit();this.resize();this.syncWorld();
  }
  setSimulation(sim:Simulation) {
    this.sim=sim;for(const g of this.roads.values())this.disposeGroup(g);for(const g of this.cars.values())this.disposeGroup(g);this.roads.clear();this.cars.clear();this.environmentCenter.set(1e6,0,0);this.syncWorld();
  }
  private disposeGroup(g:T.Group) {this.scene.remove(g);g.traverse(o=>{if(o instanceof T.Mesh&&o.geometry!==boxGeometry)o.geometry.dispose();});}
  private screen(texture:T.Texture,w:number,h:number,pos:number[],tilt=0) {
    const mount=new T.Group();mount.position.set(...pos as [number,number,number]);mount.rotation.x=tilt;this.cockpit.add(mount);
    const casing=new T.Mesh(rounded(w+0.022,h+0.022,0.018,0.028),DARK);casing.position.z=-0.03;mount.add(casing);
    const m=new T.Mesh(roundedFace(w,h,0.020),new T.MeshBasicMaterial({map:texture,toneMapped:false}));m.position.z=0.001;mount.add(m);
    box(mount,[w*0.75,0.08,0.14],[0,-h/2-0.035,-0.12],DARK);return m;
  }
  private makeShell() {
    const g=this.shell;this.scene.add(g);const base=0.80;
    const sections=[[-2.35,0.69,0.49],[-2.02,0.91,0.67],[-1.22,0.99,0.73],[-0.65,1.00,0.78],[0.70,0.98,0.91],[1.40,0.98,1.02],[2.12,0.89,0.86],[2.35,0.70,0.65]];
    for(const side of [-1,1]) {
      const vertices:number[]=[],indices:number[]=[];
      for(const [z,w,y]of sections){vertices.push(side*(w-0.10),y-base,z,side*w,y-0.10-base,z,side*w*0.94,0.34-base,z);}
      for(let i=0;i<sections.length-1;i++)for(let j=0;j<2;j++){const a=i*3+j,b=a+3;indices.push(a,b,a+1,a+1,b,b+1);}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const m=new T.Mesh(geo,new T.MeshStandardMaterial({color:0xe8e6dc,roughness:0.25,metalness:0.40,side:T.DoubleSide}));g.add(m);
      box(g,[0.12,0.13,2.2],[side*0.97,0.30-base,0],DARK);
      const rearPillar=box(g,[0.065,0.65,0.065],[side*0.91,1.25-base,1.16],DARK);rearPillar.rotation.x=0.12;
      const doorGlass=new T.Mesh(new T.PlaneGeometry(1.78,0.55),new T.MeshStandardMaterial({color:0xabc6c6,transparent:true,opacity:0.07,roughness:0.12,side:T.DoubleSide,depthWrite:false}));doorGlass.rotation.y=side*Math.PI/2;doorGlass.position.set(side*0.99,1.16-base,0.22);g.add(doorGlass);
      for(const z of [-1.48,1.48]) {const tire=new T.Mesh(new T.CylinderGeometry(0.36,0.36,0.24,32),RUBBER);tire.rotation.z=Math.PI/2;tire.position.set(side*0.94,0.36-base,z);g.add(tire);const rim=new T.Mesh(new T.CylinderGeometry(0.25,0.25,0.25,12),mat(0x9ca6a3,0.25,0.85));rim.rotation.z=Math.PI/2;rim.position.copy(tire.position);g.add(rim);}
    }
    const hood=box(g,[1.72,0.12,1.25],[0,0.65-base,-1.70],WHITE);hood.rotation.x=-0.06;
    pill(g,1.72,0.32,0.32,[0,0.56-base,-2.32],WHITE);pill(g,1.74,0.28,0.28,[0,0.73-base,2.08],WHITE);
    box(g,[1.50,0.10,0.16],[0,0.44-base,-2.35],DARK);box(g,[1.60,0.10,0.18],[0,0.43-base,2.24],DARK);
    box(g,[1.71,0.035,0.24],[0,1.0-base,2.1],DARK);
    const rearDeck=box(g,[1.72,0.12,0.88],[0,0.95-base,1.60],WHITE);rearDeck.rotation.x=0.08;
    box(g,[1.85,0.10,2.6],[0,0.32-base,0.20],DARK);
    for(const x of [-0.42,0.44]){pill(g,0.48,0.12,0.58,[x,0.45-base,0.15],DARK);const back=pill(g,0.47,0.70,0.12,[x,0.86-base,0.87],DARK);back.rotation.x=0.14;pill(g,0.31,0.20,0.10,[x,1.25-base,0.95],DARK);}
    const roof=new T.Mesh(new T.PlaneGeometry(1.80,1.85),new T.MeshStandardMaterial({color:0x789197,transparent:true,opacity:0.24,roughness:0.10,metalness:0.1,side:T.DoubleSide,depthWrite:false}));roof.rotation.x=Math.PI/2;roof.position.set(0,1.61-base,0.23);g.add(roof);
    const windGeo=new T.BufferGeometry();windGeo.setAttribute('position',new T.Float32BufferAttribute([-1.03,0.67-base,-1.20,1.03,0.67-base,-1.20,-0.93,1.60-base,-0.70,0.93,1.60-base,-0.70],3));windGeo.setIndex([0,1,2,1,3,2]);windGeo.computeVertexNormals();const glass=new T.MeshStandardMaterial({color:0xb1d1d2,transparent:true,opacity:0.035,roughness:0.06,side:T.DoubleSide,depthWrite:false});g.add(new T.Mesh(windGeo,glass));
    const rearWindow=new T.Mesh(new T.PlaneGeometry(1.70,0.53),glass);rearWindow.position.set(0,1.29-base,1.15);rearWindow.rotation.x=-0.14;g.add(rearWindow);
    for(const side of [-1,1]){box(g,[0.46,0.04,0.035],[side*0.62,0.67-base,-2.35],new T.MeshBasicMaterial({color:0xf2eee0}));box(g,[0.62,0.04,0.04],[side*0.54,0.81-base,2.36],new T.MeshBasicMaterial({color:0xf44d3b}));}
    g.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=true;});
  }
  private makeCockpit() {
    this.scene.add(this.cockpit);
    // Bodywork is visible from the driver's seat. The main camera is never a chase camera.
    const hood=pill(this.cockpit,1.86,0.16,1.3,[0,0.28,-2.5],WHITE);hood.rotation.x=-0.035;
    box(this.cockpit,[0.07,0.018,0.95],[-0.61,0.4,-1.96],mat(0x9da7a4,0.4,0.7));box(this.cockpit,[0.07,0.018,0.95],[0.61,0.4,-1.96],mat(0x9da7a4,0.4,0.7));
    const dash=pill(this.cockpit,1.96,0.46,0.36,[0,0.27,-1.22],DARK);dash.rotation.x=-0.09;
    box(this.cockpit,[1.84,0.035,0.04],[0,0.14,-0.68],mat(0x66706b,0.45,0.7));
    const console=pill(this.cockpit,0.31,0.5,0.95,[0.36,-0.11,-0.65],DARK);console.rotation.x=-0.14;
    for(const x of [-1.1,1.1]) {
      const door=box(this.cockpit,[0.12,0.65,2.25],[Math.sign(x)*0.94,0.16,-0.11],DARK);door.rotation.z=x>0?-0.04:0.04;
      const side=Math.sign(x),bottom=new T.Vector3(side*1.03,0.27,-1.20),top=new T.Vector3(side*0.93,1.20,-0.70);
      const pillar=box(this.cockpit,[0.055,bottom.distanceTo(top),0.065],bottom.clone().lerp(top,0.5).toArray(),mat(0x282e2b));pillar.quaternion.setFromUnitVectors(UP,top.sub(bottom).normalize());
      box(this.cockpit,[0.10,0.08,0.45],[Math.sign(x)*0.89,0.36,-0.1],mat(0x65716c,0.4,0.6));
    }
    box(this.cockpit,[1.90,0.035,0.075],[0,1.20,-0.70],DARK);
    box(this.cockpit,[0.035,0.065,0.035],[-0.02,1.175,-0.83],DARK);
    this.screen(this.driverTexture,0.67,0.30,[-0.39,0.59,-0.68],-0.10);
    this.screen(this.navTexture,0.60,0.50,[0.34,0.48,-0.67],-0.09);
    this.wheel.position.set(-0.39,0.22,-0.56);this.wheel.scale.setScalar(0.68);this.wheel.rotation.x=-0.22;this.cockpit.add(this.wheel);
    const rimPath=new T.CatmullRomCurve3([[-0.18,0.16,0],[-0.28,0.11,0],[-0.29,-0.10,0],[-0.20,-0.19,0],[0,-0.20,0],[0.20,-0.19,0],[0.29,-0.10,0],[0.28,0.11,0],[0.18,0.16,0]].map(p=>new T.Vector3(...p as [number,number,number])));
    this.wheel.add(new T.Mesh(new T.TubeGeometry(rimPath,56,0.031,12,false),RUBBER));
    for(const side of [-1,1]){const spoke=box(this.wheel,[0.23,0.055,0.045],[side*0.17,-0.015,0],DARK);spoke.rotation.z=side*0.12;}
    box(this.wheel,[0.055,0.15,0.045],[0,-0.13,0],DARK);
    box(this.wheel,[0.040,0.022,0.064],[0,-0.20,0.003],new T.MeshBasicMaterial({color:0xff8050}));
    pill(this.wheel,0.18,0.125,0.03,[0,0,-0.006],mat(0x333c38));
    box(this.wheel,[0.035,0.11,0.014],[0,-0.015,0.036],mat(0xd1d9d0,0.4,0.7));box(this.wheel,[0.092,0.016,0.014],[0,0.04,0.036],mat(0xd1d9d0,0.4,0.7));
    for(const side of [-1,1])box(this.cockpit,[0.23,0.055,0.12],[side*1.12,0.97,-0.98],DARK);
    this.makeMirror([-1.24,1.00,-0.84],0.34,0.19,[-1.24,0.60,-0.84],[-0.15,-0.035,1],true);
    this.makeMirror([1.24,1.00,-0.84],0.34,0.19,[1.24,0.60,-0.84],[0.15,-0.035,1],true);
    this.makeMirror([-0.02,1.08,-0.76],0.42,0.12,[-0.02,0.68,-0.76],[0,-0.06,1],false);
  }
  private makeMirror(pos:number[],w:number,h:number,offset:number[],aim:number[],side:boolean) {
    const target=new T.WebGLRenderTarget(side?512:640,side?288:180);target.texture.colorSpace=T.SRGBColorSpace;
    const camera=new T.PerspectiveCamera(side?52:42,w/h,0.15,1000);
    pill(this.cockpit,w+0.045,h+0.045,0.05,[pos[0],pos[1],pos[2]-0.075],mat(0x192321,0.3,0.3));
    const mirrorMat=new T.MeshBasicMaterial({map:target.texture,toneMapped:false});target.texture.wrapS=T.RepeatWrapping;target.texture.repeat.x=-1;target.texture.offset.x=1;
    const mesh=new T.Mesh(roundedFace(w,h,0.024),mirrorMat);mesh.position.set(...pos as [number,number,number]);this.cockpit.add(mesh);
    this.mirrors.push({camera,target,offset:new T.Vector3(...offset as [number,number,number]),aim:new T.Vector3(...aim as [number,number,number]),mesh});
  }
  private makeRoad(p:Patch) {
    const g=new T.Group();const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(p.vertices,3));geo.setIndex(new T.BufferAttribute(p.indices,1));geo.computeVertexNormals();
    const uv=new Float32Array(p.vertices.length/3*2);for(let i=0;i<uv.length/4;i++){uv[i*4]=0;uv[i*4+1]=i/3;uv[i*4+2]=1;uv[i*4+3]=i/3;}geo.setAttribute('uv',new T.BufferAttribute(uv,2));
    const road=new T.Mesh(geo,ROAD);g.add(road);
    const seg=p.seg,step=8;
    const rails:number[]=[],matrices:T.Matrix4[]=[];const railMatrices:T.Matrix4[]=[];
    for(let t=seg.id===0?-300:0;t<seg.length;t+=step) {
      const f=this.sim.route.sampleSegment(seg,t,p.wrong);if(!f.exists)continue;
      for(const x of [-LANE_WIDTH*1.5,LANE_WIDTH*1.5]) {const line=box(g,[0.11,0.018,step+0.05],f.p.clone().addScaledVector(f.right,x).addScaledVector(f.up,0.025).toArray(),LINE);line.quaternion.copy(f.q);}
      if(Math.floor((seg.start+t)/8)%2===0)for(const x of [-LANE_WIDTH/2,LANE_WIDTH/2]) {
        const v=f.p.clone().addScaledVector(f.right,x).addScaledVector(f.up,0.03);matrices.push(new T.Matrix4().compose(v,f.q,new T.Vector3(0.11,0.018,3.5)));
      }
      if(!(seg.kind==='fork'&&t>40&&t<300))for(const x of [-RAIL_X,RAIL_X]) {
        const v=f.p.clone().addScaledVector(f.right,x).addScaledVector(f.up,0.70);railMatrices.push(new T.Matrix4().compose(v,f.q,new T.Vector3(0.16,0.22,step+0.1)));
        const post=box(g,[0.1,0.9,0.1],f.p.clone().addScaledVector(f.right,x).addScaledVector(f.up,0.40).toArray(),RAIL);post.quaternion.copy(f.q);
      }
    }
    if(matrices.length) {const m=new T.InstancedMesh(boxGeometry,LINE,matrices.length);matrices.forEach((a,i)=>m.setMatrixAt(i,a));g.add(m);}
    if(railMatrices.length){const m=new T.InstancedMesh(boxGeometry,RAIL,railMatrices.length);railMatrices.forEach((a,i)=>m.setMatrixAt(i,a));g.add(m);}
    if(seg.kind==='jump') {const f=this.sim.route.sampleSegment(seg,155);const m=box(g,[RAIL_X*2+1,1.2,0.32],f.p.clone().addScaledVector(f.up,0.6).toArray(),mat(0xe9c493));m.quaternion.copy(f.q);
      for(let x=-6;x<=6;x+=1.5){const stripe=box(g,[0.65,0.6,0.35],f.p.clone().addScaledVector(f.right,x).addScaledVector(f.up,0.6).toArray(),DARK);stripe.quaternion.copy(f.q);}
    }
    if(seg.kind!=='road') {
      const signAt=seg.kind==='loop'?0:seg.kind==='jump'?75:25;const f=this.sim.route.sampleSegment(seg,signAt);
      const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d')!;ctx.fillStyle='#24493f';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#e4eee1';ctx.lineWidth=5;ctx.strokeRect(9,9,494,142);ctx.fillStyle='#fff';ctx.font='bold 45px sans-serif';ctx.textAlign='center';ctx.fillText(seg.kind==='loop'?'半圆环 / LOOP':seg.kind==='jump'?'飞跃 / CROSSING':'道路分岔 / FORK',256,67);ctx.font='32px sans-serif';ctx.fillText(`${seg.side<0?'↖ 左侧':'右侧 ↗'}  ${seg.kind==='loop'?'160—185 km/h':''}`,256,119);
      const sign=new T.Mesh(new T.PlaneGeometry(5.12,1.6),new T.MeshBasicMaterial({map:new T.CanvasTexture(c)}));sign.position.copy(f.p).addScaledVector(f.up,5);sign.quaternion.copy(f.q);g.add(sign);
      for(const x of [-4,4]){const post=box(g,[0.12,5,0.12],f.p.clone().addScaledVector(f.right,x).addScaledVector(f.up,2.5).toArray(),RAIL);post.quaternion.copy(f.q);}
    }
    batchStatic(g);this.roads.set(p.id,g);this.scene.add(g);
  }
  syncWorld() {
    for(const patch of this.sim.patches)if(!this.roads.has(patch.id))this.makeRoad(patch);
    const ids=new Set(this.sim.patches.map(p=>p.id));for(const [id,g]of this.roads)if(!ids.has(id)){this.disposeGroup(g);this.roads.delete(id);}
    const nids=new Set(this.sim.npcs.map(n=>n.id));for(const [id,g]of this.cars)if(!nids.has(id)){this.disposeGroup(g);this.cars.delete(id);}
    for(const n of this.sim.npcs) {
      let g=this.cars.get(n.id);if(!g){g=makeCar(n);this.cars.set(n.id,g);this.scene.add(g);}
      g.position.copy(n.pos);g.quaternion.copy(n.q);
      const signals=g.userData.signals as T.Mesh[];signals.forEach((s,i)=>s.visible=!!n.signal&&Math.floor(this.sim.elapsed*2)%2===0&&(i===0?n.targetLane<n.lane:n.targetLane>n.lane));
    }
    if(this.sim.position.distanceTo(this.environmentCenter)>600)this.makeEnvironment();
  }
  private makeEnvironment() {
    this.environmentCenter.copy(this.sim.position);this.decor.clear();
    const rockMat=mat(0xb0ab95,0.98),treeMat=mat(0x385649,0.98),bark=mat(0x6c6d58);
    for(let i=0;i<90;i++) {
      const s=Math.max(0,this.sim.s-400+i*25);const f=this.sim.route.sample(s);if(!f.exists)continue;
      const side=i%3===0?-1:1;const offset=side*(72+(Math.sin(i*63.5)+1)*46);const p=f.p.clone().addScaledVector(f.right,offset);p.y=-1.4;
      if(side>0||i%4===0) {const m=new T.Mesh(new T.IcosahedronGeometry(1,0),rockMat);m.position.copy(p);m.scale.set(15+i%8*4,8+i%7*8,22+i%4*7);m.position.y-=3;m.rotation.set(i,0.3*i,i*0.1);this.decor.add(m);}
      if(side>0) {const tree=new T.Group();box(tree,[0.45,6,0.45],[0,2,0],bark);const crown=new T.Mesh(new T.ConeGeometry(3.2,11,7),treeMat);crown.position.y=7.3;tree.add(crown);tree.position.copy(p).addScaledVector(f.right,-5);this.decor.add(tree);}
    }
  }
  private drawDriver() {
    const s=this.sim,c=this.driverCanvas.getContext('2d')!;c.fillStyle='#101b1c';c.fillRect(0,0,960,400);
    c.fillStyle='#9db2aa';c.font='22px sans-serif';c.fillText('ROADSTER',36,40);c.textAlign='right';c.fillText(`${(s.distance/1000).toFixed(2)} km`,920,40);c.textAlign='center';
    c.fillStyle='#f0f0e5';c.font='300 156px Arial';c.fillText(`${Math.round(s.speed*3.6)}`,480,188);c.fillStyle='#9db2aa';c.font='21px sans-serif';c.fillText('km/h',480,224);
    c.textAlign='left';c.font='23px sans-serif';c.fillStyle=s.fuel<20?'#ff8c57':'#bdc9bb';c.fillText('推进燃料',35,102);c.font='bold 39px monospace';c.fillText(`${Math.floor(s.fuel)}%`,35,153);
    c.fillStyle='#324440';c.fillRect(35,172,185,9);c.fillStyle=s.fuel<20?'#ff8c57':'#bdd6a3';c.fillRect(35,172,185*s.fuel/100,9);
    c.fillStyle=s.speed*3.6<60?'#ffbd76':'#85998f';c.font='20px sans-serif';c.fillText(s.speed*3.6<60?'低速 · 留意后方':'最高 250 km/h',35,221);
    c.textAlign='right';c.fillStyle=s.grounded?'#9faf9f':'#ffac70';c.font='bold 26px sans-serif';c.fillText(s.grounded?'贴地行驶':'空中飞行',920,105);
    c.fillStyle='#99aaa1';c.font='21px sans-serif';c.fillText(`飞行辅助`,920,151);c.fillStyle=s.assistStatus==='稳定中'?'#ffac70':s.assistStatus==='缺油'?'#ff6654':'#c0cfc2';c.font='bold 25px sans-serif';c.fillText(s.assistStatus,920,187);
    c.fillStyle='#2c3c39';c.fillRect(35,254,890,1);
    const status=(name:string,value:number,x:number)=>{c.textAlign='left';c.font='23px sans-serif';c.fillStyle=value?'#ffac70':'#83978c';c.fillText(name,x,300);c.fillStyle=value?(s.fuelFactor<0.2?'#ff6654':'#f4e9d1'):'#99aaa0';c.font='bold 30px sans-serif';c.fillText(value?(s.fuelFactor<0.2?'缺油':value>0.5?'重档 ↑↑':'轻档 ↑'):'未使用',x,348);};
    status('起飞',s.rawInput.lift,42);status('抓地',s.rawInput.grip,285);
    c.fillStyle='#83978c';c.font='23px sans-serif';c.fillText('方向盘 / 踏板',575,300);c.fillStyle='#dce3d5';c.font='24px monospace';const degrees=Math.round(T.MathUtils.radToDeg(s.steering*16));c.fillText(`${degrees<0?'左':degrees>0?'右':''}${Math.abs(degrees)}° · ${s.rawInput.brake?'刹车':s.rawInput.gas?'油门':'滑行'}`,575,348);
    this.driverTexture.needsUpdate=true;
  }
  private drawNavigation() {
    const c=this.navCanvas.getContext('2d')!,s=this.sim;const events=s.route.nextEvents(s.s);const e=events[0];
    c.fillStyle='#e9e8dc';c.fillRect(0,0,800,650);
    c.strokeStyle='#d5d7ca';c.lineWidth=1;for(let i=-800;i<1400;i+=65){c.beginPath();c.moveTo(i,170);c.lineTo(i-200,520);c.stroke();c.beginPath();c.moveTo(0,i);c.lineTo(800,i+110);c.stroke();}
    const heading=new T.Vector3(0,0,-1).applyQuaternion(s.rotation).setY(0).normalize();if(heading.lengthSq()<0.01)heading.copy(s.currentFrame.forward).setY(0).normalize();const right=heading.clone().cross(UP);
    const project=(p:T.Vector3)=>{const d=p.clone().sub(s.position);return [400+d.dot(right)*0.72,465-d.dot(heading)*0.30];};
    const line=(offset:number,color:string,width:number)=>{c.beginPath();for(let i=-120;i<=1400;i+=12){const f=s.route.sample(Math.max(0,s.s+i));const p=f.p.clone().addScaledVector(f.right,offset);const [x,y]=project(p);if(i===-120)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();};
    c.save();c.beginPath();c.rect(0,169,800,355);c.clip();line(0,'#c6cabe',34);line(0,'#faf8ed',23);line(0,'#f47643',8);
    for(const ev of events){const [x,y]=project(s.route.sample(ev.at).p);c.fillStyle='#254c40';c.beginPath();c.arc(x,y,15,0,Math.PI*2);c.fill();c.fillStyle='#fff';c.textAlign='center';c.font='bold 17px sans-serif';c.fillText(ev.kind==='loop'?'↻':ev.kind==='fork'?'Y':ev.kind==='jump'?'↑':'~',x,y+6);}
    c.translate(400,465);c.beginPath();c.moveTo(0,-19);c.lineTo(13,14);c.lineTo(0,8);c.lineTo(-13,14);c.closePath();c.fillStyle='#223f35';c.fill();c.restore();
    c.fillStyle='#183d31';c.fillRect(0,0,800,170);c.fillStyle='#f7f4e7';c.font='bold 42px sans-serif';c.textAlign='left';
    const dist=e?Math.max(0,e.at-s.s):0;c.fillText(e?(dist>=1000?`${(dist/1000).toFixed(1)} km`:`${Math.round(dist)} m`):'继续直行',34,62);
    c.font='26px sans-serif';c.fillStyle='#c8d7c3';c.fillText(e?eventText(e):'沿当前道路前进',34,115);
    c.textAlign='right';c.fillStyle='#f49c63';c.font='bold 74px sans-serif';c.fillText(e?(e.kind==='loop'?'↻':e.kind==='jump'?'↗':e.side<0?'↖':'↗'):'↑',750,107);
    c.textAlign='left';c.fillStyle='#4b5e50';c.font='21px sans-serif';c.fillText('ROUTE / 后续路况',28,557);
    c.fillStyle='#263f32';c.font='24px sans-serif';c.fillText(e?(e.reserve?`建议保留 ${e.reserve}% 燃料 · ${e.kind==='loop'?'160–185 km/h 入环':'准备起飞跨栏'}`:'按导航选择车道'):'保持路线 · 留意三面后视镜',28,594);
    c.fillStyle='#6d796b';c.font='20px sans-serif';c.fillText(events[1]?`${Math.round(events[1].at-s.s)} m 后 ${eventText(events[1])}`:'前方路况良好',28,630);
    this.navTexture.needsUpdate=true;
  }
  resize(){const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(56))/this.camera.aspect));this.camera.updateProjectionMatrix();}
  render(now=performance.now()) {
    const delta=now-this.lastRender;this.avgTime=this.avgTime*0.95+delta*0.05;this.fps=Math.round(1000/Math.max(1,this.avgTime));this.lastRender=now;
    this.syncWorld();const s=this.sim;
    this.cockpit.position.copy(s.position).add(new T.Vector3(0,-0.4,0).applyQuaternion(s.rotation));this.cockpit.quaternion.copy(s.rotation);
    this.shell.position.copy(s.position);this.shell.quaternion.copy(s.rotation);
    const shake=s.grounded?Math.sin(s.elapsed*30)*Math.min(0.008,s.speed*0.00008):0;
    this.camera.position.copy(new T.Vector3(-0.39,0.63+shake,0.42).applyQuaternion(s.rotation).add(s.position));this.camera.quaternion.copy(s.rotation).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-0.12));
    this.wheel.rotation.z=-s.steering*16;
    if(now-this.lastScreens>50){this.drawDriver();this.drawNavigation();this.lastScreens=now;}
    if(now-this.lastMirror>(this.quality==='high'?33:66)) {
      this.cockpit.visible=false;
      for(const m of this.mirrors) {
        m.camera.position.copy(m.offset).applyQuaternion(s.rotation).add(s.position);
        m.camera.up.copy(UP).applyQuaternion(s.rotation);m.camera.lookAt(m.camera.position.clone().add(m.aim.clone().applyQuaternion(s.rotation)));
        this.renderer.setRenderTarget(m.target);this.renderer.render(this.scene,m.camera);
      }
      this.cockpit.visible=true;this.lastMirror=now;
    }
    this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
  }
}
