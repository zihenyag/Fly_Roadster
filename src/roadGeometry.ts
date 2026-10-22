import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/** Close the underside and every exposed edge without filling intentional road gaps. */
export function roadDeckGeometry(vertices:Float32Array,indices:Uint32Array,thickness=.45) {
  const top=new BufferGeometry();top.setAttribute('position',new BufferAttribute(vertices,3));top.setIndex(new BufferAttribute(indices,1));top.computeVertexNormals();
  const normals=top.getAttribute('normal'),bottom=new Float32Array(vertices.length);
  for(let i=0;i<vertices.length/3;i++) {
    const n=new Vector3().fromBufferAttribute(normals,i).normalize();
    for(let j=0;j<3;j++)bottom[i*3+j]=vertices[i*3+j]-n.getComponent(j)*thickness;
  }
  const positions:number[]=[],edges=new Map<string,{a:number;b:number;count:number}>();
  const vertex=(source:Float32Array,i:number)=>positions.push(source[i*3],source[i*3+1],source[i*3+2]);
  for(let i=0;i<indices.length;i+=3) {
    const [a,b,c]=[indices[i],indices[i+1],indices[i+2]];vertex(bottom,c);vertex(bottom,b);vertex(bottom,a);
    for(const [u,v]of [[a,b],[b,c],[c,a]]) {const key=u<v?`${u},${v}`:`${v},${u}`,edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a:u,b:v,count:1});}
  }
  for(const {a,b,count}of edges.values())if(count===1) {
    vertex(vertices,a);vertex(bottom,a);vertex(vertices,b);
    vertex(bottom,a);vertex(bottom,b);vertex(vertices,b);
  }
  top.dispose();const deck=new BufferGeometry();deck.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));deck.computeVertexNormals();return deck;
}
