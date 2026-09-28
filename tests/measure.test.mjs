import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildFillTopology } from "../src/planar-fill.js";
import {
  faceEdges,
  isFeatureEdge,
  straightEdge,
  planeAt,
  planesMeasure,
  FEATURE_DEG,
} from "../src/measure.js";

const identity = new THREE.Matrix4();
const topologyOf = (geometry) => buildFillTopology(geometry, identity);

// The face whose three corners all satisfy `where`.
function faceWhere(topology, corners) {
  const face = topology.vertices.findIndex((v) => v.every(corners));
  assert.ok(face >= 0, "no such face in the fixture");
  return face;
}
// A face whose corners all satisfy `corners` and one of whose sides has both
// ends satisfying `ends`, with that side.
function sideWhere(topology, corners, ends) {
  for (let face = 0; face < topology.vertices.length; face++) {
    if (!topology.vertices[face].every(corners)) continue;
    const side = faceEdges(topology, face).find((e) => ends(e.a) && ends(e.b));
    if (side) return { face, ...side };
  }
  assert.fail("no such side in the fixture");
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("a box edge the tessellation split in two is one edge, its full length", () => {
  // 20 wide, split once across its width: the top front edge arrives as two
  // pieces of 10 that meet at a vertex no other sharp edge leaves.
  const topology = topologyOf(new THREE.BoxGeometry(20, 10, 5, 2, 1, 1));
  const { face, ka, kb } = sideWhere(
    topology,
    ([, y]) => near(y, 5),
    ([, y, z]) => near(y, 5) && near(z, 2.5),
  );
  assert.equal(isFeatureEdge(topology, face, ka, kb), true);
  const edge = straightEdge(topology, face, ka, kb, identity);
  assert.ok(near(edge.length, 20), `length ${edge.length}`);
  assert.equal(edge.curved, false);
  assert.equal(edge.points.length, 3);
});

test("an edge stops at a corner, where a third edge leaves", () => {
  const topology = topologyOf(new THREE.BoxGeometry(20, 10, 5));
  // A vertical edge of the front face: x = 10, z = 2.5, y from -5 to 5.
  const { face, ka, kb } = sideWhere(
    topology,
    ([, , z]) => near(z, 2.5),
    ([x, , z]) => near(x, 10) && near(z, 2.5),
  );
  const edge = straightEdge(topology, face, ka, kb, identity);
  assert.ok(near(edge.length, 10), `length ${edge.length}`);
  assert.equal(edge.curved, false);
});

test("the seam between two flats of a round is not an edge; its rim is a curve", () => {
  const topology = topologyOf(new THREE.CylinderGeometry(5, 5, 10, 16, 1));
  // A side flat: two corners on the top rim, one on the bottom, or the reverse.
  const face = faceWhere(topology, ([x, , z]) => near(Math.hypot(x, z), 5));
  const seam = faceEdges(topology, face).find((e) => !near(e.a[1], e.b[1]));
  // 22.5° between neighbouring flats, below the 30° an edge needs.
  assert.ok(360 / 16 < FEATURE_DEG);
  assert.equal(isFeatureEdge(topology, face, seam.ka, seam.kb), false);
  const rim = faceEdges(topology, face).find(
    (e) => near(e.a[1], e.b[1]) && near(Math.abs(e.a[1]), 5),
  );
  assert.equal(isFeatureEdge(topology, face, rim.ka, rim.kb), true);
  const edge = straightEdge(topology, face, rim.ka, rim.kb, identity);
  assert.equal(edge.curved, true);
});

test("a flat face is fitted as a plane, and two of them measure apart or at an angle", () => {
  const topology = topologyOf(new THREE.BoxGeometry(20, 10, 5, 2, 1, 1));
  const top = faceWhere(topology, ([, y]) => near(y, 5));
  const bottom = faceWhere(topology, ([, y]) => near(y, -5));
  const front = faceWhere(topology, ([, , z]) => near(z, 2.5));
  const up = planeAt(topology, top, identity);
  assert.equal(up.faces.length, 4);
  assert.deepEqual(
    up.normal.toArray().map((v) => Math.round(v * 1e9) / 1e9 + 0),
    [0, 1, 0],
  );
  assert.ok(near(up.point.y, 5));
  const down = planeAt(topology, bottom, identity);
  const apart = planesMeasure(
    { plane: up, pick: new THREE.Vector3(3, 5.001, 1) },
    { plane: down, pick: new THREE.Vector3(-4, -5, -2) },
  );
  assert.equal(apart.quantity, "length");
  // Each click is taken onto its own face, so the hair above the top is gone.
  assert.ok(near(apart.value, 10), `gap ${apart.value}`);
  assert.ok(near(apart.points[0].distanceTo(apart.points[1]), apart.value));
  const across = planesMeasure(
    { plane: up, pick: new THREE.Vector3(0, 5, 0) },
    {
      plane: planeAt(topology, front, identity),
      pick: new THREE.Vector3(0, 0, 2.5),
    },
  );
  assert.equal(across.quantity, "angle");
  assert.ok(near(across.value, 90), `angle ${across.value}`);
});

test("measurements are in the model's frame, not the mesh's", () => {
  const topology = topologyOf(new THREE.BoxGeometry(20, 10, 5, 2, 1, 1));
  const frame = new THREE.Matrix4().makeScale(2, 2, 2);
  const { face, ka, kb } = sideWhere(
    topology,
    ([, y]) => near(y, 5),
    ([, y, z]) => near(y, 5) && near(z, 2.5),
  );
  assert.ok(near(straightEdge(topology, face, ka, kb, frame).length, 40));
  const plane = planeAt(topology, face, frame);
  assert.ok(near(plane.point.y, 10));
  // Mirrored, the triangles wind the other way; the normal must not follow.
  const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  assert.ok(planeAt(topology, face, mirror).normal.y > 0.999);
});

test("parallel is within half a degree; a degree off is an angle", () => {
  const plane = (deg) => ({
    normal: new THREE.Vector3(
      0,
      Math.cos((deg * Math.PI) / 180),
      Math.sin((deg * Math.PI) / 180),
    ),
    point: new THREE.Vector3(0, 0, 0),
  });
  const pick = (y) => new THREE.Vector3(0, y, 0);
  const flatAgainst = (deg) =>
    planesMeasure(
      { plane: plane(0), pick: pick(0) },
      {
        plane: { ...plane(deg), point: new THREE.Vector3(0, 3, 0) },
        pick: pick(3),
      },
    );
  assert.equal(flatAgainst(0.3).quantity, "length");
  assert.ok(near(flatAgainst(0).value, 3));
  const tilted = flatAgainst(1);
  assert.equal(tilted.quantity, "angle");
  assert.ok(near(tilted.value, 1, 1e-9));
  // Facing each other or the same way, the angle between the planes is the same.
  const chamfer = planesMeasure(
    { plane: plane(0), pick: pick(0) },
    { plane: plane(135), pick: pick(1) },
  );
  assert.ok(near(chamfer.value, 45, 1e-9), `angle ${chamfer.value}`);
});

test("a straight side between two rounds is still straight; a hexagon's sides are edges", () => {
  // A slot: two straight sides of 20 joined by half circles of radius 5, each
  // drawn in 12 pieces. Where a side meets a round the rim turns only a few
  // degrees, as a curve's own pieces do; the side is what is long.
  const shape = new THREE.Shape();
  shape.moveTo(-10, -5);
  shape.lineTo(10, -5);
  shape.absarc(10, 0, 5, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-10, 5);
  shape.absarc(-10, 0, 5, Math.PI / 2, (3 * Math.PI) / 2, false);
  const slot = topologyOf(
    new THREE.ExtrudeGeometry(shape, {
      depth: 2,
      bevelEnabled: false,
      curveSegments: 12,
    }),
  );
  const side = sideWhere(
    slot,
    () => true,
    ([x, y, z]) => near(y, -5) && near(z, 2) && Math.abs(x) <= 10 + 1e-9,
  );
  const straight = straightEdge(slot, side.face, side.ka, side.kb, identity);
  assert.equal(straight.curved, false);
  assert.ok(near(straight.length, 20, 1e-5), `length ${straight.length}`);
  const round = sideWhere(
    slot,
    () => true,
    ([x, , z]) => x > 10 + 1e-6 && near(z, 2),
  );
  assert.equal(
    straightEdge(slot, round.face, round.ka, round.kb, identity).curved,
    true,
  );

  const hexagon = topologyOf(new THREE.CylinderGeometry(5, 5, 10, 6, 1));
  const rim = sideWhere(
    hexagon,
    ([x, , z]) => near(Math.hypot(x, z), 5),
    ([, y]) => near(y, 5),
  );
  const edge = straightEdge(hexagon, rim.face, rim.ka, rim.kb, identity);
  assert.equal(edge.curved, false);
  assert.ok(near(edge.length, 5, 1e-5), `length ${edge.length}`);
});
