import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ModelViewer } from "../src/viewer.js";

test("moving pin occlusion settles to the same complete precise result", () => {
  const viewer = Object.create(ModelViewer.prototype);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  mesh.updateMatrixWorld();
  Object.assign(viewer, {
    container: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
    camera: new THREE.PerspectiveCamera(38, 4 / 3, 0.01, 100),
    controls: { target: new THREE.Vector3() },
    scratch: { world: new THREE.Vector3(), projected: new THREE.Vector3() },
    occlusionAt: { position: new THREE.Vector3(), target: new THREE.Vector3() },
    annotationsVisible: true,
    sectionContains: () => true,
    sectionHits: () => viewer.ray.intersectObject(mesh),
    ray: new THREE.Raycaster(),
    invalidate() {},
    pins: [-0.5, 0.5].flatMap((z) =>
      [-0.2, 0, 0.2].map((x) => ({
        a: { position: [x, 0, z] },
        mesh,
        el: { style: {} },
      })),
    ),
  });
  viewer.camera.position.set(0, 0, 4);
  viewer.camera.lookAt(0, 0, 0);
  viewer.camera.updateMatrixWorld();
  viewer.placePins();
  viewer.navigationPointers = new Set([1]);
  viewer.camera.position.set(0, 0, -4);
  viewer.camera.lookAt(0, 0, 0);
  viewer.camera.updateMatrixWorld();
  viewer.placePins();
  viewer.navigationPointers.clear();
  clearTimeout(viewer.occlusionTimer);
  viewer.occlusionValid = false;
  viewer.placePins();
  const settled = viewer.pins.map((p) => !p.el.hidden);
  assert.deepEqual(settled, [true, true, true, false, false, false]);
  viewer.occlusionValid = false;
  for (const pin of viewer.pins) delete pin.unoccluded;
  viewer.placePins();
  assert.deepEqual(
    viewer.pins.map((p) => !p.el.hidden),
    settled,
  );
});
