import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as measure from "../src/measure.js";
import { buildFillTopology } from "../src/planar-fill.js";

const identity = new THREE.Matrix4();
const arc = (span = 360, noise = 0, ellipse = 1) =>
  Array.from({ length: 49 }, (_, i) => {
    const a = ((i / 48) * span * Math.PI) / 180;
    const r = 2.5 + noise * Math.sin(i * 7);
    return new THREE.Vector3(
      3 + r * Math.cos(a),
      -2 + ellipse * r * Math.sin(a),
      4 + noise * Math.cos(i * 5),
    );
  });

test("smart circle fit accepts a full circular B-rep edge and a 90 degree arc", () => {
  for (const span of [360, 90]) {
    const fit = measure.fitCircle(arc(span));
    assert.ok(fit);
    assert.ok(Math.abs(fit.diameter - 5) < 1e-8);
    assert.ok(fit.centre.distanceTo(new THREE.Vector3(3, -2, 4)) < 1e-8);
    assert.ok(Math.abs(fit.arcAngle - span) < 1e-6);
  }
});

test("smart circle fit rejects ellipses, short arcs, lines and nonplanar rims", () => {
  assert.equal(measure.fitCircle(arc(360, 0, 1.3)), null);
  assert.equal(measure.fitCircle(arc(90, 0, 1.3)), null);
  assert.equal(measure.fitCircle(arc(10)), null);
  assert.equal(
    measure.fitCircle([0, 1, 2, 3, 4].map((x) => new THREE.Vector3(x, 0, 0))),
    null,
  );
  assert.equal(measure.fitCircle(arc(360, 0.1)), null);
});

test("smart circle fit tolerates tessellation noise and tilted translated model frames", () => {
  const frame = new THREE.Matrix4().makeRotationX(0.7).setPosition(20, -30, 17);
  const fit = measure.fitCircle(
    arc(360, 0.002).map((p) => p.applyMatrix4(frame)),
  );
  assert.ok(fit);
  assert.ok(Math.abs(fit.diameter - 5) < 0.01);
  assert.ok(
    fit.centre.distanceTo(new THREE.Vector3(3, -2, 4).applyMatrix4(frame)) <
      0.01,
  );
});

function cylinder(topRadius = 2.5, bottomRadius = 2.5) {
  const g = new THREE.CylinderGeometry(topRadius, bottomRadius, 8, 48);
  const topology = buildFillTopology(g, identity);
  topology.brep = measure.brepTopology(
    g.groups.map((group) => [
      group.start / 3,
      (group.start + group.count) / 3 - 1,
    ]),
    topology.vertices.length,
  );
  return topology;
}

test("smart cylinder fit verifies the whole face and rejects cones and stretched cylinders", () => {
  const topology = cylinder();
  const fit = measure.cylinderAt(topology, 0, identity);
  assert.ok(fit);
  assert.ok(Math.abs(fit.diameter - 5) < 1e-5);
  assert.equal(measure.cylinderAt(cylinder(2, 3), 0, identity), null);
  assert.equal(
    measure.cylinderAt(topology, 0, new THREE.Matrix4().makeScale(1.3, 1, 1)),
    null,
  );
  delete topology.brep;
  assert.equal(measure.cylinderAt(topology, 0, identity), null);
});

// Use the actual viewer methods with deterministic screen-pick candidates:
// this checks priority independently of camera angle and tessellation density.
import { MeasureViewMethods } from "../src/viewer/measure-view.js";
const methods = MeasureViewMethods.prototype;
test("smart picks prefer snapped vertices, then edges, then faces", () => {
  const point = { point: new THREE.Vector3(), snapped: true };
  const edge = { length: 8 },
    face = { plane: {} };
  const viewer = {
    snapPoint: () => point,
    edgeAt: () => edge,
    planeUnder: () => face,
  };
  assert.equal(methods.smartCandidate.call(viewer, {}, 0, 0).type, "point");
  point.snapped = false;
  assert.equal(methods.smartCandidate.call(viewer, {}, 0, 0).type, "edge");
  viewer.edgeAt = () => null;
  assert.equal(methods.smartCandidate.call(viewer, {}, 0, 0).type, "face");
});

test("smart measurement compares its second object and starts over on the third", () => {
  const refusals = [];
  const viewer = Object.assign(Object.create(methods), {
    drawMeasure() {},
    onMeasureRefused: (why) => refusals.push(why),
    smartOwn(pick) {
      if (pick.type === "point") return { result: null };
      return { kind: "edge", result: { value: pick.length } };
    },
  });
  const point = (x) => ({ type: "point", point: new THREE.Vector3(x, 0, 0) });
  viewer.smartMeasureClick(point(1));
  assert.equal(viewer.measuring.result, null);
  viewer.smartMeasureClick(point(6));
  assert.equal(viewer.measuring.result.value, 5);
  viewer.smartMeasureClick({ type: "edge", length: 8 });
  assert.equal(viewer.measuring.result.value, 8);
  viewer.smartMeasureClick(point(2));
  assert.equal(viewer.measuring.result, null);
  assert.deepEqual(refusals, ["unsupported"]);
  viewer.smartMeasureClick(point(9));
  assert.equal(viewer.measuring.picks.length, 1);
});

test("smart circles keep three fitted ring samples in the existing circle mark shape", () => {
  const points = arc(360).filter((_, i) => [0, 16, 32].includes(i));
  const mesh = {
    userData: {
      fillTopology: {
        vertices: points.map((p) => [
          p.toArray(),
          p.clone().addScalar(0.1).toArray(),
          p.clone().addScalar(-0.1).toArray(),
        ]),
      },
    },
  };
  const viewer = Object.assign(Object.create(methods), {
    root: { scale: { x: 0.15 } },
    modelFrame: () => identity,
    measuring: {
      kind: "smart",
      smart: true,
      savedKind: "circle",
      picks: [{ mesh, meshId: "mesh-0", sourceFaceIndex: 0 }],
      result: {
        quantity: "diameter",
        value: 5,
        points,
        center: new THREE.Vector3(3, -2, 4),
        normal: new THREE.Vector3(0, 0, 1),
      },
    },
  });
  const mark = viewer.measureMark();
  assert.equal(mark.kind, "circle");
  assert.equal(mark.points.length, 3);
  assert.deepEqual(
    mark.picks.map((p) => p.sourceFaceIndex),
    [0, 1, 2],
  );
  assert.deepEqual(mark.center, [3, -2, 4]);
  assert.deepEqual(mark.normal, [0, 0, 1]);
  for (const p of mark.points)
    assert.ok(
      Math.abs(
        new THREE.Vector3()
          .fromArray(p)
          .distanceTo(new THREE.Vector3().fromArray(mark.center)) -
          mark.value / 2,
      ) < 1e-5,
    );
  viewer.measuring.result.keepable = false;
  assert.equal(viewer.measureMark(), null);
});
