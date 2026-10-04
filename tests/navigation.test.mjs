import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  boxCorners,
  easeNavigation,
  fitFrame,
  perspectiveDistance,
  rotateDirection,
  visibleHeight,
  zoomLimits,
} from "../src/viewer/navigation-math.js";
import { NavigationMethods } from "../src/viewer/navigation.js";

const near = (a, b, epsilon = 1e-9) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test("navigation fit contains all corners in portrait and landscape perspective", () => {
  const box = new THREE.Box3(
    new THREE.Vector3(-5, -1, -2),
    new THREE.Vector3(5, 1, 2),
  );
  for (const aspect of [0.4, 1, 2.5]) {
    for (const direction of [
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0.0001),
    ]) {
      const frame = fitFrame(box, direction, aspect);
      const camera = new THREE.PerspectiveCamera(38, aspect, 0.0001, 1000);
      camera.position.copy(frame.position);
      camera.lookAt(frame.target);
      camera.updateMatrixWorld();
      for (const corner of boxCorners(box)) {
        const point = corner.project(camera);
        assert.ok(
          Math.abs(point.x) < 1 &&
            Math.abs(point.y) < 1 &&
            Math.abs(point.z) < 1,
        );
      }
    }
  }
});

test("navigation orthographic fit has margin and equivalent perspective target-plane framing", () => {
  const box = new THREE.Box3(
    new THREE.Vector3(-2, -3, -1),
    new THREE.Vector3(2, 3, 1),
  );
  const frame = fitFrame(box, new THREE.Vector3(0, 0, 1), 0.5, 38, true);
  near(frame.height, 8 * 1.08);
  for (const distance of [0.003, 1, 30, 10000])
    near(perspectiveDistance(visibleHeight(distance)), distance);
});

test("navigation zoom limits scale with tiny and large models", () => {
  for (const size of [0.0001, 3, 1000000]) {
    const limits = zoomLimits(size);
    near(limits.min / size, 0.001);
    near(limits.max / size, 20);
  }
});

test("navigation arrow turns use exact angles and stay finite at the poles", () => {
  for (const degrees of [5, 15, 90]) {
    const start = new THREE.Vector3(0, 0, 1);
    near(
      THREE.MathUtils.radToDeg(
        start.angleTo(rotateDirection(start, degrees, 0)),
      ),
      degrees,
    );
    near(
      THREE.MathUtils.radToDeg(
        start.angleTo(rotateDirection(start, 0, degrees)),
      ),
      degrees,
      0.01,
    );
  }
  const top = rotateDirection(new THREE.Vector3(0, 0, 1), 0, -90);
  assert.ok(top.y > 0.999);
  const adjacent = rotateDirection(top, 0, 90);
  assert.ok(adjacent.z > 0.999);
});

test("navigation easing has stationary ends and animation cancellation preserves the current view", () => {
  near(easeNavigation(0), 0);
  near(easeNavigation(1), 1);
  near(easeNavigation(0.5), 0.5);
  assert.ok(easeNavigation(0.001) < 0.00001);
  near(easeNavigation(-1), 0);
  near(easeNavigation(2), 1);
  const viewer = Object.assign(new NavigationMethods(), {
    camera: { position: new THREE.Vector3(0, 0, 5) },
    controls: { target: new THREE.Vector3() },
    enabled: true,
    reduceMotion: { matches: false },
    navigationHeight: () => 4,
  });
  viewer.animateNavigation(new THREE.Vector3(5, 0, 0), new THREE.Vector3());
  assert.ok(viewer.navigationAnimation);
  viewer.cancelNavigation();
  assert.equal(viewer.navigationAnimation, null);
  assert.deepEqual(viewer.camera.position.toArray(), [0, 0, 5]);
  viewer.reduceMotion.matches = true;
  let applied;
  viewer.applyNavigation = (...args) => {
    applied = args;
  };
  viewer.animateNavigation(new THREE.Vector3(5, 0, 0), new THREE.Vector3());
  assert.equal(viewer.navigationAnimation, null);
  assert.deepEqual(applied[0].toArray(), [5, 0, 0]);
});
