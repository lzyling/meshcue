import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(repo,'../../media/3d/3d-agent-review/samples');fs.mkdirSync(output,{recursive:true});
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onloadend?.();});}
};
const args=Object.fromEntries(process.argv.slice(2).reduce((all,a,i,values)=>{if(a.startsWith('--'))all.push([a.slice(2),values[i+1]]);return all;},[]));
const holeRadius=Number(args['hole-radius']||0.19);
if(!Number.isFinite(holeRadius)||holeRadius<0.05||holeRadius>0.4)throw new Error('hole-radius must be between 0.05 and 0.4');
const metal=new THREE.MeshStandardMaterial({color:'#8daeb1',roughness:0.46,metalness:0.28});
const bracket=new THREE.Group();bracket.name='Parametric bracket';
const shape=new THREE.Shape();const w=1.8,h=2.4,r=.20;
shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
for(const y of [-.55,.55]){const hole=new THREE.Path();hole.absarc(0,y,holeRadius,0,Math.PI*2,true);shape.holes.push(hole);}
const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:32}),metal);plate.name='upright-plate-with-holes';bracket.add(plate);
const foot=new THREE.Mesh(new THREE.BoxGeometry(1.8,.18,1.35),metal);foot.position.set(0,-1.14,.6);foot.name='base-foot';bracket.add(foot);
for(const x of [-.72,.72]){const supportShape=new THREE.Shape();supportShape.moveTo(0,0);supportShape.lineTo(.85,0);supportShape.lineTo(0,.8);supportShape.closePath();const support=new THREE.Mesh(new THREE.ExtrudeGeometry(supportShape,{depth:.1,bevelEnabled:false}),metal);support.rotation.y=-Math.PI/2;support.position.set(x,-1.03,.25);support.name=`side-support-${x<0?'left':'right'}`;bracket.add(support);}
const bunny=new THREE.Group();bunny.name='Procedural bunny figurine';
const cream=new THREE.MeshStandardMaterial({color:'#d9c6b2',roughness:.86});const pink=new THREE.MeshStandardMaterial({color:'#c5938b',roughness:.85});const dark=new THREE.MeshStandardMaterial({color:'#303f3c',roughness:.5});
function ellipsoid(name,position,scale,material=cream){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),material);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);bunny.add(mesh);return mesh;}
ellipsoid('body',[0,0,0],[.6,.83,.48]);ellipsoid('head',[0,1.02,.08],[.67,.60,.55]);
for(const side of [-1,1]){const ear=ellipsoid(`ear-${side<0?'left':'right'}`,[side*.33,1.95,-.03],[.18,.70,.19]);ear.rotation.z=-side*.13;const inner=ellipsoid(`inner-ear-${side}`,[side*.33,1.99,.14],[.095,.46,.04],pink);inner.rotation.z=-side*.13;ellipsoid(`hand-${side}`,[side*.59,.08,.11],[.19,.45,.22]);ellipsoid(`foot-${side}`,[side*.35,-.71,.23],[.32,.19,.40]);ellipsoid(`eye-${side}`,[side*.24,1.12,.57],[.065,.078,.042],dark);}
ellipsoid('nose',[0,.97,.637],[.085,.065,.046],pink);ellipsoid('tail',[0,-.15,-.47],[.25,.25,.23]);
const exporter=new GLTFExporter();
const occlusion=new THREE.Group();const direction=new THREE.Vector3(4,2.8,5).normalize();
for(const [name,offset]of [['visible-front',.03],['hidden-back',-.03]]){const p=new THREE.Mesh(new THREE.PlaneGeometry(3,3,40,40),metal);p.name=name;p.position.copy(direction).multiplyScalar(offset);p.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);occlusion.add(p);}
for(const [name,obj]of [[args['bracket-name']||'parametric-bracket.glb',bracket],['bunny-figurine.glb',bunny],['occlusion-check.glb',occlusion]]){const data=await exporter.parseAsync(obj,{binary:true});const target=path.join(output,path.basename(name));fs.writeFileSync(target,Buffer.from(data));console.log(path.relative(repo,target));}
