// A 200 mm shell with a 2 mm gap to an internal box. Keep the production
// near/distance ratio: a generous test near plane hides this regression.
import * as THREE from "three";
import { MarksMethods } from "../../../src/viewer/marks.js";
import { NavigationMethods } from "../../../src/viewer/navigation.js";
import { DisplayModesMethods } from "../../../src/viewer/display-modes.js";
import { buildFillTopology } from "../../../src/planar-fill.js";
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setSize(800, 800);
renderer.setClearColor(0xffffff);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const marks = new THREE.Group();
scene.add(marks);
const context = Object.assign(
  {},
  ...[MarksMethods, DisplayModesMethods].map((c) =>
    Object.fromEntries(
      Object.getOwnPropertyNames(c.prototype)
        .filter((k) => k !== "constructor")
        .map((k) => [k, c.prototype[k]]),
    ),
  ),
);
Object.assign(context, {
  lineMaterials: new Map(),
  markMaterials: new Map(),
  meshMap: new Map(),
  container: renderer.domElement,
  frameRect: () => ({ width: 800, height: 800 }),
  modelFrame: (mesh) => mesh.matrixWorld.clone(),
  clipMaterial: (m) => m,
  parts: { meshVisible: () => true, meshTransparent: () => false },
  restoreSectionSides() {},
  applySectionMaterials() {},
  displayEdges: [],
  displayGeneration: 0,
  displayStyle: "edges",
});
let camera, probeSegment;
const box = (x, y, z, offset = 0) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(x, y, z),
    new THREE.MeshBasicMaterial({ color: 0xcccccc }),
  );
  mesh.position.z = offset;
  mesh.userData.reviewId = `box-${context.meshMap.size}`;
  mesh.updateMatrixWorld(true);
  mesh.userData.fillTopology = buildFillTopology(
    mesh.geometry,
    mesh.matrixWorld,
  );
  context.meshMap.set(mesh.userData.reviewId, mesh);
  scene.add(mesh);
  return mesh;
};
window.setup = async ({
  kind = "display",
  distance = 1000,
  projection = "perspective",
  back = false,
  ghost = false,
  yaw = 0,
} = {}) => {
  for (const child of [...scene.children])
    if (child !== marks) scene.remove(child);
  marks.clear();
  context.meshMap.clear();
  context.displayEdges = [];
  camera =
    projection === "perspective"
      ? new THREE.PerspectiveCamera(30, 1, distance * 1e-4, distance * 4)
      : new THREE.OrthographicCamera(
          -140,
          140,
          140,
          -140,
          distance * 1e-4,
          distance * 4,
        );
  camera.aspect = 1;
  camera.position.set(
    Math.sin(yaw) * distance,
    distance * 0.07,
    (back ? -1 : 1) * Math.cos(yaw) * distance,
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  probeSegment =
    kind === "display"
      ? [
          [-100, 80, 10],
          [100, 80, 10],
        ]
      : [
          [-40, 30, 25],
          [40, 30, 25],
        ];
  if (kind === "display") {
    const outer = box(200, 160, 20),
      inner = box(100, 80, 16);
    context.meshes = [outer, inner];
    context.model = { sha256: "thin-wall-regression" };
    await context.buildDisplayEdges();
    if (context.displayError) throw new Error(context.displayError);
    context.displayEdges.forEach((e) => e.material.color.set(0xff00ff));
  } else {
    const part = box(80, 60, 10, 20);
    const wall = box(200, 160, 10, -20);
    if (ghost) {
      wall.material.depthWrite = false;
      wall.material.transparent = true;
      wall.material.opacity = 0.18;
    }
    context.meshes = [part, wall];
    context.applyDisplayStyle();
    const a =
      kind === "edge"
        ? {
            type: "edge",
            meshId: part.userData.reviewId,
            points: [
              [-40, 30, 25],
              [40, 30, 25],
            ],
            color: "#ff00ff",
          }
        : { type: "part", meshIds: [part.userData.reviewId], color: "#ff00ff" };
    context.drawObjectMark(marks, a, false, false);
  }
  NavigationMethods.prototype.updateNavigationProjection.call({
    camera,
    meshes: [...context.meshMap.values()],
    controls: { target: new THREE.Vector3() },
    navigationSize: 260,
  });
  renderer.render(scene, camera);
  return {
    depthBits: renderer
      .getContext()
      .getParameter(renderer.getContext().DEPTH_BITS),
  };
};
window.probe = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext(),
    pixels = new Uint8Array(800 * 800 * 4);
  gl.readPixels(0, 0, 800, 800, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let interior = 0,
    total = 0;
  const p = new THREE.Vector3(60, 50, 10).project(camera);
  const boundX = Math.abs(p.x) * 400 + 4,
    boundY = Math.abs(p.y) * 400 + 4;
  for (let y = 0; y < 800; y++)
    for (let x = 0; x < 800; x++) {
      const i = (y * 800 + x) * 4;
      if (pixels[i] > 180 && pixels[i + 1] < 120 && pixels[i + 2] > 180) {
        total++;
        if (Math.abs(x - 400) < boundX && Math.abs(y - 400) < boundY)
          interior++;
      }
    }
  let covered = 0;
  for (let n = 1; n < 100; n++) {
    const q = new THREE.Vector3()
      .fromArray(probeSegment[0])
      .lerp(new THREE.Vector3().fromArray(probeSegment[1]), n / 100)
      .project(camera);
    const x = Math.round((q.x + 1) * 400),
      y = Math.round((q.y + 1) * 400);
    let ink = false;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const i = ((y + dy) * 800 + x + dx) * 4;
        if (pixels[i] > 180 && pixels[i + 1] < 120 && pixels[i + 2] > 180)
          ink = true;
      }
    if (ink) covered++;
  }
  return {
    interior,
    total,
    coverage: covered / 99,
    depthBits: gl.getParameter(gl.DEPTH_BITS),
  };
};

