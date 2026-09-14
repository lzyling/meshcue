import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { letterLabel, erasePatches } from "../src/annotation-edits.js";
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
