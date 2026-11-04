import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  addPointDepth,
  addSphereDepth,
  coneDepth,
  emptyDepth,
  fittedRange,
  planeDepth,
  SURFACE_LINE_SHIFT,
} from "../src/viewer/depth-range.js";
import { NavigationMethods } from "../src/viewer/navigation.js";

// A deterministic pseudo-random sequence, so a failure can be replayed.
function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// The nearest depth of sphere ∩ cone by brute force, in the plane through
// the axis and the centre (rho, z), sampled finely.
function sampledConeDepth(z, rho, r, tan) {
  let nearest = Infinity;
  const steps = 400;
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps; j++) {
      const p = rho - r + (2 * r * i) / steps,
        q = z - r + (2 * r * j) / steps;
      if ((p - rho) ** 2 + (q - z) ** 2 > r * r) continue;
      if (q < 0 || Math.abs(p) > q * tan) continue;
      nearest = Math.min(nearest, q);
    }
  return nearest;
}

test("depth range: a sphere's nearest depth inside the view cone", () => {
  // No cone: the sphere's own nearest depth, as the display-edge pass uses.
  assert.equal(coneDepth(10, 3, 2), 8);
  assert.equal(coneDepth(10, 50, 2), 8);
  // On the axis, in front: the same.
  assert.equal(coneDepth(10, 0, 2, 0.5), 8);
  // Eye inside the sphere: not above zero, so the distance planes apply.
  assert.ok(coneDepth(1, 0.5, 2, 0.5) <= 0);
  // Entirely beside the cone, or behind the eye: no bound at all.
  assert.equal(coneDepth(10, 30, 2, 0.5), Infinity);
  assert.equal(coneDepth(-10, 0, 2, 0.5), Infinity);
  // Beside the eye and reaching into the cone further out: positive, where
  // its plain interval along the axis would have been negative.
  const beside = coneDepth(2, 12, 11, 0.5);
  assert.ok(beside > 0 && beside < Infinity, String(beside));
  const next = random(7);
  for (let k = 0; k < 300; k++) {
    const z = next() * 40 - 10,
      rho = next() * 30,
      r = 0.5 + next() * 15,
      tan = 0.2 + next() * 0.8;
    if (rho * rho + z * z <= r * r) continue;
    const exact = coneDepth(z, rho, r, tan);
    const sampled = sampledConeDepth(z, rho, r, tan);
    if (sampled === Infinity) {
      // Missed by the samples: either really outside, or a sliver thinner
      // than one sample step.
      if (exact !== Infinity) assert.ok(exact >= -1e-9, String(exact));
      continue;
    }
    // Conservative (never past a point that is in view), and tight: within
    // what a grid of samples can resolve where the cone's edge cuts the
    // sphere at a shallow angle (a few hundredths of the radius).
    assert.ok(exact <= sampled + 1e-9, `${exact} > ${sampled}`);
    assert.ok(exact >= sampled - 0.05 * r, `${exact} << ${sampled}`);
  }
});

test("depth range: the ground's nearest depth inside the frustum", () => {
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 1000);
  const next = random(11);
  for (let k = 0; k < 60; k++) {
    camera.position.set(next() * 20 - 10, 0.2 + next() * 10, next() * 20 - 10);
    camera.lookAt(next() * 4 - 2, next() * 8 - 4, next() * 4 - 2);
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const right = new THREE.Vector3(e[0], e[1], e[2]).normalize(),
      up = new THREE.Vector3(e[4], e[5], e[6]).normalize(),
      forward = new THREE.Vector3(-e[8], -e[9], -e[10]).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(19)),
      tanX = tanY * camera.aspect;
    const bound = planeDepth(
      0,
      camera.position,
      right,
      up,
      forward,
      tanX,
      tanY,
    );
    let sampled = Infinity;
    for (let i = 0; i <= 60; i++)
      for (let j = 0; j <= 60; j++) {
        const ray = forward
          .clone()
          .addScaledVector(right, (i / 30 - 1) * tanX)
          .addScaledVector(up, (j / 30 - 1) * tanY);
        const t = -camera.position.y / ray.y;
        if (ray.y < 0 && t > 0) sampled = Math.min(sampled, t);
      }
    if (sampled === Infinity) assert.equal(bound, Infinity);
    else assert.ok(Math.abs(bound - sampled) < 1e-9 * sampled);
  }
});

