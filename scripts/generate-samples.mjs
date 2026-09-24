import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((data) => {
      this.result = data;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((data) => {
      this.result = `data:${blob.type};base64,${Buffer.from(data).toString("base64")}`;
      this.onloadend?.();
    });
  }
};
const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, values) => {
    if (a.startsWith("--")) all.push([a.slice(2), values[i + 1]]);
    return all;
  }, []),
);
// Inside the clone, where a server started from it will publish them from.
const output = path.resolve(repo, args.output || "tmp/samples");
fs.mkdirSync(output, { recursive: true });
const holeRadius = Number(args["hole-radius"] || 0.19);
if (!Number.isFinite(holeRadius) || holeRadius < 0.05 || holeRadius > 0.4)
  throw new Error("hole-radius must be between 0.05 and 0.4");
const metal = new THREE.MeshStandardMaterial({
  color: "#8daeb1",
  roughness: 0.46,
  metalness: 0.28,
});
const bracket = new THREE.Group();
bracket.name = "Parametric bracket";
const shape = new THREE.Shape();
const w = 1.8,
  h = 2.4,
  r = 0.2;
shape.moveTo(-w / 2 + r, -h / 2);
shape.lineTo(w / 2 - r, -h / 2);
shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
shape.lineTo(w / 2, h / 2 - r);
shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
shape.lineTo(-w / 2 + r, h / 2);
shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
shape.lineTo(-w / 2, -h / 2 + r);
shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
for (const y of [-0.55, 0.55]) {
  const hole = new THREE.Path();
  hole.absarc(0, y, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}
const plate = new THREE.Mesh(
  new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 32,
  }),
  metal,
);
plate.name = "upright-plate-with-holes";
bracket.add(plate);
const foot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1.35), metal);
foot.position.set(0, -1.14, 0.6);
foot.name = "base-foot";
bracket.add(foot);
for (const x of [-0.72, 0.72]) {
  const supportShape = new THREE.Shape();
  supportShape.moveTo(0, 0);
  supportShape.lineTo(0.85, 0);
  supportShape.lineTo(0, 0.8);
  supportShape.closePath();
  const support = new THREE.Mesh(
    new THREE.ExtrudeGeometry(supportShape, {
      depth: 0.1,
      bevelEnabled: false,
    }),
    metal,
  );
  support.rotation.y = -Math.PI / 2;
  support.position.set(x, -1.03, 0.25);
  support.name = `side-support-${x < 0 ? "left" : "right"}`;
  bracket.add(support);
}
const bunny = new THREE.Group();
bunny.name = "Procedural bunny figurine";
const cream = new THREE.MeshStandardMaterial({
  color: "#d9c6b2",
  roughness: 0.86,
});
const pink = new THREE.MeshStandardMaterial({
  color: "#c5938b",
  roughness: 0.85,
});
const dark = new THREE.MeshStandardMaterial({
  color: "#303f3c",
  roughness: 0.5,
});
function ellipsoid(name, position, scale, material = cream) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  bunny.add(mesh);
  return mesh;
}
ellipsoid("body", [0, 0, 0], [0.6, 0.83, 0.48]);
ellipsoid("head", [0, 1.02, 0.08], [0.67, 0.6, 0.55]);
for (const side of [-1, 1]) {
  const ear = ellipsoid(
    `ear-${side < 0 ? "left" : "right"}`,
    [side * 0.33, 1.95, -0.03],
    [0.18, 0.7, 0.19],
  );
  ear.rotation.z = -side * 0.13;
  const inner = ellipsoid(
    `inner-ear-${side}`,
    [side * 0.33, 1.99, 0.14],
    [0.095, 0.46, 0.04],
    pink,
  );
  inner.rotation.z = -side * 0.13;
  ellipsoid(`hand-${side}`, [side * 0.59, 0.08, 0.11], [0.19, 0.45, 0.22]);
  ellipsoid(`foot-${side}`, [side * 0.35, -0.71, 0.23], [0.32, 0.19, 0.4]);
  ellipsoid(
    `eye-${side}`,
    [side * 0.24, 1.12, 0.57],
    [0.065, 0.078, 0.042],
    dark,
  );
}
ellipsoid("nose", [0, 0.97, 0.637], [0.085, 0.065, 0.046], pink);
ellipsoid("tail", [0, -0.15, -0.47], [0.25, 0.25, 0.23]);
const exporter = new GLTFExporter();
const occlusion = new THREE.Group();
const direction = new THREE.Vector3(4, 2.8, 5).normalize();
for (const [name, offset] of [
  ["visible-front", 0.03],
  ["hidden-back", -0.03],
]) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 3, 40, 40), metal);
  p.name = name;
  p.position.copy(direction).multiplyScalar(offset);
  p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  occlusion.add(p);
}
/* Strips every material out of a finished GLB, leaving the primitives with no
   material of their own. A CAD exporter that writes geometry and nothing else
   produces this same file, and it is the only shape of file that reaches
   glTF's default material — so it is the only fixture that can hold the
   viewer's fallback honest. Built from the bracket so that the two differ in
   materials alone. */
function stripMaterials(binary) {
  const buffer = Buffer.from(binary);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  delete json.materials;
  for (const mesh of json.meshes || [])
    for (const primitive of mesh.primitives) delete primitive.material;
  let chunk = Buffer.from(JSON.stringify(json));
  if (chunk.length % 4)
    chunk = Buffer.concat([chunk, Buffer.alloc(4 - (chunk.length % 4), 0x20)]);
  const rest = buffer.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length + rest.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.write("JSON", 16);
  return Buffer.concat([header, chunk, rest]);
}
const written = new Map();
for (const [name, obj] of [
  [args["bracket-name"] || "parametric-bracket.glb", bracket],
  ["bunny-figurine.glb", bunny],
  ["occlusion-check.glb", occlusion],
]) {
  const data = await exporter.parseAsync(obj, { binary: true });
  const target = path.join(output, path.basename(name));
  fs.writeFileSync(target, Buffer.from(data));
  written.set(name, data);
  console.log(path.relative(repo, target));
}
const bare = path.join(output, "no-material-bracket.glb");
fs.writeFileSync(
  bare,
  stripMaterials(written.get(args["bracket-name"] || "parametric-bracket.glb")),
);
console.log(path.relative(repo, bare));
