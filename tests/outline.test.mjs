import test from "node:test";
import assert from "node:assert/strict";
import { outlineSegments } from "../src/outline.js";

/* Segments as sorted pairs of corners, so a result can be compared without
   caring which way round each one was found. */
const key = (s) =>
  [s.from, s.to]
    .map((p) => p.map((v) => +v.toFixed(6)).join(","))
    .sort()
    .join(" ");
const keys = (segments) => segments.map(key).sort();
const whole = (triangle) => ({ vertices: triangle, carriers: [triangle] });

const [a, b, c, d] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
];

test("two faces taken whole are outlined round the outside, not along the edge they share", () => {
  const segments = outlineSegments([whole([a, b, c]), whole([a, c, d])]);
  assert.deepEqual(
    keys(segments),
    keys([
      { from: a, to: b },
      { from: b, to: c },
      { from: c, to: d },
      { from: d, to: a },
    ]),
  );
  // Each stretch belongs to the face it bounds, which is where it is drawn.
  const owner = (from, to) =>
    segments.find((s) => key(s) === key({ from, to })).owner;
  assert.equal(owner(a, b), 0);
  assert.equal(owner(c, d), 1);
});

test("a face that meets a neighbour's part of a face is outlined only where the neighbour stops", () => {
  // The right-hand triangle is taken whole; of the left one, only the part
  // from the middle of the shared edge upwards is painted.
  const left = [a, c, d];
  const middle = [0.5, 0.5, 0];
  const part = { vertices: [middle, c, d], carriers: [left] };
  const segments = outlineSegments([whole([a, b, c]), part]);
  assert.deepEqual(
    keys(segments),
    keys([
      { from: a, to: b },
      { from: b, to: c },
      // The shared edge, a to c, is inside the region from its middle up and
      // outline below it, where only the whole face is painted.
      { from: a, to: middle },
      { from: c, to: d },
      // Where the part was cut across its face.
      { from: d, to: middle },
    ]),
  );
});

test("an edge cut across a face is outline wherever it is", () => {
  const cut = [
    [0.2, 0.1, 0],
    [0.8, 0.1, 0],
    [0.5, 0.4, 0],
  ];
  const segments = outlineSegments([{ vertices: cut, carriers: [[a, b, c]] }]);
  assert.equal(segments.length, 3);
});

test("neighbours that share an edge exactly, the other way round, still cancel", () => {
  // A strip of three faces: the two inner edges vanish, the ends remain.
  const e = [2, 0, 0],
    f = [2, 1, 0];
  const segments = outlineSegments([
    whole([a, b, c]),
    whole([c, d, a]),
    whole([b, e, f]),
    whole([f, c, b]),
  ]);
  assert.deepEqual(
    keys(segments),
    keys([
      { from: a, to: b },
      { from: b, to: e },
      { from: e, to: f },
      { from: f, to: c },
      { from: c, to: d },
      { from: d, to: a },
    ]),
  );
});

test("a mark indexed against the review mesh cancels along review triangle edges inside one face", () => {
  // One source face split in two by the review mesh; the reviewer took both
  // halves, so the split between them is not an edge of the mark.
  const source = [a, b, c];
  const mid = [0.5, 0, 0];
  const segments = outlineSegments([
    { vertices: [a, mid, c], carriers: [source, [a, mid, c]] },
    { vertices: [mid, b, c], carriers: [source, [mid, b, c]] },
  ]);
  assert.deepEqual(
    keys(segments),
    keys([
      { from: a, to: mid },
      { from: mid, to: b },
      { from: b, to: c },
      { from: c, to: a },
    ]),
  );
});
