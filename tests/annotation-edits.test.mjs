import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  letterLabel,
  erasePatches,
  paintIndex,
  addPatches,
} from "../src/annotation-edits.js";
import { buildFillTopology, planarFaces } from "../src/planar-fill.js";

/* Coverage is stored as the clipped polygon now, not as a fan of triangles cut
   from it, so area is the shoelace over every corner. The invariant each of
   these asserts — how much surface survives an erase — is unchanged; only the
   number of objects it arrives in is. */
const polygonArea = (vertices) =>
  Math.abs(
    vertices.reduce((sum, a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      return sum + (a[0] * b[1] - b[0] * a[1]);
    }, 0),
  ) / 2;

test("a bucket spans a tessellated plane but stops at a box edge", () => {
  const g = new THREE.BoxGeometry(2, 2, 2, 4, 4, 4);
  const t = buildFillTopology(g, new THREE.Matrix4());
  assert.equal(planarFaces(t, 0, 6).length, 32);
});
test("fixed seed direction prevents a gradual cylinder from becoming one fill", () => {
  const g = new THREE.CylinderGeometry(1, 1, 2, 120, 1, true);
  const t = buildFillTopology(g, new THREE.Matrix4());
  const faces = planarFaces(t, 0, 6);
  assert.ok(faces.length > 2 && faces.length < 20);
  for (const f of faces)
    assert.ok(
      t.normals[f].dot(t.normals[0]) >= Math.cos((6 * Math.PI) / 180) - 1e-10,
    );
});
test("parallel disconnected planes do not share a bucket fill", () => {
  const g = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 4, 0, 0, 3, 1, 0],
      3,
    ),
  );
  const t = buildFillTopology(g, new THREE.Matrix4());
  assert.deepEqual(planarFaces(t, 0, 30), [0]);
});
test("eraser removes only its subtriangle and preserves other mesh ownership", () => {
  const p = {
    meshId: "mesh-0",
    faceIndex: 0,
    sourceFaceIndex: 0,
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
  };
  const cut = {
    ...p,
    vertices: [
      [0, 0, 0],
      [0.5, 0, 0],
      [0, 0.5, 0],
    ],
  };
  const other = { ...p, meshId: "mesh-1" };
  const out = erasePatches([p, other], [cut]);
  const area = out
    .filter((p) => p.meshId === "mesh-0")
    .reduce((sum, p) => sum + polygonArea(p.vertices), 0);
  assert.ok(Math.abs(area - 0.375) < 1e-8);
  assert.deepEqual(
    out.find((p) => p.meshId === "mesh-1"),
    other,
  );
  assert.deepEqual(p.vertices, [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ]);
  assert.equal(letterLabel(26), "Z");
  assert.equal(letterLabel(27), "AA");
});

