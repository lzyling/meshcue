import test from "node:test";
import assert from "node:assert/strict";
import {
  regions,
  cameraAngles,
  projectedReach,
  CUBE_GEOMETRY,
} from "../src/orient-cube.js";

/* The rotation matrices CSS actually applies. Written out rather than imported
   so the test does not agree with the module by sharing its mistake: if the
   cube is wrong, this has to be able to say so. */
const rad = (d) => (d * Math.PI) / 180;
const rotateX = (deg) => {
  const c = Math.cos(rad(deg)),
    s = Math.sin(rad(deg));
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
};
const rotateY = (deg) => {
  const c = Math.cos(rad(deg)),
    s = Math.sin(rad(deg));
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
};
const apply = (m, v) =>
  m.map((row) => row.reduce((a, k, i) => a + k * v[i], 0));
const close = (a, b, tol = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < tol);

/* A plate's transform as CSS reads it: rightmost applies first. */
const plateNormal = (p) =>
  apply(rotateY(p.yaw), apply(rotateX(p.pitch), [0, 0, 1]));
const plateCentre = (p) =>
  apply(rotateY(p.yaw), apply(rotateX(p.pitch), [0, 0, p.dist]));

test("the cube is six sides, twelve edges and eight corners", () => {
  const all = regions();
  assert.equal(all.length, 26);
  const count = (k) => all.filter((r) => r.kind === k).length;
  assert.equal(count("face"), 6);
  assert.equal(count("edge"), 12);
  assert.equal(count("corner"), 8);
  assert.equal(new Set(all.map((r) => r.view)).size, 26);
});

/* The bug this file exists for. Two faces were written out by hand with the
   wrong sign, which left the cube labelled correctly and built inside out: from
   above you were shown the underside, and nothing about it looked broken.
   A normal that has to point where the region says it points cannot do that. */
test("every region faces out along the direction it claims", () => {
  for (const r of regions()) {
    const [x, y, z] = r.d;
    const n = Math.hypot(x, y, z);
    // CSS puts +Y downwards; everything else is shared with world space.
    const expected = [x / n, -y / n, z / n];
    assert.ok(
      close(plateNormal(r), expected),
      `${r.view} faces ${plateNormal(r).map((v) => v.toFixed(3))}, expected ${expected.map((v) => v.toFixed(3))}`,
    );
  }
});

/* What the reviewer is promised: the side of the model the camera is on is the
   side of the cube facing them, and clicking it is therefore a no-op rather
   than a jump. Composing the compass with the plate has to give back the
   identity — any disagreement between the two halves shows up here. */
test("the camera's own side is the one turned towards the reviewer", () => {
  for (const r of regions()) {
    const cam = cameraAngles(...r.d);
    const compass = (v) =>
      apply(rotateX(-cam.pitch), apply(rotateY(-cam.yaw), v));
    assert.ok(
      close(compass(plateNormal(r)), [0, 0, 1]),
      `${r.view} is not square on to the camera aimed at it`,
    );
    const centre = compass(plateCentre(r));
    assert.ok(
      Math.abs(centre[0]) < 1e-9 && Math.abs(centre[1]) < 1e-9,
      `${r.view} is not centred when aimed at`,
    );
    assert.ok(centre[2] > 0, `${r.view} sits behind the cube, not in front`);
  }
});

/* Plates are cut from one solid, so their distances are not free: a face sits
   at the half-side, and the cut-back regions further out along their own
   diagonal. Getting these wrong makes regions float or sink into each other. */
test("regions sit on the surface of one chamfered cube", () => {
  const { HALF, CHAMFER } = CUBE_GEOMETRY;
  const expected = {
    face: HALF,
    edge: (2 * HALF - CHAMFER) / Math.SQRT2,
    corner: (3 * HALF - 2 * CHAMFER) / Math.sqrt(3),
  };
  for (const r of regions())
    assert.ok(
      Math.abs(r.dist - expected[r.kind]) < 1e-9,
      `${r.view} (${r.kind}) sits at ${r.dist}, expected ${expected[r.kind]}`,
    );
  // Every region has to be wide enough to aim at with a mouse.
  for (const r of regions()) assert.ok(Math.min(r.w, r.h) >= 12, r.view);
});

/* The reset button sits under the cube, so the room the cube is given has to be
   the room it takes when turned — not the room it takes sitting still. */
test("the reach a turning cube needs is larger than the cube", () => {
  const { HALF, CHAMFER } = CUBE_GEOMETRY;
  assert.ok(projectedReach() > HALF);
  assert.ok(
    Math.abs(
      projectedReach() - Math.hypot(HALF, HALF - CHAMFER, HALF - CHAMFER),
    ) < 1e-9,
  );
});
