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
// Drawing-buffer pixels per side. The suite runs at 800 x 800, ratio 1; local
// evidence on other ratios and sizes resizes through canvasSize.
let SIZE = 800,
  CSS = 800;
window.canvasSize = (css, ratio = 1) => {
  renderer.setPixelRatio(ratio);
  renderer.setSize(css, css);
  CSS = css;
  SIZE = css * ratio;
  return renderer.getDrawingBufferSize(new THREE.Vector2()).toArray();
};
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
  frameRect: () => ({ width: CSS, height: CSS }),
  modelFrame: (mesh) => mesh.matrixWorld.clone(),
  clipMaterial: (m) => m,
  parts: { meshVisible: () => true, meshTransparent: () => false },
  restoreSectionSides() {},
  applySectionMaterials() {},
  displayEdges: [],
  displayGeneration: 0,
  displayStyle: "edges",
});
// Production attaches the face-identity pass in initializeDisplayModes. (The
// call is optional so the same fixture also runs against earlier sources.)
context.attachLineVisibility?.(scene, renderer);
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
    pixels = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let interior = 0,
    total = 0;
  const p = new THREE.Vector3(60, 50, 10).project(camera);
  const boundX = Math.abs(p.x) * (SIZE / 2) + 4,
    boundY = Math.abs(p.y) * (SIZE / 2) + 4;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (pixels[i] > 180 && pixels[i + 1] < 120 && pixels[i + 2] > 180) {
        total++;
        if (Math.abs(x - SIZE / 2) < boundX && Math.abs(y - SIZE / 2) < boundY)
          interior++;
      }
    }
  let covered = 0;
  for (let n = 1; n < 100; n++) {
    const q = new THREE.Vector3()
      .fromArray(probeSegment[0])
      .lerp(new THREE.Vector3().fromArray(probeSegment[1]), n / 100)
      .project(camera);
    const x = Math.round((q.x + 1) * (SIZE / 2)),
      y = Math.round((q.y + 1) * (SIZE / 2));
    let ink = false;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const i = ((y + dy) * SIZE + x + dx) * 4;
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
  view = null,
  projection = "perspective",
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
  // Orthographic shows what the perspective view shows at the target.
  const half = distance * Math.tan(Math.PI / 12);
  camera =
    projection === "perspective"
      ? new THREE.PerspectiveCamera(30, 1, distance * 1e-4, distance + 1000)
      : new THREE.OrthographicCamera(
          -half,
          half,
          half,
          -half,
          distance * 1e-4,
          distance + 1000,
        );
  camera.aspect = 1;
  camera.position.set(
    distance * 0.28,
    -distance * 0.2,
    (back ? -1 : 1) * distance * 0.939,
  );
  // The field report's view: right-front-top three-quarter, z up, grille end
  // and the long right top fillet in sight. Edges in magenta for counting.
  if (view === "field") {
    camera.up.set(0, 0, 1);
    camera.position.set(0.62, -0.55, 0.56).normalize().multiplyScalar(distance);
    context.displayEdges.forEach((e) => e.material.color.set(0xff00ff));
  }
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
    ...(view === "field"
      ? (({ fillet, total }) => ({ fillet, total }))(
          // The real shell's power-button recess cuts the fillet above 75°.
          filletInk(center.clone().negate(), 70),
        )
      : {}),
  };
};

