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
  const top = rotateDirection(new THREE.Vector3(0, 0, 1), 0, 90);
  assert.ok(top.y > 0.999);
  const adjacent = rotateDirection(top, 0, -90);
  assert.ok(adjacent.z > 0.999);
  assert.ok(rotateDirection(top, 90, 0).x > 0.999);
  for (const start of [
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(0, 1, 0),
  ]) {
    for (const degrees of [5, 15, 90]) {
      near(
        THREE.MathUtils.radToDeg(
          start.angleTo(rotateDirection(start, degrees, 0)),
        ),
        degrees,
        0.01,
      );
    }
  }
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

test("navigation cursor zoom fixes the picked surface on screen and clamps the actual orbit distance", () => {
  for (const orthographic of [false, true]) {
    const camera = orthographic
      ? new THREE.OrthographicCamera(-4, 4, 3, -3, 0.001, 100)
      : new THREE.PerspectiveCamera(38, 4 / 3, 0.001, 100);
    camera.fov = 38;
    camera.aspect = 4 / 3;
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const anchor = new THREE.Vector3(0.7, 0.2, 1);
    const before = anchor.clone().project(camera);
    const target = new THREE.Vector3();
    const viewer = Object.assign(new NavigationMethods(), {
      camera,
      ray: new THREE.Raycaster(),
      controls: {
        target,
        minDistance: 0.003,
        maxDistance: 60,
        minZoom: 0.05,
        maxZoom: 1000,
        update: () => {
          camera.lookAt(target);
          camera.updateMatrixWorld();
        },
      },
      renderer: {
        domElement: {
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 800,
            height: 600,
          }),
        },
      },
      rayAt: (x, y) => {
        viewer.ray.setFromCamera(
          new THREE.Vector2(x / 400 - 1, 1 - y / 300),
          camera,
        );
        return { point: anchor.clone() };
      },
    });
    viewer.zoomNavigation(0.8, (before.x + 1) * 400, (1 - before.y) * 300);
    const after = anchor.clone().project(camera);
    near(before.x, after.x);
    near(before.y, after.y);
    if (!orthographic) {
      near(camera.position.distanceTo(target), 4);
      viewer.zoomNavigation(1000, 400, 300);
      near(camera.position.distanceTo(target), 60);
    } else {
      near(camera.zoom, 1.25);
      viewer.zoomNavigation(1e-8, 400, 300);
      near(camera.zoom, 1000);
    }
  }
});

test("R2 bug 6: fitting reserves asymmetric overlay space in both projections", () => {
  const box = new THREE.Box3(
    new THREE.Vector3(-2, -3, -1),
    new THREE.Vector3(2, 3, 1),
  );
  const area = { left: 0.08, right: 0.94, top: 0.1, bottom: 0.7 };
  for (const ortho of [false, true]) {
    const frame = fitFrame(
      box,
      new THREE.Vector3(4, 2.8, 5),
      0.8,
      38,
      ortho,
      area,
    );
    const camera = ortho
      ? new THREE.OrthographicCamera(
          (-frame.height * 0.8) / 2,
          (frame.height * 0.8) / 2,
          frame.height / 2,
          -frame.height / 2,
          0.001,
          1000,
        )
      : new THREE.PerspectiveCamera(38, 0.8, 0.001, 1000);
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    camera.updateMatrixWorld();
    for (const point of boxCorners(box)) {
      point.project(camera);
      assert.ok(
        (point.x + 1) / 2 >= area.left && (point.x + 1) / 2 <= area.right,
      );
      assert.ok(
        (1 - point.y) / 2 >= area.top && (1 - point.y) / 2 <= area.bottom,
      );
    }
  }
});

test("R2 bug 6: controller changes revoke automatic fitting after keyboard or mark navigation", () => {
  const documentBefore = globalThis.document,
    windowBefore = globalThis.window;
  const events = new Map();
  try {
    globalThis.document = { createElement: () => ({}) };
    globalThis.window = { addEventListener() {} };
    const viewer = {
      navigationFitOnLayout: true,
      controls: {
        addEventListener: (type, listener) => events.set(type, listener),
      },
      renderer: { domElement: { addEventListener() {} } },
      container: { append() {} },
      addFrameHook() {},
      updateNavigationProjection() {},
    };
    NavigationMethods.prototype.setupNavigation.call(viewer);
    // Keyboard pan/zoom and Frame move controls without a pointer start.
    // Their shared change event must protect the new camera from a late panel.
    events.get("change")();
    assert.equal(viewer.navigationFitOnLayout, false);
  } finally {
    if (documentBefore === undefined) delete globalThis.document;
    else globalThis.document = documentBefore;
    if (windowBefore === undefined) delete globalThis.window;
    else globalThis.window = windowBefore;
  }
});