for (const scale of [1, 1e-5, 1e5])
  test(`eraser is scale independent and preserves disjoint patches (${scale})`, () => {
    const patch = (vertices) => ({
      meshId: "mesh-0",
      faceIndex: 0,
      sourceFaceIndex: 0,
      vertices: vertices.map((p) => p.map((v) => (v + 20) * scale)),
    });
    const subject = patch([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const disjoint = patch([
      [2, 0.25, 0],
      [3, 0.25, 0],
      [2, 0.75, 0],
    ]);
    assert.deepEqual(erasePatches([subject], [disjoint]), [subject]);
    const cutter = patch([
      [0, 0, 0],
      [0.5, 0, 0],
      [0, 0.5, 0],
    ]);
    const out = erasePatches([subject], [cutter]);
    const area = out.reduce((sum, p) => sum + polygonArea(p.vertices), 0);
    assert.ok(Math.abs(area / (scale * scale) - 0.375) < 1e-8);
  });

/* Overlapping stamps hand the same face over again and again. These pin the
   two things the accumulator drops and, more importantly, the things it must
   not: a polygon that is genuinely new, and the flag itself, which describes
   one pass over a face rather than the mark and must never be stored. */
const region = () => ({ faces: {}, surfacePatches: [] });
const patch = (faceIndex, vertices, whole) => ({
  meshId: "m",
  faceIndex,
  sourceFaceIndex: faceIndex,
  vertices,
  ...(whole ? { whole: true } : {}),
});
const FACE = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const HALF = [
  [0, 0, 0],
  [0.5, 0, 0],
  [0, 0.5, 0],
];
const OTHER_HALF = [
  [1, 0, 0],
  [0.5, 0, 0],
  [0, 1, 0],
];
function paint(r, batches) {
  let index = null;
  for (const batch of batches) {
    index = paintIndex(r, index);
    index = addPatches(r, batch, index);
  }
  return r;
}

test("the same polygon handed over twice is stored once", () => {
  const r = paint(region(), [[patch(7, HALF)], [patch(7, HALF)]]);
  assert.equal(r.surfacePatches.length, 1);
  assert.deepEqual(r.faces, { m: [7] });
});
test("a different polygon on the same face is kept", () => {
  const r = paint(region(), [[patch(7, HALF)], [patch(7, OTHER_HALF)]]);
  assert.equal(r.surfacePatches.length, 2);
});
test("taking a face whole discards the pieces already stored for it", () => {
  const r = paint(region(), [
    [patch(7, HALF)],
    [patch(7, OTHER_HALF)],
    [patch(7, FACE, true)],
  ]);
  assert.equal(r.surfacePatches.length, 1);
  assert.deepEqual(r.surfacePatches[0].vertices, FACE);
  assert.deepEqual(r.faces, { m: [7] });
});
test("a piece arriving after the face was taken whole is dropped", () => {
  const r = paint(region(), [[patch(7, FACE, true)], [patch(7, HALF)]]);
  assert.equal(r.surfacePatches.length, 1);
  assert.deepEqual(r.surfacePatches[0].vertices, FACE);
});
test("collapsing one face leaves every other face alone", () => {
  const r = paint(region(), [
    [patch(7, HALF), patch(8, HALF), patch(9, OTHER_HALF)],
    [patch(7, FACE, true)],
  ]);
  assert.equal(r.surfacePatches.length, 3);
  assert.deepEqual(r.faces, { m: [7, 8, 9] });
  assert.deepEqual(
    r.surfacePatches.find((p) => p.faceIndex === 7).vertices,
    FACE,
  );
});
test("the whole flag never reaches a stored mark", () => {
  const r = paint(region(), [[patch(7, FACE, true), patch(8, HALF)]]);
  assert.ok(r.surfacePatches.every((p) => !("whole" in p)));
});
test("a rebuilt index still refuses a repeat and no longer claims a face is whole", () => {
  const r = paint(region(), [[patch(7, FACE, true)]]);
  // What a draft read back from the server looks like: the same patches, a new
  // region object, nothing on disk saying face 7 was ever taken whole.
  const reopened = {
    faces: { ...r.faces },
    surfacePatches: r.surfacePatches.map((p) => ({ ...p })),
  };
  const index = paintIndex(reopened, null);
  assert.equal(index.whole.size, 0);
  addPatches(reopened, [patch(7, FACE)], index);
  assert.equal(reopened.surfacePatches.length, 1, "the repeat is still caught");
  addPatches(reopened, [patch(7, HALF)], index);
  assert.equal(reopened.surfacePatches.length, 2, "and a piece is believed");
  addPatches(reopened, [patch(7, FACE, true)], index);
  assert.equal(reopened.surfacePatches.length, 1, "until a stamp says whole");
});
test("erasing replaces the region, and the stale index is not reused", () => {
  const r = paint(region(), [[patch(7, HALF), patch(8, HALF)]]);
  let index = paintIndex(r, null);
  const erased = {
    faces: { m: [8] },
    surfacePatches: r.surfacePatches.filter((p) => p.faceIndex === 8),
  };
  index = paintIndex(erased, index);
  assert.notEqual(index.region, r);
  // Face 7 was erased, so the same polygon has to be storable again.
  addPatches(erased, [patch(7, HALF)], index);
  assert.equal(erased.surfacePatches.length, 2);
});
