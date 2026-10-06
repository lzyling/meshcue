import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import * as measure from "../src/measure.js";
import { MeasureViewMethods } from "../src/viewer/measure-view.js";

/* The smart tool's second click, between a corner, a straight edge and a flat
   face in any order. Every number here is one a reviewer could check with a
   ruler on the shapes described, so a wrong formula cannot pass as a close
   one. */
const v = (...xyz) => new Vector3(...xyz);
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}`);
const point = (...xyz) => ({ type: "point", point: v(...xyz) });
const edge = (a, b, extra = {}) => ({
  type: "edge",
  ends: [v(...a), v(...b)],
  points: [v(...a), v(...b)],
  length: v(...a).distanceTo(v(...b)),
  curved: false,
  ...extra,
});
const face = (normal, at, extra = {}) => ({
  type: "face",
  plane: { normal: v(...normal).normalize(), point: v(...at), faces: [0] },
  pick: v(...at),
  faceSet: new Set([0]),
  ...extra,
});

test("a corner to a straight edge is measured square to the edge's line", () => {
  const r = measure.pointLineMeasure(v(0, 3, 0), [v(-5, 0, 0), v(5, 0, 0)]);
  assert.equal(r.quantity, "length");
  close(r.value, 3, "above the middle");
  assert.deepEqual(r.points[1].toArray(), [0, 0, 0]);
  // Past the end of the edge it is still the distance to its line, as two
  // parallel faces are measured to the plane and not to the face's outline.
  close(
    measure.pointLineMeasure(v(10, 4, 0), [v(-5, 0, 0), v(5, 0, 0)]).value,
    4,
    "beyond the end",
  );
});

test("a corner to a flat face is measured square to its plane", () => {
  const r = measure.pointPlaneMeasure(v(1, 2, 7), {
    normal: v(0, 0, 1),
    point: v(0, 0, 4),
  });
  close(r.value, 3, "height above the face");
  assert.deepEqual(r.points[1].toArray(), [1, 2, 4]);
});

test("two straight edges give their gap when parallel and their angle otherwise", () => {
  const gap = measure.edgesMeasure(
    [v(0, 0, 0), v(10, 0, 0)],
    [v(8, 5, 3), v(2, 5, 3)],
  );
  assert.equal(gap.quantity, "length");
  close(gap.value, Math.hypot(5, 3), "parallel gap");
  assert.notEqual(gap.keepable, false);
  close(gap.points[0].distanceTo(gap.points[1]), gap.value, "its own line");
  for (const other of [
    [v(0, 0, 0), v(1, 1, 0)],
    [v(0, 0, 0), v(-1, 1, 0)],
  ]) {
    const angle = measure.edgesMeasure([v(0, 0, 0), v(10, 0, 0)], other);
    assert.equal(angle.quantity, "angle");
    close(angle.value, 45, "0 to 90 like faces");
    // An angle between two edges has no kept shape in the 1.x contract.
    assert.equal(angle.keepable, false);
  }
});

test("a straight edge and a flat face give a gap when parallel and an angle otherwise", () => {
  const plane = { normal: v(0, 0, -1), point: v(9, 9, 4) };
  const gap = measure.edgePlaneMeasure([v(0, 0, 6), v(4, 3, 6)], plane);
  assert.equal(gap.quantity, "length");
  close(gap.value, 2, "edge above the face");
  const angle = measure.edgePlaneMeasure([v(0, 0, 0), v(1, 0, 1)], plane);
  assert.equal(angle.quantity, "angle");
  close(angle.value, 45, "edge leaning out of the face");
  assert.equal(angle.keepable, false);
});

test("smart pairs keep only in shapes the contract already has, in click order", () => {
  const top = face([0, 0, 1], [0, 0, 4]);
  const corner = point(1, 2, 7);
  const forward = measure.smartCompare(corner, top);
  const backward = measure.smartCompare(top, corner);
  assert.equal(forward.kind, "points");
  assert.equal(backward.kind, "points");
  close(forward.result.value, 3, "corner to face");
  close(backward.result.value, 3, "face to corner");
  // Each saved point belongs to the pick in the same position.
  assert.deepEqual(forward.result.points[0].toArray(), [1, 2, 7]);
  assert.deepEqual(backward.result.points[1].toArray(), [1, 2, 7]);
  assert.equal(
    measure.smartCompare(point(0, 0, 0), point(3, 4, 0)).result.value,
    5,
  );
  assert.equal(
    measure.smartCompare(top, face([0, 0, 1], [0, 0, -4])).kind,
    "planes",
  );
  assert.equal(
    measure.smartCompare(
      edge([0, 0, 0], [10, 0, 0]),
      edge([0, 5, 0], [10, 5, 0]),
    ).kind,
    "points",
  );
  const angle = measure.smartCompare(
    edge([0, 0, 0], [10, 0, 0]),
    edge([0, 0, 0], [0, 10, 0]),
  );
  assert.equal(angle.kind, null);
  close(angle.result.value, 90, "square edges");
});

test("smart pairs refuse what they cannot measure truthfully", () => {
  const straight = edge([0, 0, 0], [10, 0, 0]);
  assert.equal(
    measure.smartCompare(straight, edge([0, 0, 0], [10, 0, 0])).refused,
    "sameEdge",
  );
  assert.equal(
    measure.smartCompare(straight, edge([10, 0, 0], [0, 0, 0])).refused,
    "sameEdge",
  );
  for (const other of [
    edge([0, 5, 0], [3, 8, 0], { curved: true }),
    face([0, 0, 1], [0, 0, 4], { plane: { curved: true, faces: [0] } }),
  ]) {
    assert.equal(measure.smartCompare(straight, other).refused, "unsupported");
    assert.equal(
      measure.smartCompare(other, point(0, 0, 0)).refused,
      "unsupported",
    );
  }
});

test("the viewer keeps a corner-to-face reading as a two-point mark and an edge angle not at all", () => {
  const refusals = [];
  const viewer = Object.assign(Object.create(MeasureViewMethods.prototype), {
    root: { scale: { x: 0.15 } },
    drawMeasure() {},
    onMeasureRefused: (why) => refusals.push(why),
    smartOwn: () => ({ result: null }),
  });
  viewer.smartMeasureClick({
    ...point(1, 2, 7),
    meshId: "mesh-0",
    sourceFaceIndex: 3,
  });
  viewer.smartMeasureClick({
    ...face([0, 0, 1], [0, 0, 4]),
    meshId: "mesh-0",
    sourceFaceIndex: 9,
  });
  const mark = viewer.measureMark();
  assert.equal(mark.kind, "points");
  assert.equal(mark.quantity, "length");
  assert.equal(mark.value, 3);
  assert.deepEqual(mark.points, [
    [1, 2, 7],
    [1, 2, 4],
  ]);
  assert.deepEqual(
    mark.picks.map((p) => p.sourceFaceIndex),
    [3, 9],
  );
  assert.equal(mark.normals, undefined);
  viewer.smartMeasureClick({
    ...edge([0, 0, 0], [10, 0, 0]),
    meshId: "mesh-0",
    sourceFaceIndex: 1,
  });
  viewer.smartMeasureClick({
    ...edge([0, 0, 0], [0, 0, 10]),
    meshId: "mesh-0",
    sourceFaceIndex: 2,
  });
  assert.equal(viewer.measuring.result.quantity, "angle");
  assert.equal(viewer.measureMark(), null);
  assert.deepEqual(refusals, []);
});
