import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  reviewSurface,
  surfaceCost,
  SURFACE_ALGORITHM,
} from "../src/surface.js";

// Coplanar quads whose edges are far longer than the 0.07 review edge, i.e. the
// flat faces a functional part is mostly made of.
function slab(cells, span) {
  const position = [],
    normal = [];
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const s = span / cells,
        x = i * s,
        y = j * s;
      for (const [a, b] of [
        [0, 0],
        [s, 0],
        [0, s],
        [s, 0],
        [s, s],
        [0, s],
      ]) {
        position.push(x + a, y + b, 0);
        normal.push(0, 0, 1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  return geometry;
}
// A real part is not uniform: a CAD export is a handful of large flat faces
// carrying a mass of small facets. Every fairness case below used identical
// faces, where a face's share is never below one triangle — the shape that hides
// a rationing overrun.
function mixed(smallCount, largeCount, span) {
  const position = [],
    normal = [];
  const face = (x, y, e, z) => {
    for (const [a, b] of [
      [0, 0],
      [e, 0],
      [0, e],
    ]) {
      position.push(x + a, y + b, z);
      normal.push(0, 0, 1);
    }
  };
  for (let i = 0; i < smallCount; i++) face(i * 0.002, 0, 0.001, 0);
  for (let i = 0; i < largeCount; i++) face(i * span * 2, 0, span, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  return geometry;
}
const identity = new THREE.Matrix4();
function perSourceFace(geometry) {
  const counts = new Map();
  for (const face of geometry.userData.sourceFaces)
    counts.set(face, (counts.get(face) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
}

test("an ample budget tessellates every source face uniformly", () => {
  const result = reviewSurface(slab(6, 1), identity, 600000);
  const counts = perSourceFace(result);
  assert.equal(counts.length, 72);
  assert.equal(
    new Set(counts).size,
    1,
    "identical faces got different budgets",
  );
  assert.equal(counts[0] > 1, true, "nothing was subdivided at all");
  assert.equal(result.userData.sourceTriangles, 72);
  assert.equal(result.userData.surfaceAlgorithm, SURFACE_ALGORITHM);
  assert.equal(
    result.attributes.position.count / 3,
    result.userData.sourceFaces.length,
  );
});

test("a budget too small for the model degrades every face evenly", () => {
  // A single global counter used to spend the whole budget depth-first on
  // whichever faces the index buffer listed first: the leading faces reached
  // 512 review triangles while hundreds of identical faces behind them stayed
  // raw, so the brush followed the stroke on one part and snapped on the rest.
  const geometry = slab(20, 24);
  const source = geometry.attributes.position.count / 3;
  const budget = 8000;
  const counts = perSourceFace(reviewSurface(geometry, identity, budget));

  assert.equal(counts.length, source);
  assert.equal(
    Math.max(...counts) / Math.min(...counts),
    1,
    "identical coplanar faces were rationed unequally",
  );
  assert.equal(
    counts.filter((n) => n === 1).length,
    0,
    "some faces were left as a single raw triangle while others were refined",
  );
  assert.equal(
    counts.reduce((n, c) => n + c, 0) <= budget,
    true,
    "rationing overran the budget",
  );
});

test("rationing never runs a face below its own source triangle", () => {
  const geometry = slab(30, 36);
  const source = geometry.attributes.position.count / 3;
  const result = reviewSurface(geometry, identity, source);
  assert.equal(result.userData.sourceFaces.length, source);
  assert.deepEqual(new Set(perSourceFace(result)), new Set([1]));
});

test("rationing a mixed mesh never emits more than the budget", () => {
  // The budget is a hard contract: the server rejects a manifest above the cap
  // with a generic schema error, so an overrun reaches the user as a model that
  // will not load and an error naming nothing. A part of 91968 faces came back
  // 938 triangles over, because each face too cheap to earn a whole triangle
  // still took one and nothing paid for the difference.
  const geometry = mixed(2000, 4, 24);
  const source = geometry.attributes.position.count / 3;
  const wanted = surfaceCost(geometry, identity).reduce((n, c) => n + c, 0);
  assert.equal(wanted > source, true, "the fixture is not worth rationing");

  for (const budget of [
    source,
    source + 1,
    Math.floor(wanted / 4),
    wanted - 1,
  ]) {
    const result = reviewSurface(geometry, identity, budget);
    const emitted = result.userData.sourceFaces.length;
    assert.equal(
      emitted <= budget,
      true,
      `budget ${budget} overrun by ${emitted - budget}`,
    );
    assert.equal(
      perSourceFace(result).length,
      source,
      "a source face emitted nothing",
    );
  }
});

test("the price of a mesh matches what an unrationed pass emits", () => {
  // The viewer shares one budget across meshes by pricing them first, so a
  // price that disagreed with the emitter would hand out shares nobody can use.
  for (const [cells, span] of [
    [6, 1],
    [10, 6],
    [14, 2],
  ]) {
    const geometry = slab(cells, span);
    const costs = surfaceCost(geometry, identity);
    const emitted = reviewSurface(geometry, identity, 600000);
    assert.equal(costs.length, geometry.attributes.position.count / 3);
    assert.equal(
      costs.reduce((n, c) => n + c, 0),
      emitted.userData.sourceFaces.length,
      "the priced cost is not what the emitter produces",
    );
    assert.deepEqual(costs, perSourceFace(emitted));
  }
});

test("a supplied price produces exactly the same geometry as recomputing it", () => {
  const dump = (g) => [
    Array.from(g.attributes.position.array),
    g.userData.sourceFaces,
  ];
  for (const budget of [600000, 8000]) {
    const geometry = slab(12, 12);
    assert.deepEqual(
      dump(
        reviewSurface(
          geometry,
          identity,
          budget,
          surfaceCost(geometry, identity),
        ),
      ),
      dump(reviewSurface(geometry, identity, budget)),
      "reusing the price changed the result",
    );
  }
});
