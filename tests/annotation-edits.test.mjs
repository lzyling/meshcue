import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  letterLabel,
  erasePatches,
  paintIndex,
  addPatches,
  wholeFaces,
  compactRegion,
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
   things the accumulator drops and, more importantly, the one thing it must
   not: a polygon that is genuinely new.

   A face taken whole is kept as its number with no polygon beside it, so most
   of these count patches expecting one fewer than there are faces. That
   absence is the storage format, not a loss: `wholeFaces` reads it back. */
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
  assert.equal(r.surfacePatches.length, 0, "not even the whole face itself");
  assert.deepEqual(r.faces, { m: [7] });
  assert.deepEqual([...wholeFaces(r)], ["m:7"]);
});
test("a face taken whole costs its number and no coordinates", () => {
  const r = paint(region(), [[patch(7, FACE, true)]]);
  assert.deepEqual(r.faces, { m: [7] });
  assert.equal(r.surfacePatches.length, 0);
  // The measured shape of the fix: 142 bytes of repeated triangle become the
  // six digits `faces` was already spending.
  assert.ok(JSON.stringify(r).length < 40, JSON.stringify(r));
});
test("a piece arriving after the face was taken whole is dropped", () => {
  const r = paint(region(), [[patch(7, FACE, true)], [patch(7, HALF)]]);
  assert.equal(r.surfacePatches.length, 0);
  assert.deepEqual([...wholeFaces(r)], ["m:7"]);
});
test("collapsing one face leaves every other face alone", () => {
  const r = paint(region(), [
    [patch(7, HALF), patch(8, HALF), patch(9, OTHER_HALF)],
    [patch(7, FACE, true)],
  ]);
  assert.equal(r.surfacePatches.length, 2);
  assert.deepEqual(r.faces, { m: [7, 8, 9] });
  assert.equal(
    r.surfacePatches.find((p) => p.faceIndex === 7),
    undefined,
    "face 7 went whole",
  );
  assert.deepEqual([...wholeFaces(r)], ["m:7"]);
});
test("the whole flag never reaches a stored mark", () => {
  const r = paint(region(), [[patch(7, FACE, true), patch(8, HALF)]]);
  assert.ok(r.surfacePatches.every((p) => !("whole" in p)));
});
test("a rebuilt index reads wholeness back off the draft", () => {
  const r = paint(region(), [[patch(7, FACE, true)]]);
  /* What a draft read back from the server looks like. The old format stored a
     polygon for face 7 and nothing saying it was whole, so a reopened draft
     believed a half-face afterwards and had to wait for another stamp to
     re-collapse it. Now the absence of a patch is the record. */
  const reopened = {
    faces: { ...r.faces },
    surfacePatches: r.surfacePatches.map((p) => ({ ...p })),
  };
  const index = paintIndex(reopened, null);
  assert.deepEqual([...index.whole], ["m:7"]);
  addPatches(reopened, [patch(7, FACE)], index);
  assert.equal(reopened.surfacePatches.length, 0, "the repeat is still caught");
  addPatches(reopened, [patch(7, HALF)], index);
  assert.equal(
    reopened.surfacePatches.length,
    0,
    "and a piece inside a whole face is not believed a second time",
  );
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

/* Compaction replaces what it compacts. The first version added the union to
   the soup instead: the entry was deleted from the replacement map as it was
   emitted, so every later polygon on that face looked untouched and was kept.
   Nothing caught it, because this lived in the module that draws the page and
   had no test — the measurement did, by showing stored polygons tracking the
   stamp count exactly. */
const triangleOf = () => [
  [0, 0, 0],
  [4, 0, 0],
  [0, 4, 0],
];
const fakeUnion = (polygons) =>
  polygons.length < 2
    ? null
    : { polygons: [[[9, 9, 9]]], whole: false, coverage: 0.5 };
const wholeUnion = () => ({ polygons: [], whole: true, coverage: 1 });

test("compaction replaces every polygon on the face, not just the first", () => {
  const r = paint(region(), [
    [patch(7, HALF), patch(7, OTHER_HALF), patch(7, FACE)],
    [patch(8, HALF)],
  ]);
  r.type = "region";
  r.coverage = "source-v2";
  assert.equal(r.surfacePatches.length, 4);
  assert.equal(compactRegion(r, triangleOf, fakeUnion), true);
  const onSeven = r.surfacePatches.filter((p) => p.faceIndex === 7);
  assert.equal(onSeven.length, 1, "three polygons became one");
  assert.deepEqual(onSeven[0].vertices, [[9, 9, 9]]);
  // Face 8 held a single polygon, so it was never a candidate.
  assert.equal(r.surfacePatches.filter((p) => p.faceIndex === 8).length, 1);
  assert.deepEqual(r.faces, { m: [7, 8] });
});

test("a face the union finds covered stops costing anything", () => {
  const r = paint(region(), [[patch(7, HALF), patch(7, OTHER_HALF)]]);
  r.type = "region";
  r.coverage = "source-v2";
  assert.equal(compactRegion(r, triangleOf, wholeUnion), true);
  assert.equal(r.surfacePatches.length, 0);
  assert.deepEqual(r.faces, { m: [7] });
  assert.deepEqual([...wholeFaces(r)], ["m:7"]);
});

test("compaction leaves the older formats alone", () => {
  for (const coverage of ["source-v1", "brush-v1", undefined]) {
    const r = paint(region(), [[patch(7, HALF), patch(7, OTHER_HALF)]]);
    r.type = "region";
    r.coverage = coverage;
    assert.equal(compactRegion(r, triangleOf, fakeUnion), false);
    assert.equal(r.surfacePatches.length, 2);
  }
});

test("compacting one stroke does not unpaint the strokes before it", () => {
  /* The pass that takes a stroke on its own must consume only that stroke's
     polygons. Taking them by face instead would union the last few dabs and
     then drop everything else on the face — erasing what earlier strokes
     covered, in a step whose whole purpose is to change nothing but the size. */
  const r = paint(region(), [[patch(7, HALF), patch(7, OTHER_HALF)]]);
  r.type = "region";
  r.coverage = "source-v2";
  const before = r.surfacePatches.length;
  const since = before;
  paint(r, [[patch(7, FACE), patch(7, [...HALF].reverse())]]);
  assert.equal(r.surfacePatches.length, before + 2);
  // Declines anything but a pair, standing in for the reason the whole-face
  // pass really does decline: slivers between strokes are holes it must keep.
  const pairOnly = (polygons) =>
    polygons.length === 2 ? fakeUnion(polygons) : null;
  assert.equal(compactRegion(r, triangleOf, pairOnly, since), true);
  const onSeven = r.surfacePatches.filter((p) => p.faceIndex === 7);
  assert.equal(onSeven.length, 3, "two kept, the stroke's two became one");
  assert.equal(
    onSeven.filter((p) => JSON.stringify(p.vertices) === "[[9,9,9]]").length,
    1,
  );
});
