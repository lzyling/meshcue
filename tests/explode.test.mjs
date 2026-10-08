import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  explodeUnits,
  explodeOffsets,
  explodeTargets,
  explodeBaseIndex,
  ExplodeMethods,
} from "../src/viewer/explode.js";
import { PickingMethods } from "../src/viewer/picking.js";
const box = (x) =>
  new THREE.Box3(
    new THREE.Vector3(x - 1, -1, -1),
    new THREE.Vector3(x + 1, 1, 1),
  );
test("outward directions, zero reset and deterministic targets", () => {
  const boxes = [box(-3), box(3), box(0)];
  const offsets = explodeOffsets(boxes, [true, true, true], 0.5);
  assert.ok(offsets[0].x < 0 && offsets[1].x > 0);
  assert.ok(offsets[0].length() > 0);
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
  let visible = true;
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
      meshVisible: (id) => id === "p" || visible,
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
  const cached = viewer.explodeCache;
  ExplodeMethods.prototype.setExplode.call(viewer, 0.5, "part");
  assert.equal(viewer.explodeCache, cached);
  ExplodeMethods.prototype.setExplode.call(viewer, 0, "part");
  assert.deepEqual(parent.matrix.toArray(), matrices[0].toArray());
  assert.deepEqual(child.matrix.toArray(), matrices[1].toArray());
  assert.equal(child.matrixAutoUpdate, true);
  visible = false;
  ExplodeMethods.prototype.setExplode.call(viewer, 0.5, "part");
  assert.notEqual(viewer.explodeCache, cached);
  const hiddenCache = viewer.explodeCache;
  ExplodeMethods.prototype.setExplode.call(viewer, 0.5, "group");
  assert.notEqual(viewer.explodeCache, hiddenCache);
  ExplodeMethods.prototype.setExplode.call(viewer, 0, "part");
});

const bounds = (min, max) =>
  new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
function separated(boxes, offsets, ground = -Infinity) {
  const moved = boxes.map((b, i) => b.clone().translate(offsets[i]));
  moved.forEach((b, i) => {
    assert.ok(b.min.y >= Math.min(ground, boxes[i].min.y));
    for (let j = 0; j < i; j++)
      assert.equal(b.intersectsBox(moved[j]), false, `overlap ${i}/${j}`);
  });
}
test("enclosing base fixed, all parts outside and above their original ground", () => {
  const boxes = [bounds([-5, 0, -5], [5, 10, 5]), box(-2), box(2), box(0)];
  const visible = boxes.map(() => true);
  assert.equal(explodeBaseIndex(boxes, visible), 0);
  const targets = explodeTargets(boxes, visible);
  assert.equal(targets[0].length(), 0);
  separated(boxes, targets, 0);
  assert.deepEqual(
    targets.map((v) => v.toArray()),
    explodeTargets(boxes, visible).map((v) => v.toArray()),
  );
});
test("without an enclosing frame every unit moves and boxes separate", () => {
  const boxes = [box(-3), box(0), box(3)];
  const visible = boxes.map(() => true);
  assert.equal(explodeBaseIndex(boxes, visible), -1);
  const offsets = explodeTargets(boxes, visible);
  assert.ok(offsets.every((v) => v.length() > 0));
  separated(boxes, offsets, -1);
});
test("concentric slender part extracts along its longest axis", () => {
  const boxes = [
    bounds([-5, -5, -5], [5, 5, 5]),
    bounds([-0.1, -3, -0.1], [0.1, 3, 0.1]),
    box(0),
  ];
  const offsets = explodeTargets(boxes, [true, true, true]);
  assert.equal(offsets[1].x, 0);
  assert.equal(offsets[1].z, 0);
  assert.ok(offsets[1].y > 0);
  separated(boxes, offsets, -5);
});
test("two-level groups separate internally and globally, including base siblings", () => {
  const boxes = [
    bounds([-5, -5, -5], [5, 5, 5]),
    box(0),
    box(0),
    box(1),
    box(1),
  ];
  const visible = boxes.map(() => true);
  const groups = [
    [0, 1, 2],
    [3, 4],
  ];
  const targets = explodeTargets(boxes, visible, groups);
  assert.equal(targets[0].length(), 0);
  separated(boxes, targets, -5);
  assert.ok(
    explodeOffsets(boxes, visible, 0, groups).every((v) => v.length() === 0),
  );
  const half = explodeOffsets(boxes, visible, 0.5, groups);
  targets.forEach((v, i) =>
    assert.deepEqual(
      half[i].toArray(),
      v.clone().multiplyScalar(0.5).toArray(),
    ),
  );
});
test("hidden units cannot change visible targets", (t) => {
  const boxes = [box(-3), box(3), bounds([-100, -100, -100], [100, 100, 100])];
  const full = explodeTargets(boxes, [true, true, false]);
  const shown = explodeTargets(boxes.slice(0, 2), [true, true]);
  assert.deepEqual(
    full.slice(0, 2).map((v) => v.toArray()),
    shown.map((v) => v.toArray()),
  );
  const many = Array.from({ length: 150 }, (_, i) => box((i % 10) * 0.1));
  const start = performance.now();
  const targets = explodeTargets(
    many,
    many.map(() => true),
    Array.from({ length: 15 }, (_, g) =>
      Array.from({ length: 10 }, (_, j) => g * 10 + j),
    ),
  );
  const ms = performance.now() - start;
  separated(many, targets, -1);
  assert.ok(ms < 200, `150 unit planning: ${ms}ms`);
  t.diagnostic(`150 unit grouped planning: ${ms.toFixed(3)}ms`);
});
