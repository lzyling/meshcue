import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  explodeUnits,
  explodeOffsets,
  ExplodeMethods,
} from "../src/viewer/explode.js";
import { PickingMethods } from "../src/viewer/picking.js";
const box = (x) =>
  new THREE.Box3(
    new THREE.Vector3(x - 1, -1, -1),
    new THREE.Vector3(x + 1, 1, 1),
  );
test("radial distances, zero reset and stable centre fallback", () => {
  const boxes = [box(-3), box(3), box(0)];
  const offsets = explodeOffsets(boxes, [true, true, true], 0.5);
  assert.ok(offsets[0].x < 0 && offsets[1].x > 0);
  assert.ok(Math.abs(offsets[0].length() - Math.sqrt(72) * 0.3) < 1e-12);
  assert.deepEqual(
    offsets[2].toArray(),
    explodeOffsets(boxes, [true, true, true], 0.5)[2].toArray(),
  );
  assert.ok(
    explodeOffsets(boxes, [true, true, true], 0).every((v) => v.length() === 0),
  );
  assert.ok(
    explodeOffsets([box(0), box(20)], [true, false], 1)[0].length() > 0,
  );
});
test("group unions are disjoint; uncovered and non-leaf own geometry survive", () => {
  const parts = [
    { id: "root", parentId: null, meshIds: ["a", "b", "c"] },
    { id: "a", parentId: "root", meshIds: ["a"] },
    { id: "b", parentId: "root", meshIds: ["b"] },
  ];
  assert.deepEqual(explodeUnits(parts, [{ meshIds: ["a", "b"] }]), [
    ["a", "b"],
    ["c"],
  ]);
  assert.deepEqual(explodeUnits(parts, [], "part"), [["c"], ["a"], ["b"]]);
  assert.deepEqual(
    explodeUnits(parts, [{ meshIds: ["a"] }, { meshIds: ["a", "b"] }]),
    [["a"], ["b"], ["c"]],
  );
});
test("exploded hits store mesh local positions and canonical model frames", () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(2, 0, 0);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const base = mesh.matrix.clone();
  mesh.position.x += 5;
  root.updateMatrixWorld(true);
  mesh.userData.reviewId = "m";
  mesh.geometry.userData.sourceFaces = [0];
  const viewer = {
    root,
    explodeBase: new Map([[mesh, { matrix: base }]]),
    triangle: () =>
      new THREE.Triangle(
        new THREE.Vector3(),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ),
  };
  const pin = PickingMethods.prototype.pinFromHit.call(viewer, {
    object: mesh,
    point: mesh.localToWorld(new THREE.Vector3(0.2, 0.3, 0)),
    faceIndex: 0,
    face: { normal: new THREE.Vector3(0, 0, 1) },
  });
  assert.ok(Math.abs(pin.position[0] - 0.2) < 1e-12);
  assert.deepEqual(
    new THREE.Vector3()
      .setFromMatrixPosition(
        PickingMethods.prototype.modelFrame.call(viewer, mesh),
      )
      .toArray(),
    [2, 0, 0],
  );
});

test("nested meshes translate once, preserve geometry and restore exact local matrices", () => {
  const root = new THREE.Group();
  const parent = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  const child = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  parent.position.set(-2, 0, 0);
  child.position.set(4, 0, 0);
  parent.add(child);
  root.add(parent);
  parent.userData.reviewId = "p";
  child.userData.reviewId = "c";
  root.updateMatrixWorld(true);
  const matrices = [parent.matrix.clone(), child.matrix.clone()];
  const geometry = child.geometry;
  const parts = [
    { id: "p", parentId: null, meshIds: ["p", "c"] },
    { id: "c", parentId: "p", meshIds: ["c"] },
  ];
  const viewer = {
    root,
    meshes: [parent, child],
    meshMap: new Map([
      ["p", parent],
      ["c", child],
    ]),
    parts: {
      list: () => parts,
      groupList: () => [],
      meshVisible: () => true,
      selected: () => null,
    },
    highlightPart() {},
    placePins() {},
    placeReadings() {},
  };
  ExplodeMethods.prototype.prepareExplode.call(viewer);
  ExplodeMethods.prototype.setExplode.call(viewer, 1, "part");
  assert.ok(parent.matrixWorld.elements[12] < -2);
  assert.ok(child.matrixWorld.elements[12] > 2);
  assert.equal(child.geometry, geometry);
  ExplodeMethods.prototype.setExplode.call(viewer, 0, "part");
  assert.deepEqual(parent.matrix.toArray(), matrices[0].toArray());
  assert.deepEqual(child.matrix.toArray(), matrices[1].toArray());
  assert.equal(child.matrixAutoUpdate, true);
});