test("depth range: fitting near and far", () => {
  // Nothing bounds the scene: the distance planes, untouched.
  assert.deepEqual(fittedRange(emptyDepth(), 0.01, 100), {
    near: 0.01,
    far: 100,
  });
  // Camera inside the bounds: near stays, far never comes in.
  assert.deepEqual(fittedRange({ nearest: -2, farthest: 8 }, 0.01, 100), {
    near: 0.01,
    far: 100,
  });
  // Zoomed out: near comes out to just short of the model.
  const fitted = fittedRange({ nearest: 80, farthest: 90 }, 0.009, 103);
  assert.ok(fitted.near < 80 && fitted.near > 79.9, String(fitted.near));
  assert.equal(fitted.far, 103);
  // Far moves out when the model reaches past it, never in.
  assert.ok(fittedRange({ nearest: 1, farthest: 500 }, 0.01, 100).far > 500);
});

test("depth range: a sphere outside the view adds nothing", () => {
  const range = emptyDepth();
  const geometry = new THREE.SphereGeometry(1);
  addSphereDepth(
    range,
    geometry,
    new THREE.Matrix4().makeTranslation(0, 0, 20),
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, -1),
    0.5,
  );
  assert.deepEqual(range, emptyDepth());
});

/* The viewer's own projection update, on a minimal viewer: parts as boxes
   under a root, a camera, a target, optional ground and part visibility. */
function viewerWith({ parts = [], ground = null, hidden = new Set() } = {}) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const meshes = parts.map(({ size = [1, 1, 1], at = [0, 0, 0] }, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
    mesh.position.fromArray(at);
    mesh.userData.reviewId = `part-${i}`;
    root.add(mesh);
    return mesh;
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh);
  const camera = new THREE.PerspectiveCamera(38, 1.5, 0.01, 100);
  const viewer = Object.create(NavigationMethods.prototype);
  Object.assign(viewer, {
    scene,
    root,
    meshes,
    camera,
    controls: { target: new THREE.Vector3() },
    parts: { meshVisible: (id) => !hidden.has(id) },
    navigationSize: box.isEmpty()
      ? undefined
      : box.getSize(new THREE.Vector3()).length(),
    grid: ground ? { visible: true, position: { y: ground } } : null,
  });
  return viewer;
}
function look(viewer, from, at = [0, 0, 0]) {
  viewer.camera.position.fromArray(from);
  viewer.controls.target.fromArray(at);
  viewer.camera.lookAt(viewer.controls.target);
  viewer.updateNavigationProjection();
  return viewer.camera;
}
const legacy = (viewer) =>
  Math.max(
    (viewer.navigationSize || 3) * 1e-6,
    viewer.camera.position.distanceTo(viewer.controls.target) * 1e-4,
  );

// Every vertex in the frustum's sides must be between near and far.
function assertNothingCut(viewer) {
  const camera = viewer.camera;
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse;
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
    tanX = tanY * camera.aspect;
  for (const mesh of viewer.meshes) {
    if (!viewer.parts.meshVisible(mesh.userData.reviewId)) continue;
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld)
        .applyMatrix4(view);
      const depth = -p.z;
      if (depth <= 0) continue;
      if (Math.abs(p.x) > depth * tanX || Math.abs(p.y) > depth * tanY)
        continue;
      assert.ok(depth >= camera.near, `${depth} < near ${camera.near}`);
      assert.ok(depth <= camera.far, `${depth} > far ${camera.far}`);
    }
  }
}

test("navigation depth: zoomed out, near comes out to the model", () => {
  const viewer = viewerWith({ parts: [{ size: [3, 0.3, 3] }] });
  const camera = look(viewer, [0, 60, 60]);
  const radius = Math.hypot(1.5, 0.15, 1.5);
  assert.ok(camera.near > 84.85 - radius - 0.01, String(camera.near));
  assert.ok(camera.near < 84.86 - radius, String(camera.near));
  assert.ok(camera.near > legacy(viewer) * 1000);
  assertNothingCut(viewer);
});