// Use the real one-shot render lifecycle; never pre-update the projection
// after the visibility/transform change, and never draw a corrective frame.
window.firstDemandFrame = async (change) => {
  const { ModelViewer } = await import("../../../src/viewer.js");
  const s = new THREE.Scene();
  const c = new THREE.PerspectiveCamera(30, 1, 0.1, 4000);
  c.position.z = 1000;
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  const far = new THREE.Mesh(
    new THREE.BoxGeometry(200, 160, 20),
    new THREE.MeshBasicMaterial({ color: 0xcccccc }),
  );
  const near = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  );
  near.position.z = change === "reveal" ? 999.5 : 0;
  near.visible = change !== "reveal";
  s.add(far, near);
  s.updateMatrixWorld(true);
  const noop = () => {};
  const v = {
    scene: s,
    camera: c,
    renderer,
    meshes: [far, near],
    navigationSize: 260,
    controls: { target: new THREE.Vector3() },
    readReadingSizes: noop,
    animateEcho: noop,
    reportOrientation: noop,
    placePins: noop,
    placeMeasure: noop,
    placeReadings: noop,
    frameRect: noop,
    container: {},
    navigationPointers: new Set(),
    pivotDot: { hidden: true },
    mode: "orbit",
    enabled: true,
    clearNavigationHover: noop,
    updateNavigationProjection() {
      NavigationMethods.prototype.updateNavigationProjection.call(this);
    },
  };
  v.frameHooks = new Set([
    () => NavigationMethods.prototype.navigationFrame.call(v),
  ]);
  v.updateNavigationProjection();
  near.visible = true;
  near.position.z = 999.5;
  v.render = () => ModelViewer.prototype.render.call(v);
  v.invalidate = () => ModelViewer.prototype.invalidate.call(v);
  v.invalidate();
  await new Promise(requestAnimationFrame);
  const gl = renderer.getContext(),
    p = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, p);
  let ink = 0;
  for (let i = 0; i < p.length; i += 4)
    if (p[i] > 180 && p[i + 1] < 120 && p[i + 2] > 180) ink++;
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  return {
    ink,
    requests: v.renderRequest == null ? 0 : 1,
    renders: v.renderCount,
  };
};

// Runs every line through the display pipeline, so each one is an edge of a
// mesh and carries its own faces, as in production.
async function displayOnly(meshes, key, colours) {
  for (const child of [...scene.children])
    if (child !== marks) scene.remove(child);
  marks.clear();
  context.meshMap.clear();
  context.displayEdges = [];
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    mesh.userData.fillTopology ??= buildFillTopology(
      mesh.geometry,
      mesh.matrixWorld,
    );
    mesh.userData.reviewId = `${key}-${context.meshMap.size}`;
    context.meshMap.set(mesh.userData.reviewId, mesh);
    scene.add(mesh);
  }
  context.meshes = meshes;
  context.model = { sha256: key };
  await context.buildDisplayEdges();
  if (context.displayError) throw new Error(context.displayError);
  context.displayEdges.forEach((e, i) => e.material.color.set(colours[i]));
}
window.grazing = async () => {
  const c = new THREE.PerspectiveCamera(30, 1, 10, 4000);
  c.position.z = 1000;
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  const grey = () => new THREE.MeshBasicMaterial({ color: 0xcccccc });
  // Cylinder silhouette: the last curved facets have a large raster slope.
  // As file faces it is split along generators at 0, 45 and 180 degrees, so
  // those generators are genuine edges lying on the smooth curved surface.
  const cylinder = (split) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(80, 80, 160, 128),
      grey(),
    );
    mesh.updateMatrixWorld(true);
    const topology = buildFillTopology(mesh.geometry, mesh.matrixWorld);
    if (split) {
      const of = new Int32Array(topology.vertices.length);
      topology.vertices.forEach((points, i) => {
        const [x, y, z] = [0, 1, 2].map(
          (k) => (points[0][k] + points[1][k] + points[2][k]) / 3,
        );
        const angle = (Math.atan2(x, z) * 180) / Math.PI;
        of[i] =
          Math.abs(y) > 79.9
            ? y > 0
              ? 3
              : 4
            : angle >= 0 && angle < 45
              ? 0
              : angle >= 45 && angle < 180
                ? 1
                : 2;
      });
      topology.brep = { of, ranges: [] };
    }
    mesh.userData.fillTopology = topology;
    return mesh;
  };
  const x = 79.8,
    z = Math.sqrt(80 * 80 - x * x) - 0.2;
  // The rear edge 0.2 mm behind the analytic surface: the front vertical edge
  // of a block that otherwise sits inside the cylinder.
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(x - 70, 100, z + 5),
    grey(),
  );
  block.position.set((x + 70) / 2, 0, (z - 5) / 2);
  await displayOnly(
    [cylinder(false), block],
    "grazing-hidden",
    [0x000000, 0xff00ff],
  );
  renderer.render(scene, c);
  const gl = renderer.getContext(),
    p = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, p);
  let hidden = 0;
  for (let i = 0; i < p.length; i += 4)
    if (p[i] > 180 && p[i + 1] < 120 && p[i + 2] > 180) hidden++;
  // Front generators of the curve, then real sharp box creases at steep
  // angles. Smooth-cylinder tessellation seams are not feature edges.
  const coverage = [];
  for (const vertex of [0, 16, 24, 28]) {
    const angle = (vertex * Math.PI) / 64;
    let a, b;
    if (vertex < 24) {
      const x = 80 * Math.sin(angle),
        z = 80 * Math.cos(angle);
      a = new THREE.Vector3(x, -50, z);
      b = new THREE.Vector3(x, 50, z);
      await displayOnly([cylinder(true)], `grazing-${vertex}`, [0xff00ff]);
    } else {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(80, 160, 10), grey());
      slab.rotation.y = angle;
      slab.updateMatrixWorld(true);
      await displayOnly([slab], `grazing-${vertex}`, [0xff00ff]);
      a = new THREE.Vector3(-40, -50, 5).applyMatrix4(slab.matrixWorld);
      b = new THREE.Vector3(-40, 50, 5).applyMatrix4(slab.matrixWorld);
    }
    renderer.render(scene, c);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, p);
    let covered = 0;
    for (let n = 1; n < 100; n++) {
      const q = a
        .clone()
        .lerp(b, n / 100)
        .project(c);
      const px = Math.round((q.x + 1) * (SIZE / 2)),
        py = Math.round((q.y + 1) * (SIZE / 2));
      let ink = false;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const i = ((py + dy) * SIZE + px + dx) * 4;
          if (p[i] > 180 && p[i + 1] < 120 && p[i + 2] > 180) ink = true;
        }
      if (ink) covered++;
    }
    coverage.push(covered / 99);
  }
  return { hidden, coverage: Math.min(...coverage), angles: coverage };
};

