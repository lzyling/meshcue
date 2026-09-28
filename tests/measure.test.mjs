import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { buildFillTopology } from "../src/planar-fill.js";
import {
  brepTopology,
  circleThrough,
  faceEdges,
  isFeatureEdge,
  straightEdge,
  planeAt,
  planesMeasure,
  FEATURE_DEG,
} from "../src/measure.js";
import { convertStepDetached } from "../server/step.mjs";

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

/* The STEP fixture as the page gets it: the plate 20 × 15 × 8 with its four
   upright corners rounded at radius 2 and a hole of diameter 5 through its
   middle, tessellated by the service, with the ranges of triangles each of
   the file's faces became. Read here straight out of the GLB. */
let plate;
async function plateTopology() {
  if (plate) return plate;
  const { glb } = await convertStepDetached(
    fs.readFileSync("tests/fixtures/plate.step"),
  );
  const length = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString("utf8", 20, 20 + length));
  const bin = glb.subarray(20 + length + 8);
  const read = (i, Type) => {
    const a = json.accessors[i],
      view = json.bufferViews[a.bufferView];
    const start = bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
    const count = a.count * (a.type === "VEC3" ? 3 : 1);
    return new Type(
      bin.buffer.slice(start, start + count * Type.BYTES_PER_ELEMENT),
    );
  };
  const [mesh] = json.meshes;
  const primitive = mesh.primitives[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      read(primitive.attributes.POSITION, Float32Array),
      3,
    ),
  );
  geometry.setIndex(
    new THREE.BufferAttribute(read(primitive.indices, Uint32Array), 1),
  );
  plate = topologyOf(geometry);
  plate.brep = brepTopology(mesh.extras.brepFaces, plate.vertices.length);
  assert.ok(plate.brep, "the tessellation's face ranges were not read");
  return plate;
}
// A side between a triangle of one STEP face and a triangle of another.
function sideBetween(topology, one, other) {
  const of = topology.brep.of;
  for (let face = 0; face < topology.vertices.length; face++) {
    if (!one(topology.vertices[face])) continue;
    for (const side of faceEdges(topology, face))
      for (const next of topology.adjacency[face])
        if (
          of[next] !== of[face] &&
          other(topology.vertices[next]) &&
          [side.a, side.b].every((end) =>
            topology.vertices[next].some(
              (v) =>
                near(v[0], end[0]) && near(v[1], end[1]) && near(v[2], end[2]),
            ),
          )
        )
          return { face, ...side };
  }
  assert.fail("no such side in the fixture");
}
const onTop = (v) => v.every(([, , z]) => near(z, 4, 1e-4));
const onFront = (v) => v.every(([, y]) => near(y, -7.5, 1e-4));
// Upright: a triangle of the top or bottom can have all three corners on a
// rim too.
const upright = (v) => Math.max(...v.map((p) => Math.abs(p[2] - v[0][2]))) > 1;
const onHoleWall = (v) =>
  upright(v) && v.every(([x, y]) => near(Math.hypot(x, y), 2.5, 1e-3));
const onRightFrontRound = (v) =>
  upright(v) && v.every(([x, y]) => near(Math.hypot(x - 8, y + 5.5), 2, 1e-3));

test("a STEP's face ranges say which face each triangle is; anything else is not read", () => {
  const brep = brepTopology(
    [
      [0, 1],
      [2, 1],
      [2, 4],
    ],
    5,
  );
  // The middle face is a run of none, which a face the tessellator could not
  // mesh is.
  assert.deepEqual([...brep.of], [0, 0, 2, 2, 2]);
  for (const ranges of [
    [[0, 3]],
    [
      [0, 1],
      [3, 4],
    ],
    [
      [0, 2],
      [2, 4],
    ],
    [[0, 5]],
    [],
    "0-4",
    [["0", 4]],
  ])
    assert.equal(brepTopology(ranges, 5), null, JSON.stringify(ranges));
});

test("on a STEP a face is the file's own, whole, and a curved one says so", async () => {
  const topology = await plateTopology();
  const identity = new THREE.Matrix4();
  const topFace = topology.vertices.findIndex(onTop);
  const top = planeAt(topology, topFace, identity);
  assert.equal(top.curved, false);
  assert.ok(top.normal.z > 0.999999, `normal ${top.normal.toArray()}`);
  assert.ok(near(top.point.z, 4, 1e-5));
  // Every triangle of the top, not the ones within a few degrees of the one
  // clicked: the face runs round the hole and into the corners as one.
  const [first, last] = topology.brep.ranges[topology.brep.of[topFace]];
  assert.equal(top.faces.length, last - first + 1);
  assert.ok(top.faces.every((f) => onTop(topology.vertices[f])));
  const wall = planeAt(
    topology,
    topology.vertices.findIndex(onHoleWall),
    identity,
  );
  assert.equal(wall.curved, true);
  const round = planeAt(
    topology,
    topology.vertices.findIndex(onRightFrontRound),
    identity,
  );
  assert.equal(round.curved, true);
  const bottom = planeAt(
    topology,
    topology.vertices.findIndex((v) => v.every(([, , z]) => near(z, -4, 1e-4))),
    identity,
  );
  const apart = planesMeasure(
    { plane: top, pick: new THREE.Vector3(5, 5, 4) },
    { plane: bottom, pick: new THREE.Vector3(-5, 3, -4) },
  );
  assert.equal(apart.quantity, "length");
  assert.ok(near(apart.value, 8, 1e-5), `gap ${apart.value}`);
});