// Optional local-only evidence input; the licensed project sample is not a
// repository fixture and is never required by the regression suite.
window.setupMac = async ({
  distance = 500,
  back = false,
  edge = false,
} = {}) => {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { brepTopology } = await import("../../../src/measure.js");
  const gltf = await new GLTFLoader().loadAsync("/tmp/evidence/macmini.glb");
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const center = bounds.getCenter(new THREE.Vector3());
  context.meshMap.clear();
  context.meshes = [];
  context.displayEdges = [];
  marks.clear();
  for (const child of [...scene.children])
    if (child !== marks) scene.remove(child);
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry
      .clone()
      .applyMatrix4(mesh.matrixWorld)
      .translate(-center.x, -center.y, -center.z);
    const part = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xcccccc }),
    );
    part.userData.reviewId = `mac-${context.meshes.length}`;
    part.userData.fillTopology = buildFillTopology(
      geometry,
      new THREE.Matrix4(),
    );
    part.userData.fillTopology.brep = brepTopology(
      mesh.userData.brepFaces,
      part.userData.fillTopology.vertices.length,
    );
    context.meshMap.set(part.userData.reviewId, part);
    context.meshes.push(part);
    scene.add(part);
  });
  context.model = { sha256: "macmini-v04" };
  await context.buildDisplayEdges();
  if (context.displayError) throw new Error(context.displayError);
  const candidates = [];
  for (const line of context.displayEdges) {
    const p = line.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      if (a.distanceTo(b) > 10)
        candidates.push({
          points: [a.toArray(), b.toArray()],
          z: (a.z + b.z) / 2,
          meshId: line.parent.userData.reviewId,
        });
    }
  }
  candidates.sort((a, b) => b.z - a.z);
  const chosen = candidates[0];
  if (edge) {
    context.displayEdges.forEach((l) => (l.visible = false));
    context.drawObjectMark(
      marks,
      { type: "edge", ...chosen, color: "#ff00ff" },
      false,
      false,
    );
  }
  camera = new THREE.PerspectiveCamera(30, 1, distance * 1e-4, distance + 1000);
  camera.position.set(
    distance * 0.28,
    -distance * 0.2,
    (back ? -1 : 1) * distance * 0.939,
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  NavigationMethods.prototype.updateNavigationProjection.call({
    camera,
    meshes: context.meshes,
    controls: { target: new THREE.Vector3() },
    navigationSize: 283,
  });
  renderer.render(scene, camera);
  return {
    bounds: bounds.getSize(new THREE.Vector3()).toArray(),
    chosen,
    parts: context.meshes.length,
  };
};
