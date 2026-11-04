// What the colour pass draws over the parts that is not on them, through the
// real viewer: a kept measurement whose line runs out to a plane's
// extension, or round a circle whose centre is off the part, and the lines
// drawn on a surface (a region's boundary, the Agent's echo), which the
// shader moves toward the eye. A near plane fitted to the parts alone cut
// all of these off: the measurement's line and its reading once the
// measurement was kept, the surface lines when the part nearest the camera
// was a small one seen from far away.
//
// Model coordinates, Y up. The ground is moved out of the way in every
// scene: seen from the side it is in view in front of the model, and would
// bound near on its own and hide what is being tested.
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { ModelViewer } from "../../../src/viewer.js";
import { modelDigest } from "../../../src/browser-crypto.js";

const material = (color) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0,
    side: THREE.DoubleSide,
  });
const SLANT = new THREE.Vector3(1, 0, 1).normalize();

const scenes = {
  /* Two small plates two units apart, parallel, both turned 45 degrees to
     the view. The distance between their planes is read square to them,
     from the second plate's point to its foot on the first plate's plane:
     a point between the plates, one unit toward the camera, on no part. */
  planes() {
    const scene = new THREE.Scene();
    for (const [name, x] of [
      ["right", 1],
      ["left", -1],
    ]) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.4),
        material(0xd8dde0),
      );
      plate.name = name;
      plate.position.set(x, 0, 0);
      plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), SLANT);
      scene.add(plate);
    }
    return scene;
  },
  /* A shallow strip of a cylinder, 50 degrees of a unit circle, seen from
     inside: the circle through three points on it has its centre most of a
     radius in front of the strip, and its ring passes nearer still. */
  circle() {
    const scene = new THREE.Scene();
    const strip = new THREE.Mesh(
      new THREE.CylinderGeometry(
        1,
        1,
        0.6,
        40,
        1,
        true,
        Math.PI - THREE.MathUtils.degToRad(25),
        THREE.MathUtils.degToRad(50),
      ),
      material(0xd8dde0),
    );
    strip.name = "strip";
    scene.add(strip);
    return scene;
  },
  /* A large block and, in front of it, a ball a quarter of its width and a
     cube of 10, a thirtieth. With the others hidden, either is the nearest
     (and only) part; at the zoom limit the front of each is a few
     hundredths of a unit behind its bounding sphere, less than the lines on
     it are drawn toward the eye. The cube's are within its sphere's span,
     where only allowing for the shift itself keeps them. */
  ball() {
    const scene = new THREE.Scene();
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(300, 60, 300),
      material(0x888888),
    );
    block.name = "block";
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(75, 48, 32),
      material(0xd8dde0),
    );
    ball.name = "ball";
    ball.position.set(0, 0, 220);
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      material(0xd8dde0),
    );
    cube.name = "cube";
    cube.position.set(110, 0, 200);
    scene.add(block, ball, cube);
    return scene;
  },
};

const container = document.getElementById("viewer");
const viewer = new ModelViewer(container, {
  onReady: async () => {},
  onEdit() {},
  onPin() {},
  onPaint() {},
  onStrokeEnd() {},
  onError(message) {
    window.viewerError = String(message);
  },
});
window.viewer = viewer;

window.loadScene = async (name) => {
  const data = await new GLTFExporter().parseAsync(scenes[name](), {
    binary: true,
  });
  const sha256 = await modelDigest(data);
  const url = URL.createObjectURL(new Blob([data]));
  await viewer.load(
    { id: name, name: `${name}.glb`, format: "glb", sha256, up: "y" },
    url,
  );
  viewer.setGridY(1e6);
  viewer.scene.fog = null;
  viewer.render();
  return { meshes: viewer.meshes.length, size: viewer.navigationSize };
};

const meshNamed = (name) =>
  viewer.meshes.find((mesh) => {
    for (let o = mesh; o; o = o.parent) if (o.name === name) return true;
    return false;
  });
const model = (x, y, z) =>
  new THREE.Vector3(x, y, z).applyMatrix4(viewer.root.matrixWorld);

/* Fit along `direction`, then stand `tier` times as far (or at the zoom
   limit), as the wheel would leave the camera. */