// Field case: a rounded shell whose inner and outer top fillets are not
// concentric, so the wall at 45 degrees is only 0.015 mm. The cavity end faces
// meet the inner fillet in an edge just behind the outer fillet. Outer R21
// about (71, 99), inner R12.5 about (77, 105), axis along y, z up.
const FIELD = {
  outer: { half: 92, bottom: 8, top: 120, cx: 71, cz: 99, r: 21, arc: 9 },
  inner: {
    half: 89.5,
    bottom: 10.5,
    top: 117.5,
    cx: 77,
    cz: 105,
    r: 12.5,
    arc: 7,
  },
  outerY: 85.61,
  innerY: 74.5,
};
function fieldProfile({ half, bottom, top, cx, cz, r, arc }) {
  // Closed loop in the x/z plane; each segment carries its face name.
  const points = [
    [-half, bottom, "bottom"],
    [half, bottom, "right"],
  ];
  for (let k = 0; k <= arc; k++) {
    const a = ((k / arc) * Math.PI) / 2;
    points.push([
      cx + r * Math.cos(a),
      cz + r * Math.sin(a),
      k < arc ? "rightFillet" : "top",
    ]);
  }
  for (let k = 0; k <= arc; k++) {
    const a = Math.PI / 2 + ((k / arc) * Math.PI) / 2;
    points.push([
      -cx + r * Math.cos(a),
      cz + r * Math.sin(a),
      k < arc ? "leftFillet" : "left",
    ]);
  }
  return points;
}
function fieldShell(brep) {
  const faces = new Map();
  const add = (face, a, b, c, outward, cavity) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const dot = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2];
    // The cavity's surface faces into the void, away from the material.
    const flip = cavity ? dot > 0 : dot < 0;
    if (!faces.has(face)) faces.set(face, []);
    faces.get(face).push(...(flip ? [a, c, b] : [a, b, c]));
  };
  for (const [name, spec, y, cavity] of [
    ["outer", FIELD.outer, FIELD.outerY, false],
    ["inner", FIELD.inner, FIELD.innerY, true],
  ]) {
    const loop = fieldProfile(spec);
    const centre = [0, (spec.bottom + spec.top) / 2];
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i],
        q = loop[(i + 1) % loop.length];
      const out = [
        (p[0] + q[0]) / 2 - centre[0],
        0,
        (p[1] + q[1]) / 2 - centre[1],
      ];
      const a = [p[0], -y, p[1]],
        b = [q[0], -y, q[1]],
        c = [q[0], y, q[1]],
        d = [p[0], y, p[1]];
      add(`${name}-${p[2]}`, a, b, c, out, cavity);
      add(`${name}-${p[2]}`, a, c, d, out, cavity);
    }
    for (const side of [-1, 1]) {
      const middle = [centre[0], side * y, centre[1]];
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i],
          q = loop[(i + 1) % loop.length];
        add(
          `${name}-end${side}`,
          middle,
          [p[0], side * y, p[1]],
          [q[0], side * y, q[1]],
          [0, side, 0],
          cavity,
        );
      }
    }
  }
  const positions = [],
    ranges = [];
  for (const triangles of faces.values()) {
    const first = positions.length / 9;
    for (const p of triangles) positions.push(...p);
    ranges.push([first, positions.length / 9 - 1]);
  }
  const geometry = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xcccccc }),
  );
  mesh.userData.reviewId = "field-shell";
  mesh.updateMatrixWorld(true);
  mesh.userData.fillTopology = buildFillTopology(geometry, mesh.matrixWorld);
  if (brep)
    mesh.userData.fillTopology.brep = {
      of: Int32Array.from(
        ranges.flatMap(([a, b], id) => Array(b - a + 1).fill(id)),
      ),
      ranges,
    };
  return mesh;
}
const fieldPoint = (angle, y) => {
  const { cx, cz, r } = FIELD.outer;
  const a = (angle * Math.PI) / 180;
  return new THREE.Vector3(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
};
// Magenta pixels inside the outer right fillet's strip, away from its own
// tangent boundaries and end caps: no genuine edge lies there, and the cavity
// edges sit just behind it. `offset` moves the field geometry into the scene;
// `upper` is the strip's upper angle in degrees.
function filletInk(offset, upper = 75) {
  const gl = renderer.getContext(),
    pixels = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const ink = (x, y) => {
    const i = (y * SIZE + x) * 4;
    return pixels[i] > 180 && pixels[i + 1] < 120 && pixels[i + 2] > 180;
  };
  const screen = (v) => {
    const q = v.clone().project(camera);
    return [(q.x + 1) * (SIZE / 2), (q.y + 1) * (SIZE / 2)];
  };
  const quad = [
    fieldPoint(15, -80),
    fieldPoint(15, 80),
    fieldPoint(upper, 80),
    fieldPoint(upper, -80),
  ].map((p) => screen(p.add(offset)));
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i],
        [bx, by] = quad[(i + 1) % 4];
      const s = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
      if (s && sign && s !== sign) return false;
      if (s) sign = s;
    }
    return true;
  };
  let fillet = 0,
    total = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (ink(x, y)) {
        total++;
        if (inside(x + 0.5, y + 0.5)) fillet++;
      }
  return { fillet, total, ink, screen, quad };
}
// Right-front-top three-quarter view: grille end (-y) and the right fillet.
window.fieldShell = async ({
  distance = 1000,
  projection = "perspective",
  brep = true,
} = {}) => {
  for (const child of [...scene.children])
    if (child !== marks) scene.remove(child);
  marks.clear();
  context.meshMap.clear();
  context.displayEdges = [];
  const shell = fieldShell(brep);
  context.meshMap.set(shell.userData.reviewId, shell);
  scene.add(shell);
  context.meshes = [shell];
  context.model = { sha256: `field-shell-${brep ? "brep" : "mesh"}` };
  await context.buildDisplayEdges();
  if (context.displayError) throw new Error(context.displayError);
  context.displayEdges.forEach((e) => e.material.color.set(0xff00ff));
  const centre = new THREE.Vector3(0, 0, 64);
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
  camera.up.set(0, 0, 1);
  camera.position
    .set(0.62, -0.55, 0.56)
    .normalize()
    .multiplyScalar(distance)
    .add(centre);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  NavigationMethods.prototype.updateNavigationProjection.call({
    camera,
    meshes: [shell],
    controls: { target: centre },
    navigationSize: 283,
  });
  renderer.render(scene, camera);
  const { fillet, total, ink, screen } = filletInk(new THREE.Vector3());
  // Genuinely visible edges stay whole: the grille end's top edge, and with
  // file faces the tangent boundary between the top plane and the fillet.
  const coverage = (a, b) => {
    let covered = 0;
    for (let n = 1; n < 100; n++) {
      const [x, y] = screen(a.clone().lerp(b, n / 100)).map(Math.round);
      let hit = false;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) if (ink(x + dx, y + dy)) hit = true;
      if (hit) covered++;
    }
    return covered / 99;
  };
  const top = FIELD.outer.top,
    endY = -FIELD.outerY;
  return {
    fillet,
    total,
    front: coverage(
      new THREE.Vector3(-60, endY, top),
      new THREE.Vector3(60, endY, top),
    ),
    tangent: brep ? coverage(fieldPoint(90, -80), fieldPoint(90, 80)) : 1,
    near: camera.near,
  };
};