test("navigation depth: inside the parts' bounds the distance planes apply", () => {
  const viewer = viewerWith({ parts: [{ size: [3, 1, 3] }] });
  const camera = look(viewer, [0.2, 0.1, 0.3], [0, 0, 0]);
  assert.equal(camera.near, legacy(viewer));
  assertNothingCut(viewer);
});

test("navigation depth: an empty scene keeps the distance planes", () => {
  const viewer = viewerWith();
  const camera = look(viewer, [0, 0, 10]);
  assert.equal(camera.near, Math.max(3e-6, 10 * 1e-4));
  assert.equal(camera.far, Math.max(12, 10 + 12));
});

test("navigation depth: hidden parts do not hold near back", () => {
  // A part between the camera and the model, then hidden two ways.
  const parts = [
    { size: [2, 2, 2] },
    { size: [0.5, 0.5, 0.5], at: [0, 0, 20] },
  ];
  const shown = viewerWith({ parts });
  assert.ok(look(shown, [0, 0, 40]).near < 20);
  const hidden = viewerWith({ parts, hidden: new Set(["part-1"]) });
  assert.ok(look(hidden, [0, 0, 40]).near > 38);
  const invisible = viewerWith({ parts });
  invisible.meshes[1].visible = false;
  assert.ok(look(invisible, [0, 0, 40]).near > 38);
});

test("navigation depth: exploded parts move the range with them", () => {
  const viewer = viewerWith({
    parts: [{ size: [1, 1, 1] }, { size: [1, 1, 1], at: [0, 0, 1] }],
  });
  const before = look(viewer, [0, 0, 50]).near;
  // An explosion writes matrices; the next frame's world update reads them.
  viewer.meshes[1].position.z = 15;
  viewer.scene.updateMatrixWorld(true);
  const after = look(viewer, [0, 0, 50]).near;
  assert.ok(after < before - 13, `${after} vs ${before}`);
  assertNothingCut(viewer);
});

test("navigation depth: a part beside the view does not pull near in", () => {
  // A large part next to the camera, off screen: its sphere reaches behind
  // the eye along the view axis, but none of it is in view.
  const viewer = viewerWith({
    parts: [{ size: [1, 1, 1] }, { size: [10, 10, 10], at: [40, 0, 40] }],
  });
  const camera = look(viewer, [0, 0, 40]);
  assert.ok(camera.near > 38, String(camera.near));
  assertNothingCut(viewer);
});

test("navigation depth: the ground in view bounds near", () => {
  const viewer = viewerWith({
    parts: [{ size: [3, 1, 3] }],
    ground: -0.5,
  });
  const camera = look(viewer, [0, 2, 60]);
  // Every ray through the frustum that meets the ground meets it beyond near.
  camera.updateMatrixWorld();
  const tanY = Math.tan(THREE.MathUtils.degToRad(19)),
    tanX = tanY * camera.aspect;
  const inverse = new THREE.Matrix3().setFromMatrix4(camera.matrixWorld);
  let nearestGround = Infinity;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const ray = new THREE.Vector3(
        (i / 20 - 1) * tanX,
        (j / 20 - 1) * tanY,
        -1,
      ).applyMatrix3(inverse);
      const t = (-0.5 - 2) / ray.y;
      if (t > 0) nearestGround = Math.min(nearestGround, t);
    }
  assert.ok(nearestGround < 57, String(nearestGround));
  assert.ok(camera.near <= nearestGround, `${camera.near} > ${nearestGround}`);
  assert.ok(camera.near > legacy(viewer) * 100);
  // Under the ground it is not drawn and does not count.
  viewer.grid.visible = false;
  assert.ok(look(viewer, [0, 2, 60]).near > 57);
});

test("navigation depth: orthographic keeps the distance planes", () => {
  const viewer = viewerWith({ parts: [{ size: [3, 1, 3] }] });
  viewer.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
  viewer.camera.aspect = 1;
  const camera = look(viewer, [0, 30, 30]);
  assert.equal(camera.near, legacy(viewer));
});

