import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { computeBoundsTree } from "three-mesh-bvh";
import { brushPatches } from "../src/brush.js";
import { unionFace } from "../src/polygon-union.js";

/* The regime `unionFace` exists for: a face larger than the brush, where no
   single stamp ever covers it and the whole-face collapse never fires. These
   drive the real stamp pipeline rather than hand-written polygons, because the
   input that matters is the one the brush actually produces — overlapping
   64-gons clipped to the same triangle, at half-radius spacing. */

const TRIANGLE = [
  [0, 0, 0],
  [4, 0, 0],
  [0, 4, 0],
];
const square = (x, y, s) => [
  [x, y, 0],
  [x + s, y, 0],
  [x + s, y + s, 0],
  [x, y + s, 0],
];
const inside = (pt, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    )
      hit = !hit;
  }
  return hit;
};

// Overlapping dabs along a line, which is what a drag actually leaves.
const smear = (n, step = 0.2, s = 1) =>
  [...Array(n).keys()].map((i) => square(i * step, 0, s));

test("a row of overlapping dabs becomes one polygon covering the same ground", () => {
  const input = smear(8);
  const out = unionFace(input, TRIANGLE);
  assert.equal(out.polygons.length, 1);
  // Sampled, not compared by area: area alone cannot tell a union from a
  // differently shaped polygon of the same size.
  for (let x = 0.05; x < 3; x += 0.05)
    for (let y = 0.05; y < 1.5; y += 0.05) {
      const was = input.some((poly) => inside([x, y], poly));
      const is = out.polygons.some((poly) => inside([x, y], poly));
      assert.equal(
        is,
        was,
        `coverage changed at ${x.toFixed(2)},${y.toFixed(2)}`,
      );
    }
});

test("a union that would cost more than the pieces is declined", () => {
  /* Two dabs meeting at a corner have eight vertices between them and an
     L-shaped boundary that needs eight to describe. Compaction exists to make
     a draft smaller and is not allowed to be a way of making it larger, so the
     pieces are kept. */
  const out = unionFace([square(0, 0, 2), square(1, 1, 2)], TRIANGLE);
  assert.equal(out, null);
});

test("polygons that together cover the face report it whole", () => {
  const halves = [
    [
      [0, 0, 0],
      [4, 0, 0],
      [0, 4, 0],
    ],
    [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
    ],
  ];
  const out = unionFace(halves, TRIANGLE);
  assert.equal(out.whole, true);
  assert.ok(out.coverage > 0.999, `coverage ${out.coverage}`);
});

test("polygons short of the face do not claim it whole", () => {
  const out = unionFace(smear(6), TRIANGLE);
  assert.equal(out.whole, false);
  assert.ok(out.coverage < 0.5, `coverage ${out.coverage}`);
});

test("a single polygon is left exactly as it was", () => {
  assert.equal(unionFace([square(0, 0, 1)], TRIANGLE), null);
});

test("a degenerate face is declined rather than guessed at", () => {
  const flat = [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
  ];
  assert.equal(unionFace([square(0, 0, 1), square(1, 1, 1)], flat), null);
});

test("a ring painted around an untouched middle is declined, not flattened", () => {
  /* Storage is a flat list of simple rings with nowhere to say "except this
     part". Returning the outline would silently fill in the hole — widening a
     stroke to ground the reviewer deliberately left alone. */
  const ring = [
    square(0, 0, 3),
    square(0, 0, 1),
    square(2, 0, 1),
    square(0, 2, 1),
    square(2, 2, 1),
  ];
  const outer = unionFace([ring[0]], TRIANGLE);
  assert.equal(outer, null, "one polygon is never rewritten");
  const holed = unionFace(
    [
      // A square frame assembled from four bars leaves a hole in the middle.
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 1, 0],
        [0, 1, 0],
      ],
      [
        [0, 2, 0],
        [3, 2, 0],
        [3, 3, 0],
        [0, 3, 0],
      ],
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 3, 0],
        [0, 3, 0],
      ],
      [
        [2, 0, 0],
        [3, 0, 0],
        [3, 3, 0],
        [2, 3, 0],
      ],
    ],
    TRIANGLE,
  );
  assert.equal(holed, null);
});

function coarseMesh(seg, size = 4) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.userData.sourceFaces = [...Array(g.index.count / 3).keys()];
  g.computeBoundsTree = computeBoundsTree;
  g.computeBoundsTree({ indirect: true });
  const m = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  m.userData.reviewId = "mesh-0";
  m.updateMatrixWorld();
  return m;
}
test("a real stroke over one coarse face collapses to a single ring", () => {
  const mesh = coarseMesh(1);
  const c = new THREE.PerspectiveCamera(38, 4 / 3, 0.01, 100);
  c.position.set(0, 0, 5);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  const collected = [];
  for (let x = 200; x <= 600; x += 4)
    for (const p of brushPatches([mesh], c, rect, x, 300, 14))
      if (p.sourceFaceIndex === 0) collected.push(p.vertices);
  assert.ok(collected.length > 30, `expected a soup, got ${collected.length}`);
  const attr = mesh.geometry.attributes.position;
  const triangle = [0, 1, 2].map((j) =>
    new THREE.Vector3()
      .fromBufferAttribute(attr, mesh.geometry.index.getX(j))
      .toArray(),
  );
  const out = unionFace(collected, triangle);
  assert.equal(out.polygons.length, 1, "one stroke, one region");
  const before = collected.reduce((n, poly) => n + poly.length, 0);
  const after = out.polygons.reduce((n, poly) => n + poly.length, 0);
  assert.ok(
    after < before / 3,
    `the union must be far cheaper than the soup (${before} -> ${after})`,
  );
});