const magentaAt = (pixels, size) => (x, y) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const i = (y * size + x) * 4;
  return pixels[i] > 180 && pixels[i + 1] < 120 && pixels[i + 2] > 180;
};
function readMagenta() {
  const gl = renderer.getContext(),
    pixels = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const ink = magentaAt(pixels, SIZE);
  let total = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if (ink(x, y)) total++;
  return { ink, total };
}
// Share of 99 points along a-b with magenta within two pixels.
function coverageOf(ink, a, b) {
  let covered = 0;
  for (let n = 1; n < 100; n++) {
    const q = a
      .clone()
      .lerp(b, n / 100)
      .project(camera);
    const x = Math.round((q.x + 1) * (SIZE / 2)),
      y = Math.round((q.y + 1) * (SIZE / 2));
    let hit = false;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (ink(x + dx, y + dy)) hit = true;
    if (hit) covered++;
  }
  return covered / 99;
}

/* One part, a 4 x 4 plate only 0.015 thick, seen at an angle: the edges of
   its rear face lie just behind its own front face. Marks on the part, an edge
   mark or the whole-part outline, must hide them as the front face does, and
   still draw the front edges whole. `faces`: "brep" (file faces, known on
   load), "mesh" (crease patches, after the display edges are built), or
   "pending" (crease patches not built yet). `double`: the part is drawn
   double-sided, so a mark facing away on both sides is not set aside by its
   facing and its own faces alone decide. */
