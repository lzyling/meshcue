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
