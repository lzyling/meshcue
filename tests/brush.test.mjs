import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { computeBoundsTree } from "three-mesh-bvh";
import { brushPatches, binSize } from "../src/brush.js";

function plane(id, z, size = 10) {
  const g = new THREE.PlaneGeometry(size, size);
  g.userData.sourceFaces = [0, 1];
  g.computeBoundsTree = computeBoundsTree;
  g.computeBoundsTree({ indirect: true });
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  m.position.z = z;
  m.userData.reviewId = id;
  m.updateMatrixWorld();
  return m;
}
const rect = { left: 0, top: 0, width: 800, height: 600 };
function camera() {
  const c = new THREE.PerspectiveCamera(38, 4 / 3, 0.01, 100);
  c.position.set(0, 0, 5);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
function project(v, m, c) {
  const p = new THREE.Vector3()
    .fromArray(v)
    .applyMatrix4(m.matrixWorld)
    .project(c);
  return [(p.x + 1) * 400, (1 - p.y) * 300];
}
test("small brush on two huge triangles stays inside its actual circular footprint", () => {
  const m = plane("front", 0),
    c = camera();
  const patches = brushPatches([m], c, rect, 430, 295, 6);
  assert.ok(patches.length > 0);
  for (const p of patches)
    for (const v of p.vertices) {
      const [x, y] = project(v, m, c);
      assert.ok(Math.hypot(x - 430, y - 295) <= 6.00001);
      assert.ok(Math.abs(v[2]) < 1e-9);
    }
});
test("fully hidden surfaces receive no paint", () => {
  const front = plane("front", 0.2),
    back = plane("back", 0),
    c = camera();
  const patches = brushPatches([back, front], c, rect, 400, 300, 22);
  assert.ok(patches.length > 0);
  assert.ok(patches.every((p) => p.meshId === "front"));
});
test("partial occluder is subtracted, including when it lies inside a large back triangle", () => {
  const front = plane("front", 0.2, 0.1),
    back = plane("back", 0),
    c = camera();
  const patches = brushPatches([back, front], c, rect, 400, 300, 35);
  assert.ok(patches.some((p) => p.meshId === "back"));
  assert.ok(patches.some((p) => p.meshId === "front"));
  const lo = project([-0.05, 0.05, 0], front, c),
    hi = project([0.05, -0.05, 0], front, c);
  for (const p of patches.filter((p) => p.meshId === "back")) {
    const points = p.vertices.map((v) => project(v, back, c));
    const center = [0, 1].map((i) => points.reduce((s, p) => s + p[i], 0) / 3);
    assert.ok(
      !(
        center[0] > lo[0] + 1e-6 &&
        center[0] < hi[0] - 1e-6 &&
        center[1] > lo[1] + 1e-6 &&
        center[1] < hi[1] - 1e-6
      ),
    );
  }
});
test("perspective and nonuniform mesh transforms preserve local surface coordinates", () => {
  const m = plane("tilted", 0);
  m.rotation.y = 0.55;
  m.scale.set(1.3, 0.7, 1);
  m.updateMatrixWorld();
  const c = camera();
  const patches = brushPatches([m], c, rect, 410, 290, 13);
  assert.ok(patches.length > 0);
  for (const p of patches)
    for (const v of p.vertices) {
      const [x, y] = project(v, m, c);
      assert.ok(Math.hypot(x - 410, y - 290) <= 13.00001);
      assert.ok(Math.abs(v[2]) < 1e-9);
    }
});

test("mirrored object transforms follow the rendered front-face orientation", () => {
  const m = plane("mirrored", 0);
  m.scale.x = -1;
  m.updateMatrixWorld();
  const c = camera();
  const patches = brushPatches([m], c, rect, 410, 290, 10);
  assert.ok(patches.length > 0);
  for (const p of patches)
    for (const v of p.vertices) {
      const [x, y] = project(v, m, c);
      assert.ok(Math.hypot(x - 410, y - 290) <= 10.00001);
    }
});

test("bucket size follows the candidates, not a fixed pixel grid", () => {
  const boxes = (n, size, spread) =>
    Array.from({ length: n }, (_, i) => {
      const x = (i % 40) * (spread / 40),
        y = Math.floor(i / 40) * (spread / 40);
      return { box: [x, y, x + size, y + size] };
    });

  assert.equal(binSize([]) > 0, true);
  // A dense mesh under a small brush is exactly the case a 16px grid missed:
  // every triangle landed in one cell and the pairwise stage stayed quadratic.
  assert.equal(binSize(boxes(2000, 0.5, 12)) < 16, true);
  // Where the fixed grid was already the right scale, nothing shrinks.
  assert.equal(binSize(boxes(200, 16, 600)) >= 16, true);

  for (const candidates of [
    boxes(2000, 0.5, 12),
    boxes(200, 16, 600),
    boxes(50, 300, 400),
    [{ box: [5, 5, 5, 5] }],
  ]) {
    const cell = binSize(candidates);
    assert.equal(
      Number.isFinite(cell) && cell > 0,
      true,
      "cell must be usable",
    );
    const span = candidates.reduce(
      (n, { box }) => Math.max(n, box[2] - box[0], box[3] - box[1]),
      0,
    );
    // The grid stays bounded, so one oversized triangle cannot explode the
    // number of cell keys it has to be registered under.
    assert.equal(span / cell <= 64 || candidates.length === 1, true);
  }
});