const THIN = { x: 2, y: 2, z: 0.0075 };
window.thinMark = async ({
  kind = "edge",
  projection = "perspective",
  faces = "brep",
  eye = [5, 2, 10],
  double = false,
} = {}) => {
  for (const child of [...scene.children])
    if (child !== marks) scene.remove(child);
  marks.clear();
  context.meshMap.clear();
  context.displayEdges = [];
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(THIN.x * 2, THIN.y * 2, THIN.z * 2).toNonIndexed(),
    new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      side: double ? THREE.DoubleSide : THREE.FrontSide,
    }),
  );
  plate.userData.reviewId = "thin-plate";
  plate.updateMatrixWorld(true);
  plate.userData.fillTopology = buildFillTopology(
    plate.geometry,
    plate.matrixWorld,
  );
  if (faces === "brep")
    // BoxGeometry's six sides, two triangles each, as file faces.
    plate.userData.fillTopology.brep = {
      of: Int32Array.from({ length: 12 }, (_, t) => t >> 1),
      ranges: [0, 1, 2, 3, 4, 5].map((f) => [f * 2, f * 2 + 1]),
    };
  context.meshMap.set(plate.userData.reviewId, plate);
  scene.add(plate);
  context.meshes = [plate];
  context.model = { sha256: `thin-plate-${faces}` };
  if (faces === "mesh") {
    await context.buildDisplayEdges();
    if (context.displayError) throw new Error(context.displayError);
    context.displayEdges.forEach((e) => (e.visible = false));
  } else context.applyDisplayStyle();
  camera =
    projection === "perspective"
      ? new THREE.PerspectiveCamera(30, 1, 0.1, 100)
      : new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
  camera.aspect = 1;
  camera.position.set(...eye);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  NavigationMethods.prototype.updateNavigationProjection.call({
    camera,
    meshes: [plate],
    controls: { target: new THREE.Vector3() },
    navigationSize: 5.7,
  });
  const { x, y, z } = THIN;
  const V = (...p) => new THREE.Vector3(...p);
  // Rear face edges hidden from a (+x, +y, +z) eye: left and bottom.
  const hidden = [
    [V(-x, -y * 0.9, -z), V(-x, y * 0.9, -z)],
    [V(-x * 0.9, -y, -z), V(x * 0.9, -y, -z)],
  ];
  // Front face edges in sight: the left silhouette and the top.
  const shown = [
    [V(-x, -y * 0.9, z), V(-x, y * 0.9, z)],
    [V(-x * 0.9, y, z), V(x * 0.9, y, z)],
  ];
  const draw = (segments) => {
    marks.clear();
    if (kind === "edge")
      for (const [a, b] of segments)
        context.drawObjectMark(
          marks,
          {
            type: "edge",
            meshId: plate.userData.reviewId,
            points: [a.toArray(), b.toArray()],
            color: "#ff00ff",
          },
          false,
          false,
        );
    else {
      context.drawObjectMark(
        marks,
        { type: "part", meshIds: [plate.userData.reviewId], color: "#ff00ff" },
        false,
        false,
      );
      // The tinted overlay is not a line; leave only the outline.
      const outline = marks.children.find((c) => c.isLineSegments);
      for (const child of [...marks.children])
        if (child !== outline) marks.remove(child);
      if (segments === shown) return;
      // Keep only the outline's rear-face segments, with the faces production
      // gave them: the front ones lie a pixel away and would be counted too.
      const from = outline.geometry;
      const keep = [];
      const p = from.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        const a = V().fromBufferAttribute(p, i),
          b = V().fromBufferAttribute(p, i + 1);
        const rear = a.z < 0 && b.z < 0;
        const left = Math.abs(a.x + x) < 1e-6 && Math.abs(b.x + x) < 1e-6;
        const bottom = Math.abs(a.y + y) < 1e-6 && Math.abs(b.y + y) < 1e-6;
        if (rear && (left || bottom)) keep.push(i, i + 1);
      }
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(from.attributes)) {
        const array = new Float32Array(keep.length * attribute.itemSize);
        keep.forEach((v, k) =>
          array.set(
            attribute.array.subarray(
              v * attribute.itemSize,
              (v + 1) * attribute.itemSize,
            ),
            k * attribute.itemSize,
          ),
        );
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(array, attribute.itemSize),
        );
      }
      outline.geometry = geometry;
    }
  };
  draw(hidden);
  renderer.render(scene, camera);
  const rear = readMagenta();
  await new Promise((r) => setTimeout(r));
  if (kind === "part") {
    // The isolated segments must be the rear edges, and must reach the GPU.
    const outline = marks.children[0];
    if (outline.geometry.attributes.position.count !== 4)
      throw new Error("rear outline segments not found");
  }
  draw(shown);
  renderer.render(scene, camera);
  const front = readMagenta();
  return {
    hidden: rear.total,
    front: front.total,
    coverage: Math.min(...shown.map(([a, b]) => coverageOf(front.ink, a, b))),
  };
};

