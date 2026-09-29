import test from "node:test";
import assert from "node:assert/strict";
import { chainSegments, faceNormal, outlineSegments } from "../src/outline.js";

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

const same = (p, q) => p.every((v, i) => v === q[i]);
/* How many times a chain jumps: places where a stretch does not start where
   the one before it ended. */
const jumps = (chain) =>
  chain.filter((s, i) => i > 0 && !same(s.from, chain[i - 1].to)).length;

test("a loop handed over in any order and either way round comes back as one chain", () => {
  const loop = [
    { from: c, to: d, owner: 2 },
    { from: b, to: a, owner: 0 },
    { from: d, to: a, owner: 3 },
    { from: c, to: b, owner: 1 },
  ];
  const chain = chainSegments(loop);
  assert.equal(chain.length, 4);
  assert.equal(jumps(chain), 0);
  // Closed: it ends where it began.
  assert.ok(same(chain[3].to, chain[0].from));
  assert.deepEqual(keys(chain), keys(loop));
});

test("a stretch turned round to fit the chain keeps what else it carries", () => {
  const chain = chainSegments([
    { from: a, to: b, owner: 0 },
    { from: c, to: b, owner: 7 },
  ]);
  assert.equal(jumps(chain), 0);
  const turned = chain.find((s) => s.owner === 7);
  assert.ok(same(turned.from, b) && same(turned.to, c));
});

test("pieces that never meet come back as a chain each, one after the other", () => {
  const lift = (p) => [p[0] + 5, p[1], p[2]];
  const square = [
    { from: a, to: b },
    { from: b, to: c },
    { from: c, to: d },
    { from: d, to: a },
  ];
  const apart = square.map((s) => ({ from: lift(s.from), to: lift(s.to) }));
  const chain = chainSegments([
    square[2],
    apart[1],
    square[0],
    apart[3],
    square[3],
    apart[0],
    square[1],
    apart[2],
  ]);
  assert.equal(chain.length, 8);
  assert.equal(jumps(chain), 1);
  // Each square is all together, not interleaved with the other.
  const far = chain.map((s) => s.from[0] >= 5);
  assert.equal(far.filter((f, i) => i > 0 && f !== far[i - 1]).length, 1);
});

test("a run that does not close is chained from one of its ends, whole", () => {
  const chain = chainSegments([
    { from: b, to: c },
    { from: c, to: d },
    { from: a, to: b },
  ]);
  assert.equal(jumps(chain), 0);
  assert.ok(same(chain[0].from, a) || same(chain[0].from, d));
});

test("a face's normal points the way its corners wind", () => {
  const up = faceNormal([a, b, c, d]);
  assert.deepEqual(
    up.map((v) => v + 0),
    [0, 0, 2],
  );
  const down = faceNormal([d, c, b, a]);
  assert.deepEqual(
    down.map((v) => v + 0),
    [0, 0, -2],
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
