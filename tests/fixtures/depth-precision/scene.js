// A ~500 mm assembly drawn through the real viewer. A white insert floats
// 0.4 mm (top face to top face) above a red base, the two faces parallel and
// facing the same way, nowhere coplanar. Seen from far enough away the depth
// buffer used to stop telling them apart and red came through the white.
//
// Model coordinates are millimetres, Z up, as a CAD export would be.
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { ModelViewer } from "../../../src/viewer.js";
import { modelDigest } from "../../../src/browser-crypto.js";

const INSERT = { half: 145, top: 30.4 };
const BASE = { half: 160, top: 30 };
// A small bushing with a 2 mm hole, standing on its own off a corner of the
// base: the close-up the near plane must never cut into. Off the base, so a
// camera a few millimetres from it can be outside every part's bounding
// sphere, where near really is moved out to the nearest part.
const BUSHING = { x: 200, y: -200, bottom: 0, height: 2, half: 3, hole: 1 };

const material = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
function box(name, color, [sx, sy, sz], [x, y, z]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    material(color),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
}
function bushing() {
  const { half, hole, height } = BUSHING;
  const shape = new THREE.Shape()
    .moveTo(-half, -half)
    .lineTo(half, -half)
    .lineTo(half, half)
    .lineTo(-half, half)
    .closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, hole, 0, Math.PI * 2, true));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 32,
  });
  const mesh = new THREE.Mesh(geometry, material(0x7a8a99));
  mesh.name = "bushing";
  mesh.position.set(BUSHING.x, BUSHING.y, BUSHING.bottom);
  return mesh;
}
function assembly() {
  const scene = new THREE.Scene();
  const baseThickness = 20;
  scene.add(
    box(
      "base",
      0xd02020,
      [BASE.half * 2, BASE.half * 2, baseThickness],
      [0, 0, BASE.top - baseThickness / 2],
    ),
    // 0.2 mm thick and 0.2 mm clear of the base: the two upward faces are
    // 0.4 mm apart and no face of one lies in a face of the other.
    box(
      "insert",
      0xf2f2f2,
      [INSERT.half * 2, INSERT.half * 2, 0.2],
      [0, 0, INSERT.top - 0.1],
    ),
    box("foot-a", 0x888888, [20, 20, 10], [-150, -150, 5]),
    box("foot-b", 0x888888, [20, 20, 10], [150, 150, 5]),
    bushing(),
  );
  return scene;
}

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
const legacy = viewer.updateNavigationProjection;

window.ready = (async () => {
  const data = await new GLTFExporter().parseAsync(assembly(), {
    binary: true,
  });
  const sha256 = await modelDigest(data);
  const url = URL.createObjectURL(new Blob([data]));
  await viewer.load(
    { id: "depth", name: "depth.glb", format: "glb", sha256, up: "z" },
    url,
  );
  viewer.render();
  return { meshes: viewer.meshes.length, size: viewer.navigationSize };
})();

const world = (x, y, z) =>
  new THREE.Vector3(x, y, z).applyMatrix4(viewer.root.matrixWorld);
/* Looking down at about 76 degrees. At the zoom limit a pixel spans about
   7 mm of this model, and the rasteriser places vertices to a fraction of a
   pixel: on a face steep enough to the view, that rounding alone moves its
   depth by more than 0.4 mm and red comes through even in orthographic,
   whose depth steps are linear and tiny. That is the 0.4 mm gap being a
   twentieth of a pixel, not the depth range; this view keeps it out (at
   about 57 degrees it showed in both projections alike). */
const VIEW = new THREE.Vector3(0.15, 1, 0.2).normalize();

// The distance-only depth range every release up to 1.5.2 used. Kept here as
// a reference renderer: at a close-up it cannot have cut anything away.
function useReference(on) {
  viewer.updateNavigationProjection = on
    ? function () {
        const camera = this.camera;
        const distance = camera.position.distanceTo(this.controls.target);
        const size = this.navigationSize || 3;
        camera.near = Math.max(size * 1e-6, distance * 1e-4);
        camera.far = Math.max(size * 4, distance + size * 4);
        camera.updateProjectionMatrix();
      }
    : legacy;
}

