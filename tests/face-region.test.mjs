import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { brepTopology } from "../src/measure.js";
import { planarFaces } from "../src/planar-fill.js";
import { faceRegion } from "../src/face-region.js";

// The first fillet triangle is tangent to the plane; later ones turn away.
// Normal-angle growth both crosses that boundary and truncates curved faces.
const topology = {
  normals: [0, 0, 2, 30, 60, 90, 180, 270].map(
    (degrees) =>
      new Vector3(
        Math.sin((degrees * Math.PI) / 180),
        0,
        Math.cos((degrees * Math.PI) / 180),
      ),
  ),
  adjacency: Array.from(
    { length: 8 },
    (_, i) => new Set([i - 1, i + 1].filter((j) => j >= 0 && j < 8)),
  ),
  brep: brepTopology(
    [
      [0, 1],
      [2, 4],
      [5, 7],
    ],
    8,
  ),
};
test("faceRegion keeps a STEP plane separate from its tangent fillet", () => {
  assert.deepEqual(faceRegion(topology, 0), [0, 1]);
});
test("faceRegion includes the whole fillet and cylinder regardless of tolerance", () => {
  assert.deepEqual(faceRegion(topology, 3, 0.1), [2, 3, 4]);
  assert.deepEqual(faceRegion(topology, 6, 30), [5, 6, 7]);
});
test("faceRegion retains planarFaces for meshes without B-rep data", () => {
  const mesh = { ...topology, brep: null };
  for (const tolerance of [0.1, 6, 30])
    assert.deepEqual(
      faceRegion(mesh, 0, tolerance),
      planarFaces(mesh, 0, tolerance),
    );
});
test("faceRegion rejects seeds outside the source topology", () => {
  for (const seed of [-1, 8, 0.5, undefined])
    assert.deepEqual(faceRegion(topology, seed), []);
});
