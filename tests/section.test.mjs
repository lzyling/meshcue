import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  sectionPlane,
  sectionRange,
  retainedPoint,
  sectionIntersection,
  sectionPick,
  sectionSegment,
} from "../src/section.js";
import { ModelViewer } from "../src/viewer.js";
const V = THREE.Vector3;
const identity = new THREE.Matrix4();
const bounds = new THREE.Box3(new V(-10, -7, 2), new V(30, 9, 8));

test("section ranges use source bounds and default to their midpoint", () => {
  assert.deepEqual(sectionRange(bounds, "x"), {
    min: -10,
    max: 30,
    offset: 10,
  });
  assert.deepEqual(sectionRange(bounds, "y"), { min: -7, max: 9, offset: 1 });
  assert.deepEqual(sectionRange(bounds, "z"), { min: 2, max: 8, offset: 5 });
});
test("section side tests retain the plane and flip the removed half", () => {
  for (const axis of ["x", "y", "z"]) {
    const at = new V();
    at[axis] = 4;
    const plane = sectionPlane({ axis, offset: 4 }, identity);
    assert.ok(retainedPoint(at, plane));
    at[axis] = 5;
    assert.equal(retainedPoint(at, plane), false);
    assert.ok(
      retainedPoint(
        at,
        sectionPlane({ axis, offset: 4, flip: true }, identity),
      ),
    );
  }
  assert.ok(retainedPoint(new V(100, 100, 100), null));
});
test("section planes follow centering, scaling and the STEP/STL Z-up turn", () => {
  const root = new THREE.Object3D();
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(0.15);
  root.position.set(1, -2, 3);
  root.updateMatrixWorld();
  for (const axis of ["x", "y", "z"]) {
    const plane = sectionPlane({ axis, offset: 5 }, root.matrixWorld);
    const p = new V(5, 5, 5).applyMatrix4(root.matrixWorld);
    assert.ok(Math.abs(plane.distanceToPoint(p)) < 1e-10);
    const removed = new V(5, 5, 5);
    removed[axis]++;
    assert.equal(
      retainedPoint(removed.applyMatrix4(root.matrixWorld), plane),
      false,
    );
  }
  assert.ok(
    sectionPlane({ axis: "z", offset: 5 }, root.matrixWorld).normal.distanceTo(
      new V(0, -1, 0),
    ) < 1e-10,
  );
});
const hit = (z, normal = new V(0, 0, 1), matrixWorld = identity) => ({
  point: new V(0, 0, z),
  face: { normal },
  object: { matrixWorld },
});
const plane = sectionPlane({ axis: "z", offset: 0 }, identity);
const direction = new V(0, 0, -1);
test("section picking discards removed hits and accepts exposed front faces", () => {
  const hits = [hit(3), hit(-1), hit(-3)];
  assert.equal(sectionPick(hits, plane, direction), hits[1]);
  assert.equal(sectionPick(hits, null, direction), hits[0]);
  assert.equal(sectionPick([hit(3)], plane, direction), null);
});
test("section fill blocks marking and occludes geometry behind it", () => {
  const hits = [hit(3), hit(-1, new V(0, 0, -1)), hit(-3)];
  assert.equal(sectionPick(hits, plane, direction), null);
  assert.equal(sectionIntersection(hits, plane), hits[1]);
  assert.equal(sectionPick([], plane, direction), null);
});
test("section picking transforms face normals into the ray's world frame", () => {
  const turn = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const face = hit(-1, new V(0, -1, 0), turn);
  assert.equal(sectionPick([face], plane, direction), face);
  face.face.normal.negate();
  assert.equal(sectionPick([face], plane, direction), null);
});
test("measurement corner snapping cannot jump onto the removed side", () => {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.geometry.userData.sourceFaces = [0];
  mesh.userData.fillTopology = {
    vertices: [
      [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 2, 0],
      ],
    ],
  };
  mesh.updateMatrixWorld();
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    sectionClips: [sectionPlane({ axis: "x", offset: 0 }, identity)],
    toScreen: (p) => [p.x, p.y],
    modelFrame: () => identity,
  });
  const picked = viewer.snapPoint(
    { object: mesh, faceIndex: 0, point: new V(-0.1, 0, 0) },
    1,
    0,
  );
  assert.ok(picked.point.x <= 0);
});
test("section BVH queries inspect both sides and restore material and ray options", () => {
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.geometry.computeBoundsTree({ indirect: true });
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new V(0, 0, 2), direction);
  ray.firstHitOnly = true;
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    section: {},
    meshes: [mesh],
    ray,
  });
  const hits = viewer.sectionHits();
  assert.ok(hits.some((h) => h.point.z < 0));
  assert.equal(material.side, THREE.FrontSide);
  assert.equal(ray.firstHitOnly, true);
  mesh.geometry.disposeBoundsTree();
  mesh.geometry.dispose();
  material.dispose();
});

test("section edge snapping uses only the visible portion without moving source endpoints", () => {
  const a = new V(0, 0, -2),
    b = new V(0, 0, 2);
  const result = sectionSegment(a, b, plane);
  assert.deepEqual(
    result.map((p) => p.toArray()),
    [
      [0, 0, -2],
      [0, 0, 0],
    ],
  );
  assert.deepEqual(b.toArray(), [0, 0, 2]);
  assert.equal(sectionSegment(b, new V(0, 0, 3), plane), null);
  assert.deepEqual(sectionSegment(a, b, null), [a, b]);
});
test("section restores shared and array material sides and clips cached overlays", () => {
  const front = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const back = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const line = new THREE.LineBasicMaterial();
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    section: {},
    sectionClips: [plane],
    sectionSides: new Map(),
    meshes: [{ material: front }, { material: [front, back] }],
    markMaterials: new Map(),
    lineMaterials: new Map([["test", line]]),
  });
  viewer.applySectionMaterials();
  assert.equal(front.side, THREE.FrontSide);
  assert.equal(back.side, THREE.FrontSide);
  assert.equal(line.clippingPlanes[0], plane);
  viewer.section = null;
  viewer.sectionClips = [];
  viewer.applySectionMaterials();
  assert.equal(front.side, THREE.DoubleSide);
  assert.equal(back.side, THREE.BackSide);
  assert.equal(line.clippingPlanes.length, 0);
  front.dispose();
  back.dispose();
  line.dispose();
});