function place({ direction = [0, 0, 1], tier = 1 } = {}) {
  const along = new THREE.Vector3().fromArray(direction).normalize();
  viewer.fitAll({ animate: false, direction: along.clone() });
  const target = viewer.controls.target.clone();
  const fit = viewer.camera.position.distanceTo(target);
  const distance = tier === "max" ? viewer.controls.maxDistance : fit * tier;
  viewer.applyNavigation(
    target.clone().addScaledVector(along, distance),
    target,
    viewer.navigationHeight(),
  );
  return { fit, distance };
}

function frame() {
  viewer.render();
  const gl = viewer.renderer.getContext();
  const width = gl.drawingBufferWidth,
    height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { pixels, width, height };
}
/* The distance-only depth range every release up to 1.5.2 used: its near
   plane is a ten-thousandth of the distance, nowhere near any of this. */
function legacyProjection() {
  const camera = this.camera;
  const distance = camera.position.distanceTo(this.controls.target);
  const size = this.navigationSize || 3;
  camera.near = Math.max(size * 1e-6, distance * 1e-4);
  camera.far = Math.max(size * 4, distance + size * 4);
  camera.updateProjectionMatrix();
}
/* The frame drawn with and without `objects`, through one projection
   (the viewer's own unless `projection` is given): whatever differs between
   the two is what they drew. */
function frames(objects, projection) {
  if (projection) viewer.updateNavigationProjection = projection;
  try {
    const shown = frame();
    const visible = objects.map((o) => o.visible);
    viewer.updateNavigationProjection = () => {};
    for (const o of objects) o.visible = false;
    try {
      return { shown, bare: frame(), near: viewer.camera.near };
    } finally {
      objects.forEach((o, i) => (o.visible = visible[i]));
    }
  } finally {
    delete viewer.updateNavigationProjection;
  }
}
const differs = (a, b, i) =>
  Math.max(
    Math.abs(a[i] - b[i]),
    Math.abs(a[i + 1] - b[i + 1]),
    Math.abs(a[i + 2] - b[i + 2]),
  ) > 30;

/* Along a polyline (world points), every two pixels or so where it is on
   screen: how many of those places the line drew on, within a pixel. */
function inked(points, shown, bare) {
  const { width, height } = shown;
  const camera = viewer.camera;
  camera.updateMatrixWorld();
  let samples = 0,
    hits = 0;
  const at = new THREE.Vector3();
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1],
      b = points[k];
    const pa = a.clone().project(camera),
      pb = b.clone().project(camera);
    const span = Math.hypot(
      ((pa.x - pb.x) * width) / 2,
      ((pa.y - pb.y) * height) / 2,
    );
    const steps = Math.max(1, Math.min(2000, Math.ceil(span / 2)));
    for (let s = 0; s <= steps; s++) {
      at.lerpVectors(a, b, s / steps);
      const view = at.clone().applyMatrix4(camera.matrixWorldInverse);
      if (view.z >= 0) continue;
      const p = at.clone().project(camera);
      if (Math.abs(p.x) > 0.97 || Math.abs(p.y) > 0.97) continue;
      const x = Math.round(((p.x + 1) / 2) * width - 0.5),
        y = Math.round(((p.y + 1) / 2) * height - 0.5);
      samples++;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++)
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          hit = differs(shown.pixels, bare.pixels, i);
        }
      if (hit) hits++;
    }
  }
  return { samples, inked: hits };
}

/* Measure as a reviewer does, by clicking, then keep it: the viewer's
   measureMark and setAnnotations, which is what the page's Keep does once
   it has the lock and saved the draft. */
window.measureAndKeep = (kind) => {
  viewer.setMode("measure");
  viewer.setMeasureKind(kind);
  place({ direction: [0, 0, 1] });
  viewer.render();
  const click = (world) => {
    const [x, y] = viewer.toScreen(world);
    viewer.measureClick(x, y);
  };
  if (kind === "planes") {
    // The right plate first: the reading's line then runs from the left
    // plate's point to its foot on the right plate's plane.
    click(model(1, 0, 0));
    click(model(-1, 0, 0));
  } else
    for (const degrees of [-15, 0, 15]) {
      const theta = Math.PI + THREE.MathUtils.degToRad(degrees);
      click(model(Math.sin(theta), 0, Math.cos(theta)));
    }
  const mark = viewer.measureMark();
  if (!mark) return null;
  viewer.clearMeasure();
  viewer.setMode("orbit");
  viewer.setAnnotations([
    { id: "kept", type: "measure", label: "A", ...mark, view: null },
  ]);
  viewer.render();
  return mark;
};