// What the distance-only formula would put near at for the current camera.
const legacyNear = () =>
  Math.max(
    (viewer.navigationSize || 3) * 1e-6,
    viewer.camera.position.distanceTo(viewer.controls.target) * 1e-4,
  );

function setFog(fog) {
  if (!fog) viewer.scene.fog = null;
  else viewer.applyTheme();
}

// Fit, then stand k times as far along the same line (or at the zoom limit).
window.place = ({
  tier = 1,
  projection = "perspective",
  fog = false,
  view = VIEW.toArray(),
} = {}) => {
  const direction = new THREE.Vector3().fromArray(view).normalize();
  setFog(fog);
  viewer.setProjection(projection, false);
  viewer.fitAll({ animate: false, direction: direction.clone() });
  const target = viewer.controls.target.clone();
  const fit = viewer.camera.position.distanceTo(target);
  if (projection === "perspective") {
    const distance = tier === "max" ? viewer.controls.maxDistance : fit * tier;
    viewer.applyNavigation(
      target.clone().addScaledVector(direction, distance),
      target,
      viewer.navigationHeight(),
    );
  } else if (tier === "max") {
    viewer.camera.zoom = viewer.controls.minZoom;
    viewer.camera.updateProjectionMatrix();
    viewer.controls.update();
  } else {
    viewer.camera.zoom /= tier;
    viewer.camera.updateProjectionMatrix();
    viewer.controls.update();
  }
  return {
    fit,
    distance: viewer.camera.position.distanceTo(viewer.controls.target),
    size: viewer.navigationSize,
  };
};

function frame() {
  viewer.render();
  const gl = viewer.renderer.getContext();
  const width = gl.drawingBufferWidth,
    height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  // Same task as the draw: the drawing buffer has not been presented yet.
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { pixels, width, height };
}
const toPixel = (point, width, height) => {
  const p = point.clone().project(viewer.camera);
  return [((p.x + 1) / 2) * width, ((p.y + 1) / 2) * height];
};
function inside(polygon, x, y) {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i],
      [bx, by] = polygon[(i + 1) % polygon.length];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
const reddish = (r, g, b) => r - Math.max(g, b) > 40;
const whitish = (r, g, b) => Math.min(r, g, b) > 170 && r - Math.min(g, b) < 25;

// The insert's top face, inset by a tenth on every side so its outline and
// display edges stay out of the count. Pixels counted inside it: coverage;
// of those, how many are red (the base showing through) and how many white.
window.measure = ({ inset = 0.1 } = {}) => {
  const { pixels, width, height } = frame();
  const h = INSERT.half * (1 - inset);
  const polygon = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ].map(([x, y]) => toPixel(world(x, y, INSERT.top), width, height));
  const xs = polygon.map((p) => p[0]),
    ys = polygon.map((p) => p[1]);
  let coverage = 0,
    red = 0,
    white = 0;
  const x0 = Math.max(0, Math.floor(Math.min(...xs))),
    x1 = Math.min(width - 1, Math.ceil(Math.max(...xs))),
    y0 = Math.max(0, Math.floor(Math.min(...ys))),
    y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(polygon, x + 0.5, y + 0.5)) continue;
      coverage++;
      const i = (y * width + x) * 4;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      if (reddish(r, g, b)) red++;
      else if (whitish(r, g, b)) white++;
    }
  return {
    coverage,
    red,
    white,
    near: viewer.camera.near,
    legacyNear: legacyNear(),
    far: viewer.camera.far,
    distance: viewer.camera.position.distanceTo(viewer.controls.target),
  };
};

