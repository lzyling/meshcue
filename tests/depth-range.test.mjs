import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  addSphereDepth,
  coneDepth,
  emptyDepth,
  fittedRange,
  planeDepth,
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