test("navigation depth: nothing in view is ever cut, from anywhere", () => {
  const next = random(23);
  const parts = Array.from({ length: 12 }, () => ({
    size: [0.2 + next() * 2, 0.2 + next() * 2, 0.2 + next() * 2],
    at: [next() * 6 - 3, next() * 2, next() * 6 - 3],
  }));
  const viewer = viewerWith({ parts, ground: -0.2 });
  for (let k = 0; k < 200; k++) {
    const distance = 0.05 + next() ** 2 * 80;
    const direction = new THREE.Vector3(
      next() * 2 - 1,
      next() * 2 - 0.5,
      next() * 2 - 1,
    ).normalize();
    const target = new THREE.Vector3(
      next() * 6 - 3,
      next() * 2,
      next() * 6 - 3,
    );
    look(
      viewer,
      target.clone().addScaledVector(direction, distance).toArray(),
      target.toArray(),
    );
    assertNothingCut(viewer);
  }
});

/* What the colour pass draws besides the parts. A viewer's overlays carry a
   kept measurement's lines (tagged `explodeMeasure`) and the lines drawn on
   surfaces (tagged with the shift their shader applies); readings hang at
   points in the model's frame. */
function withOverlays(viewer) {
  viewer.overlay = new THREE.Group();
  viewer.agentOverlay = new THREE.Group();
  viewer.scene.add(viewer.overlay, viewer.agentOverlay);
  viewer.measureAnchors = [];
  viewer.pins = [];
  return viewer;
}
const pointsGeometry = (points) =>
  new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(...p)),
  );
const depthOf = (camera, point) => {
  camera.updateMatrixWorld();
  return -new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse).z;
};

test("navigation depth: a kept measurement's line off the parts bounds near", () => {
  // A part at the origin and a kept dimension reaching 2 toward the camera,
  // to where a plane's extension can put its end.
  const viewer = withOverlays(
    viewerWith({ parts: [{ size: [0.2, 0.2, 0.2] }] }),
  );
  const line = new THREE.Object3D();
  line.geometry = pointsGeometry([
    [0, 0, 0],
    [0, 0, 2],
  ]);
  line.userData.explodeMeasure = { kind: "planes" };
  viewer.overlay.add(line);
  viewer.scene.updateMatrixWorld(true);
  const camera = look(viewer, [0, 0, 5]);
  assert.ok(camera.near < depthOf(camera, [0, 0, 2]), String(camera.near));
  // Hidden with the marks, it is not drawn and does not count.
  viewer.overlay.visible = false;
  assert.ok(look(viewer, [0, 0, 5]).near > 4.8);
  // Neither does an overlay child that is not a measurement's line.
  viewer.overlay.visible = true;
  delete line.userData.explodeMeasure;
  assert.ok(look(viewer, [0, 0, 5]).near > 4.8);
});

test("navigation depth: readings off the parts bound near where on screen", () => {
  const viewer = withOverlays(
    viewerWith({ parts: [{ size: [0.2, 0.2, 0.2] }] }),
  );
  viewer.root.scale.setScalar(2);
  viewer.scene.updateMatrixWorld(true);
  // A circle's centre, kept; its reading hangs there, in the model's frame.
  viewer.pins.push({ model: new THREE.Vector3(0, 0, 1) });
  let camera = look(viewer, [0, 0, 6]);
  assert.ok(camera.near < depthOf(camera, [0, 0, 2]), String(camera.near));
  // With the marks hidden, so is the reading.
  viewer.annotationsVisible = false;
  assert.ok(look(viewer, [0, 0, 6]).near > 5.5);
  // The measurement being taken has its reading too.
  viewer.measureAnchors.push({ model: new THREE.Vector3(0, 0, 1.5) });
  camera = look(viewer, [0, 0, 6]);
  assert.ok(camera.near < depthOf(camera, [0, 0, 3]), String(camera.near));
  // A reading off screen, or behind the eye, does not hold near back.
  viewer.measureAnchors[0].model.set(40, 0, 1.5);
  assert.ok(look(viewer, [0, 0, 6]).near > 5.5);
  viewer.measureAnchors[0].model.set(0, 0, 4);
  assert.ok(look(viewer, [0, 0, 6]).near > 5.5);
});