// Stand `mm` millimetres from the top of the bushing's hole, looking into it,
// and compare the frame with the reference renderer: any pixel the near
// plane cut away would differ.
window.closeUp = ({ mm }) => {
  setFog(true);
  viewer.setProjection("perspective", false);
  const target = world(BUSHING.x, BUSHING.y, BUSHING.bottom + BUSHING.height);
  const direction = new THREE.Vector3(0.2, 1, 0.3).normalize();
  const unit = viewer.root.matrixWorld.getMaxScaleOnAxis();
  viewer.applyNavigation(
    target.clone().addScaledVector(direction, mm * unit),
    target,
    viewer.navigationHeight(),
  );
  const shown = frame();
  const near = viewer.camera.near;
  const legacy = legacyNear();
  const minDistance = viewer.controls.minDistance / unit;
  useReference(true);
  let reference;
  try {
    reference = frame();
  } finally {
    useReference(false);
  }
  let differing = 0,
    backdrop = 0;
  const hex = viewer.scene.background.getHex();
  const bgRGB = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  for (let i = 0; i < shown.pixels.length; i += 4) {
    const d = Math.max(
      Math.abs(shown.pixels[i] - reference.pixels[i]),
      Math.abs(shown.pixels[i + 1] - reference.pixels[i + 1]),
      Math.abs(shown.pixels[i + 2] - reference.pixels[i + 2]),
    );
    if (d > 8) differing++;
    if (
      Math.abs(shown.pixels[i] - bgRGB[0]) <= 3 &&
      Math.abs(shown.pixels[i + 1] - bgRGB[1]) <= 3 &&
      Math.abs(shown.pixels[i + 2] - bgRGB[2]) <= 3
    )
      backdrop++;
  }
  return {
    differing,
    backdrop,
    total: shown.pixels.length / 4,
    near: near / unit,
    legacyNear: legacy / unit,
    minDistance,
  };
};

// Low and far: the ground grid in front of the model must still be drawn up
// to the bottom of the frame, exactly as the reference renderer draws it.
window.groundView = ({ tier = 2 } = {}) => {
  setFog(true);
  viewer.setProjection("perspective", false);
  const direction = new THREE.Vector3(0.6, 0.18, 1).normalize();
  viewer.fitAll({ animate: false, direction });
  const target = viewer.controls.target.clone();
  const fit = viewer.camera.position.distanceTo(target);
  viewer.applyNavigation(
    target.clone().addScaledVector(direction, fit * tier),
    target,
    viewer.navigationHeight(),
  );
  const shown = frame();
  const near = viewer.camera.near;
  useReference(true);
  let reference;
  try {
    reference = frame();
  } finally {
    useReference(false);
  }
  // Only the bottom quarter: the ground in front of the model, where a near
  // plane fitted too tightly would cut the grid off. Cut off, a grid line
  // leaves bare backdrop where the reference has ink; the reference's own
  // depth fighting elsewhere only changes one colour of ink for another.
  const hex = viewer.scene.background.getHex();
  const bgRGB = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const bare = (p, i) =>
    Math.abs(p[i] - bgRGB[0]) <= 3 &&
    Math.abs(p[i + 1] - bgRGB[1]) <= 3 &&
    Math.abs(p[i + 2] - bgRGB[2]) <= 3;
  let differing = 0,
    missing = 0,
    counted = 0;
  const rows = Math.floor(shown.height / 4);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < shown.width; x++) {
      const i = (y * shown.width + x) * 4;
      counted++;
      if (
        Math.max(
          Math.abs(shown.pixels[i] - reference.pixels[i]),
          Math.abs(shown.pixels[i + 1] - reference.pixels[i + 1]),
          Math.abs(shown.pixels[i + 2] - reference.pixels[i + 2]),
        ) > 8
      ) {
        differing++;
        if (bare(shown.pixels, i) && !bare(reference.pixels, i)) missing++;
      }
    }
  return { differing, missing, counted, near, legacyNear: legacyNear() };
};

window.useReference = useReference;
