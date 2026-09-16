import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  letterLabel,
  paintIndex,
  addPatches,
  wholeFaces,
} from "../src/annotation-edits.js";
import { buildFillTopology, planarFaces } from "../src/planar-fill.js";

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

/* The bucket hands a face over whole or not at all, and a whole face is stored
   as its number with no polygon beside it. These pin that absence: it is the
   storage format, not a loss, and `wholeFaces` reads it back.

   They also pin the refusal. A partial patch is what the brush produced, and
   for a whole release the path that was supposed to collapse those never ran
   in a browser while every unit test here stayed green. Nothing can produce
   one now, so arriving with one is a bug and says so rather than quietly
   storing 142 bytes per face again. */
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
function paint(r, batches) {
  let index = null;
  for (const batch of batches) {
    index = paintIndex(r, index);
    index = addPatches(r, batch, index);
  }
  return r;
}

test("a face taken whole costs its number and no coordinates", () => {
  const r = paint(region(), [[patch(7, FACE, true)]]);
  assert.deepEqual(r.faces, { m: [7] });
  assert.equal(r.surfacePatches.length, 0);
  // The measured shape of the fix: 142 bytes of repeated triangle become the
  // six digits `faces` was already spending.
  assert.ok(JSON.stringify(r).length < 40, JSON.stringify(r));
});
test("the same face handed over twice is stored once", () => {
  const r = paint(region(), [[patch(7, FACE, true)], [patch(7, FACE, true)]]);
  assert.deepEqual(r.faces, { m: [7] });
  assert.equal(r.surfacePatches.length, 0);
});
test("many faces in one fill each cost only their number", () => {
  const r = paint(region(), [[7, 8, 9, 10].map((f) => patch(f, FACE, true))]);
  assert.deepEqual(r.faces, { m: [7, 8, 9, 10] });
  assert.equal(r.surfacePatches.length, 0);
});
test("the whole flag never reaches the mark", () => {
  const r = paint(region(), [[patch(7, FACE, true)]]);
  assert.ok(!JSON.stringify(r).includes("whole"));
});
test("a patch that does not claim its whole face is refused, not stored", () => {
  const r = region();
  assert.throws(
    () => addPatches(r, [patch(7, HALF)], paintIndex(r, null)),
    /partial coverage of m:7/,
  );
  assert.deepEqual(r.faces, {});
  assert.equal(r.surfacePatches.length, 0);
});
test("a rebuilt index reads wholeness back off the draft", () => {
  const r = paint(region(), [[patch(7, FACE, true)]]);
  /* What a draft read back from the server looks like: the absence of a patch
     beside face 7 is the whole record that it was taken whole. */
  const reopened = {
    faces: { ...r.faces },
    surfacePatches: r.surfacePatches.map((p) => ({ ...p })),
  };
  const index = paintIndex(reopened, null);
  assert.deepEqual([...index.whole], ["m:7"]);
  addPatches(reopened, [patch(7, FACE, true)], index);
  assert.equal(reopened.surfacePatches.length, 0, "the repeat is still caught");
  assert.deepEqual(reopened.faces, { m: [7] });
});
test("a source-v1 draft still reads its polygons as partial coverage", () => {
  // Nothing writes one any more; drafts already on disk still have to be read.
  const legacy = {
    faces: { m: [7, 8] },
    surfacePatches: [{ meshId: "m", faceIndex: 7, vertices: HALF }],
  };
  assert.deepEqual([...wholeFaces(legacy)], ["m:8"]);
});