test("depth range: a point counts only inside the cone and in front", () => {
  const eye = new THREE.Vector3(),
    forward = new THREE.Vector3(0, 0, -1);
  const range = emptyDepth();
  addPointDepth(range, new THREE.Vector3(0.4, 0, -1), eye, forward, 0.5);
  assert.deepEqual(range, { nearest: 1, farthest: 1 });
  addPointDepth(range, new THREE.Vector3(0.6, 0, -0.5), eye, forward, 0.5);
  addPointDepth(range, new THREE.Vector3(0, 0, 0.5), eye, forward, 0.5);
  assert.deepEqual(range, { nearest: 1, farthest: 1 });
});

/* The surface line shader (viewer/marks.js), point by point: lift along the
   normal to the eye's side, then a share of the depth toward the eye. */
function drawnSurfacePoint(camera, point, normal, shift) {
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse;
  const at = point.clone().applyMatrix4(view);
  const lift = normal
    .clone()
    .multiplyScalar(shift.lift)
    .applyMatrix3(new THREE.Matrix3().setFromMatrix4(view));
  at.add(lift.dot(at.clone().negate()) < 0 ? lift.negate() : lift);
  return at.multiplyScalar(1 - shift.toward);
}

test("navigation depth: lines the shader moves toward the eye stay past near", () => {
  // The case that needs it: the nearest part is small, the camera far. Its
  // face is barely behind the sphere's nearest point; the line on it is
  // drawn a fixed lift plus a thousandth of eighty units nearer.
  const next = random(41);
  const viewer = withOverlays(
    viewerWith({ parts: [{ size: [0.004, 0.004, 0.004] }] }),
  );
  const half = 0.002;
  const points = [],
    normals = [];
  for (let i = 0; i < 64; i++) {
    const p = [next() * 2 - 1, next() * 2 - 1, 1].map((v) => v * half);
    points.push(p);
    normals.push(new THREE.Vector3(0, 0, 1));
  }
  for (const group of [viewer.overlay, viewer.agentOverlay]) {
    const line = new THREE.Object3D();
    line.geometry = pointsGeometry(points);
    line.userData.depthShift = SURFACE_LINE_SHIFT;
    group.add(line);
  }
  viewer.scene.updateMatrixWorld(true);
  const check = (from) => {
    const camera = look(viewer, from);
    let drawn = 0;
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
      tanX = tanY * camera.aspect;
    points.forEach((p, i) => {
      const at = drawnSurfacePoint(
        camera,
        new THREE.Vector3(...p),
        normals[i],
        SURFACE_LINE_SHIFT,
      );
      const depth = -at.z;
      if (Math.abs(at.x) > depth * tanX || Math.abs(at.y) > depth * tanY)
        return;
      drawn++;
      assert.ok(depth >= camera.near, `${depth} < near ${camera.near}`);
    });
    assert.ok(drawn > 0);
    return camera;
  };
  for (const distance of [0.5, 3, 20, 80]) check([0, 0, distance]);
  for (let k = 0; k < 50; k++) {
    const direction = new THREE.Vector3(
      next() * 2 - 1,
      next() * 2 - 1,
      next() * 2 - 0.2,
    ).normalize();
    check(direction.multiplyScalar(0.05 + next() ** 2 * 80).toArray());
  }
  // Without the allowance the fitted near is in front of the drawn line.
  for (const group of [viewer.overlay, viewer.agentOverlay])
    for (const line of group.children) delete line.userData.depthShift;
  const camera = look(viewer, [0, 0, 80]);
  const at = drawnSurfacePoint(
    camera,
    new THREE.Vector3(0, 0, half),
    normals[0],
    SURFACE_LINE_SHIFT,
  );
  assert.ok(-at.z < camera.near, `${-at.z} >= ${camera.near}`);
});

test("depth range: a shift grows the sphere by the lift and takes its share", () => {
  const range = addSphereDepth(
    emptyDepth(),
    new THREE.SphereGeometry(1),
    new THREE.Matrix4().makeScale(2, 2, 2),
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, -1),
    Infinity,
    { lift: 0.5, toward: 0.1 },
  );
  // Radius (1 + 0.5) × 2 = 3: nearest 7, nine tenths of it drawn.
  assert.ok(Math.abs(range.nearest - 6.3) < 1e-6, String(range.nearest));
  assert.ok(Math.abs(range.farthest - 13) < 1e-6, String(range.farthest));
});