/* A cut-out surface: a plate in front whose left half its texture makes
   transparent (alpha test 0.5, through a texture offset), over a box whose
   front top edge runs behind both halves. Through the hole the edge is
   visible and whole; behind the solid half it is hidden. */
window.cutout = async ({ projection = "perspective" } = {}) => {
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0]),
    2,
    1,
  );
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.offset.set(0.5, 0);
  texture.needsUpdate = true;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 120).toNonIndexed(),
    new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  plate.position.z = 30;
  const solid = new THREE.Mesh(
    new THREE.BoxGeometry(100, 80, 20).toNonIndexed(),
    new THREE.MeshBasicMaterial({ color: 0xcccccc }),
  );
  await displayOnly(
    [plate, solid],
    `cutout-${projection}`,
    [0x000000, 0xff00ff],
  );
  camera =
    projection === "perspective"
      ? new THREE.PerspectiveCamera(30, 1, 0.1, 4000)
      : new THREE.OrthographicCamera(-140, 140, 140, -140, 0.1, 4000);
  camera.aspect = 1;
  camera.position.set(0, 60, 1000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  NavigationMethods.prototype.updateNavigationProjection.call({
    camera,
    meshes: [plate, solid],
    controls: { target: new THREE.Vector3() },
    navigationSize: 200,
  });
  renderer.render(scene, camera);
  const { ink } = readMagenta();
  // Magenta in the solid half's screen area, away from the hole's border.
  const edge = (x) => new THREE.Vector3(x, 40, 10).project(camera);
  const [left, right] = [edge(4), edge(80)].map((q) => (q.x + 1) * (SIZE / 2));
  let behind = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = Math.ceil(left); x < right; x++) if (ink(x, y)) behind++;
  return {
    hole: coverageOf(
      ink,
      new THREE.Vector3(-48, 40, 10),
      new THREE.Vector3(-4, 40, 10),
    ),
    behind,
  };
};

