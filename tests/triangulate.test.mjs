import { test } from "node:test";
import assert from "node:assert/strict";
import { fanInto, convex, flatten } from "../src/triangulate.js";

/* What the overlay draws is what the reviewer believes was marked, so a
   triangulation that covers more ground than the polygon does is the same
   mistake as widening a stroke — the mark would claim surface nobody painted.
   Before the union every stored polygon was convex and a fan was exact; the
   union's boundary is not, and these pin that the difference is handled. */

const area2 = (tri) => {
  const [a, b, c] = tri;
  return (
    Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
  );
};
const ringArea = (flat) => {
  let sum = 0;
  for (let i = 0, j = flat.length - 1; i < flat.length; j = i++)
    sum += flat[j][0] * flat[i][1] - flat[i][0] * flat[j][1];
  return Math.abs(sum / 2);
};
const triangles = (coords) => {
  const out = [];
  for (let i = 0; i < coords.length; i += 9)
    out.push([
      coords.slice(i, i + 3),
      coords.slice(i + 3, i + 6),
      coords.slice(i + 6, i + 9),
    ]);
  return out;
};
/* A U, not an L. An L is concave but still star-shaped from its first vertex,
   so a fan over one happens to be correct and would have let this through —
   the first version of these tests used an L and stayed green with ear
   clipping disabled. The U's notch is not visible from vertex 0, which is the
   case a fan gets wrong, and the union of stamps along a stroke that doubles
   back is full of them. */
const L = [
  [0, 0, 0],
  [3, 0, 0],
  [3, 3, 0],
  [2, 3, 0],
  [2, 1, 0],
  [1, 1, 0],
  [1, 3, 0],
  [0, 3, 0],
];
const SQUARE = [
  [0, 0, 0],
  [2, 0, 0],
  [2, 2, 0],
  [0, 2, 0],
];

test("a convex polygon is recognised and a concave one is not", () => {
  assert.equal(convex(flatten(SQUARE)), true);
  assert.equal(convex(flatten(L)), false);
});

test("a triangle is its own triangulation", () => {
  const coords = [];
  fanInto(coords, SQUARE.slice(0, 3));
  assert.equal(coords.length, 9);
});

test("a convex polygon still fans, and covers its own area exactly", () => {
  const coords = [];
  fanInto(coords, SQUARE);
  const parts = triangles(coords);
  assert.equal(parts.length, 2, "a fan, not ear clipping");
  const covered = parts.reduce((n, t) => n + area2(flatten(t)), 0);
  assert.ok(Math.abs(covered - 4) < 1e-9, `covered ${covered}`);
});

test("a concave polygon is covered exactly, not bridged across its notch", () => {
  const coords = [];
  fanInto(coords, L);
  const parts = triangles(coords);
  const covered = parts.reduce((n, t) => n + area2(flatten(t)), 0);
  const truth = ringArea(flatten(L));
  assert.equal(truth, 7, "the U is seven square units");
  assert.ok(
    Math.abs(covered - truth) < 1e-9,
    `a fan would have covered the notch too (${covered} vs ${truth})`,
  );
});

test("the notch itself is left uncovered", () => {
  const coords = [];
  fanInto(coords, L);
  // A point inside the missing corner of the L, which a fan from vertex 0
  // would have drawn over.
  const point = [1.5, 2];
  const hit = triangles(coords).some((t) => {
    const f = flatten(t);
    const sign = (p, a, b) =>
      (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d = [
      sign(point, f[0], f[1]),
      sign(point, f[1], f[2]),
      sign(point, f[2], f[0]),
    ];
    return !(d.some((x) => x < -1e-12) && d.some((x) => x > 1e-12));
  });
  assert.equal(hit, false, "the notch was drawn over");
});

test("a polygon in a plane other than z is triangulated in its own plane", () => {
  // The same L standing up in x, so the dominant axis is not the last one.
  const standing = L.map(([x, y]) => [0, x, y]);
  const coords = [];
  fanInto(coords, standing);
  const covered = triangles(coords).reduce((n, t) => n + area2(flatten(t)), 0);
  assert.ok(Math.abs(covered - 7) < 1e-9, `covered ${covered}`);
});