/* A kept measurement from where `view` puts the camera: how much of its
   line is drawn where it is on screen, and whether its reading shows. */
window.keptMeasureView = (view) => {
  const placed = place(view);
  const pin = viewer.pins.find((p) => p.model);
  const lines = viewer.overlay.children.filter(
    (o) => o.userData.explodeMeasure,
  );
  const { shown, bare, near } = frames(lines);
  const polyline = (
    pin.ring || pin.a.points.map((p) => new THREE.Vector3(...p))
  ).map((p) => p.clone().applyMatrix4(viewer.root.matrixWorld));
  const anchor = pin.model.clone().applyMatrix4(viewer.root.matrixWorld);
  const projected = anchor.clone().project(viewer.camera);
  return {
    ...placed,
    near,
    ...inked(polyline, shown, bare),
    readingHidden: pin.el.hidden,
    anchorInFrame: Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1,
    anchorDepth: -anchor.applyMatrix4(viewer.camera.matrixWorldInverse).z,
  };
};

/* A region marked on the front of `part` (the ball or the cube), as a
   reviewer's mark and as the Agent's echo, with every other part hidden
   once the camera is at `view`. How many pixels each set of surface lines drew. */
window.surfaceLines = (view, part = "ball") => {
  const marked = meshNamed(part);
  const others = viewer.meshes.filter((mesh) => mesh !== marked);
  const show = (value) => {
    for (const mesh of others)
      viewer.parts.setVisible(
        viewer.parts.partOfMesh(mesh.userData.reviewId),
        value,
      );
  };
  // Zoomed out over the whole model first, then the rest hidden: hiding
  // parts leaves the camera where it is.
  const placed = place(view);
  show(false);
  // Its faces turned to the camera within 20 degrees.
  if (!marked.geometry.boundingSphere) marked.geometry.computeBoundingSphere();
  const centre = marked.geometry.boundingSphere.center
    .clone()
    .applyMatrix4(marked.matrixWorld);
  const toward = viewer.camera.position.clone().sub(centre).normalize();
  const faces = [];
  const count =
    (marked.geometry.index?.count ??
      marked.geometry.attributes.position.count) / 3;
  const normal = new THREE.Vector3();
  for (let face = 0; face < count; face++) {
    const t = viewer.triangle(marked, face);
    for (const corner of [t.a, t.b, t.c])
      corner.applyMatrix4(marked.matrixWorld);
    if (
      t.getNormal(normal).dot(toward) > Math.cos(THREE.MathUtils.degToRad(20))
    )
      faces.push(face);
  }
  const region = {
    id: "front",
    type: "region",
    label: "1",
    color: "#e0442a",
    faces: { [marked.userData.reviewId]: faces },
  };
  /* One at a time: the echo's dashes move between any two frames. Each
     against the same lines drawn with the distance-only near plane, which
     cannot have cut them. */
  const drawn = (group) => {
    const lines = group.children.filter((o) => o.isLineSegments2);
    const count = ({ shown, bare }) => {
      let pixels = 0;
      for (let i = 0; i < shown.pixels.length; i += 4)
        if (differs(shown.pixels, bare.pixels, i)) pixels++;
      return pixels;
    };
    const fitted = frames(lines);
    const reference = frames(lines, legacyProjection);
    return {
      lines: lines.length,
      pixels: count(fitted),
      reference: count(reference),
      near: fitted.near,
      referenceNear: reference.near,
    };
  };
  viewer.setAnnotations([region]);
  const outline = drawn(viewer.overlay);
  viewer.setAnnotations([]);
  viewer.setAgentEcho({
    id: "echo-front",
    versionId: viewer.model.id,
    annotations: [{ ...region, id: "echo" }],
  });
  const echo = drawn(viewer.agentOverlay);
  const result = {
    ...placed,
    faces: faces.length,
    outline,
    echo,
    depth: -centre.clone().applyMatrix4(viewer.camera.matrixWorldInverse).z,
  };
  viewer.setAgentEcho(null);
  viewer.setAnnotations([]);
  show(true);
  return result;
};