/* Marks on the field shell: an edge mark along a cavity edge (cavity end face
   and inner fillet, both turned towards the eye, 0.015 mm behind the outer
   fillet), and the whole-part outline. Neither may show on the outer fillet;
   the outline's grille end top edge stays whole. */
window.fieldMark = async ({
  kind = "edge",
  distance = 1000,
  projection = "perspective",
} = {}) => {
  for (const child of [...scene.children])
    if (child !== marks) scene.remove(child);
  marks.clear();
  context.meshMap.clear();
  context.displayEdges = [];
  const shell = fieldShell(true);
  context.meshMap.set(shell.userData.reviewId, shell);
  scene.add(shell);
  context.meshes = [shell];
  context.model = { sha256: "field-shell-marks" };
  context.applyDisplayStyle();
  const { cx, cz, r, arc } = FIELD.inner;
  const cavity = [];
  for (let k = 0; k <= arc; k++) {
    const a = ((k / arc) * Math.PI) / 2;
    cavity.push([cx + r * Math.cos(a), -FIELD.innerY, cz + r * Math.sin(a)]);
  }
  context.drawObjectMark(
    marks,
    kind === "edge"
      ? {
          type: "edge",
          meshId: shell.userData.reviewId,
          points: cavity,
          color: "#ff00ff",
        }
      : { type: "part", meshIds: [shell.userData.reviewId], color: "#ff00ff" },
    false,
    false,
  );
  // The tinted overlay is not a line; count lines only.
  for (const child of [...marks.children])
    if (child.isMesh) marks.remove(child);
  const centre = new THREE.Vector3(0, 0, 64);
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
  camera.up.set(0, 0, 1);
  camera.position
    .set(0.62, -0.55, 0.56)
    .normalize()
    .multiplyScalar(distance)
    .add(centre);
  camera.lookAt(centre);
  camera.updateMatrixWorld(true);
  NavigationMethods.prototype.updateNavigationProjection.call({
    camera,
    meshes: [shell],
    controls: { target: centre },
    navigationSize: 283,
  });
  renderer.render(scene, camera);
  const { fillet, total, ink } = filletInk(new THREE.Vector3());
  const top = FIELD.outer.top,
    endY = -FIELD.outerY;
  return {
    fillet,
    total,
    front:
      kind === "part"
        ? coverageOf(
            ink,
            new THREE.Vector3(-60, endY, top),
            new THREE.Vector3(60, endY, top),
          )
        : 1,
  };
};
