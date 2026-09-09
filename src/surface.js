import * as THREE from 'three';

// Deterministic review-only tessellation. The source GLB/STL is never modified.
// Every review triangle remembers its original triangle; selected patches export
// original-mesh local coordinates as well as both indices.
export const SURFACE_ALGORITHM='midpoint-v1-edge0.07';
export function reviewSurface(geometry,matrixWorld,budget=600000){
  const sourceCount=(geometry.index?.count||geometry.attributes.position.count)/3;
  const names=Object.keys(geometry.attributes).filter(n=>geometry.attributes[n].itemSize<=4);
  const sizes=Object.fromEntries(names.map(n=>[n,geometry.attributes[n].itemSize]));
  const output=Object.fromEntries(names.map(n=>[n,[]])),sources=[],groups=[];
  const va=new THREE.Vector3(),vb=new THREE.Vector3();let currentCount=sourceCount;
  const read=i=>Object.fromEntries(names.map(n=>[n,Array.from({length:sizes[n]},(_,c)=>geometry.attributes[n].getComponent(i,c))]));
  const midpoint=(a,b)=>Object.fromEntries(names.map(n=>{const v=a[n].map((x,i)=>(x+b[n][i])/2);if(n==='normal'){const len=Math.hypot(...v)||1;for(let i=0;i<v.length;i++)v[i]/=len;}return [n,v];}));
  const length=(a,b)=>{va.fromArray(a.position).applyMatrix4(matrixWorld);vb.fromArray(b.position).applyMatrix4(matrixWorld);return va.distanceToSquared(vb);};
  const emit=(vertices,source,material)=>{
    for(const v of vertices)for(const n of names)output[n].push(...v[n]);
    const start=sources.length*3;sources.push(source);const previous=groups.at(-1);
    if(previous?.materialIndex===material)previous.count+=3;else groups.push({start,count:3,materialIndex:material});
  };
  for(let face=0;face<sourceCount;face++){
    const vertices=[0,1,2].map(k=>read(geometry.index?geometry.index.getX(face*3+k):face*3+k));
    const group=geometry.groups.find(g=>face*3>=g.start&&face*3<g.start+g.count)?.materialIndex||0;
    const stack=[{v:vertices,depth:0}];
    while(stack.length){
      const {v,depth}=stack.pop();const lengths=[length(v[0],v[1]),length(v[1],v[2]),length(v[2],v[0])];const longest=Math.max(...lengths);
      if(longest>0.07**2&&depth<12&&currentCount<budget){
        const a=lengths.indexOf(longest),b=(a+1)%3,c=(a+2)%3,m=midpoint(v[a],v[b]);currentCount++;
        stack.push({v:[m,v[b],v[c]],depth:depth+1},{v:[v[a],m,v[c]],depth:depth+1});
      }else emit(v,face,group);
    }
  }
  const result=new THREE.BufferGeometry();
  for(const n of names)result.setAttribute(n,new THREE.Float32BufferAttribute(output[n],sizes[n]));
  for(const g of groups)result.addGroup(g.start,g.count,g.materialIndex);
  result.userData.sourceFaces=sources;result.userData.sourceTriangles=sourceCount;
  result.userData.surfaceAlgorithm=SURFACE_ALGORITHM;
  if(!result.attributes.normal)result.computeVertexNormals();
  return result;
}