test("on a STEP an edge runs between two faces, however gently they meet", async () => {
  const topology = await plateTopology();
  const identity = new THREE.Matrix4();
  // The top meets the front square, from one round to the other: 20 less the
  // two radii.
  const square = sideBetween(topology, onTop, onFront);
  assert.equal(
    isFeatureEdge(topology, square.face, square.ka, square.kb),
    true,
  );
  const front = straightEdge(
    topology,
    square.face,
    square.ka,
    square.kb,
    identity,
  );
  assert.equal(front.curved, false);
  assert.ok(near(front.length, 16, 1e-5), `length ${front.length}`);
  /* Where the front runs into a round the faces do not turn at all: no mesh
     edge is there, and the file still has one, the height of the plate. */
  const tangent = sideBetween(topology, onFront, onRightFrontRound);
  const normals = topology.normals;
  const across = [...topology.adjacency[tangent.face]].find((o) =>
    onRightFrontRound(topology.vertices[o]),
  );
  assert.ok(
    normals[tangent.face].dot(normals[across]) >
      Math.cos(FEATURE_DEG * (Math.PI / 180)),
  );
  assert.equal(
    isFeatureEdge(topology, tangent.face, tangent.ka, tangent.kb),
    true,
  );
  const upright = straightEdge(
    topology,
    tangent.face,
    tangent.ka,
    tangent.kb,
    identity,
  );
  assert.equal(upright.curved, false);
  assert.ok(near(upright.length, 8, 1e-5), `length ${upright.length}`);
  // The rim of the hole goes all the way round and is no straight edge; nor
  // is the arc where the top meets a round.
  const rim = sideBetween(topology, onTop, onHoleWall);
  const loop = straightEdge(topology, rim.face, rim.ka, rim.kb, identity);
  assert.equal(loop.curved, true);
  assert.ok(loop.points[0].equals(loop.points[loop.points.length - 1]));
  const arc = sideBetween(topology, onTop, onRightFrontRound);
  assert.equal(
    straightEdge(topology, arc.face, arc.ka, arc.kb, identity).curved,
    true,
  );
});

test("three points on a rim give its diameter and centre; three in a line give none", async () => {
  const at = (deg, r = 4, lift = 0) => {
    const a = (deg * Math.PI) / 180;
    // A circle of radius 4 about (1, 2, 3), in a tilted plane.
    const u = new THREE.Vector3(1, 1, 0).normalize(),
      v = new THREE.Vector3(0, 0, 1);
    return new THREE.Vector3(1, 2, 3)
      .addScaledVector(u, r * Math.cos(a))
      .addScaledVector(v, r * Math.sin(a))
      .addScaledVector(u.clone().cross(v), lift);
  };
  const circle = circleThrough([at(10), at(100), at(250)]);
  assert.ok(near(circle.diameter, 8, 1e-9), `diameter ${circle.diameter}`);
  assert.ok(circle.centre.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-9);
  const axis = new THREE.Vector3(1, 1, 0)
    .normalize()
    .cross(new THREE.Vector3(0, 0, 1));
  assert.ok(near(Math.abs(circle.normal.dot(axis)), 1, 1e-12));
  // Close together is still a circle, if a less certain one.
  assert.ok(near(circleThrough([at(0), at(20), at(40)]).diameter, 8, 1e-9));
  // In a line, or so nearly that the circle is far bigger than they are apart.
  const line = [0, 1, 2].map((i) => new THREE.Vector3(i, 2 * i, 3 * i));
  assert.equal(circleThrough(line), null);
  assert.equal(
    circleThrough([at(0, 1000), at(0.2, 1000), at(0.4, 1000)]),
    null,
  );
  assert.equal(circleThrough([at(0), at(0), at(90)]), null);

  // The hole through the plate, from three of the vertices on its rim.
  const topology = await plateTopology();
  const rim = [
    ...new Map(
      topology.vertices
        .flat()
        .filter(
          ([x, y, z]) => near(z, 4, 1e-4) && near(Math.hypot(x, y), 2.5, 1e-4),
        )
        .map((p) => [p.join(","), p]),
    ).values(),
  ].sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
  assert.ok(rim.length >= 12, `${rim.length} rim vertices`);
  const hole = circleThrough(
    [0, Math.floor(rim.length / 3), Math.floor((2 * rim.length) / 3)].map((i) =>
      new THREE.Vector3().fromArray(rim[i]),
    ),
  );
  assert.ok(near(hole.diameter, 5, 1e-5), `diameter ${hole.diameter}`);
  assert.ok(hole.centre.distanceTo(new THREE.Vector3(0, 0, 4)) < 1e-5);
  assert.ok(near(Math.abs(hole.normal.z), 1, 1e-9));
});
