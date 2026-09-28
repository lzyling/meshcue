import { Vector3 } from "three";
import { planarFaces } from "./planar-fill.js";

/* Measuring on a mesh, which is all a GLB or an STL is and all a STEP is once
   it has been tessellated for the page. Everything here reads the topology
   `buildFillTopology` keeps per mesh -- the triangles as they arrived, before
   the review surface subdivided them -- and answers in the model's own frame
   and units: a `frame` is the matrix from a mesh to `root`, the same frame a
   region's `bounds` and a mark's `view` are in. Nothing here knows a camera.

   A mesh has no edges or faces in the sense a drawing has, only triangles. An
   edge is a line where the triangles either side turn sharply enough to be
   seen as one; a face is the triangles that lie in one plane with it. Both are
   inferred, which is why the thresholds below are named and explained.

   A STEP says more, and where it does nothing is inferred: its tessellation
   records which of the file's own faces every triangle came from
   (`brepFaces`), so a face is that face, whole, and an edge is where two of
   them meet, however gently they turn there. That is only for measuring; a
   mark on a STEP still lands on triangles. */

/* An edge is one a reviewer can see and point at when the faces either side of
   it turn by more than this. A STEP is tessellated at an angular deflection of
   0.5 rad (28.6°, `server/step.mjs`), so the seams between the flats of a
   curved face turn by up to that much; this sits above it. */
export const FEATURE_DEG = 30;
// One straight edge may arrive in pieces, split where the tessellation put a
// vertex on it; pieces this close to one line are one edge.
export const COLLINEAR_DEG = 0.5;
/* A curve arrives as short straight pieces, each turning a little into the
   next. A piece whose neighbours both carry on at less than this, and which is
   no longer than they are, is one of those and not an edge of its own. */
export const CURVE_TURN_DEG = 40;
// Two faces this close to parallel are measured apart; further, at an angle.
export const PARALLEL_DEG = 0.5;
/* How far a STEP face's corners, or a STEP edge's points, may stray from the
   plane or line through them and still be flat or straight, as a share of the
   face's size or the edge's length. A true plane or line is off only by the
   rounding of float32 coordinates, about a ten-millionth; the flats of a
   tessellated curve are off by the curve's bow, which even a gentle one puts
   well past this. */
export const STRAIGHT_SHARE = 1e-4;
/* Three points pin down a circle only when they are spread around it. Past
   this many times the distance between them, the circle through three clicks
   is one they happened to fall on in a line -- along an edge, not around a
   rim -- and its diameter is noise. */
export const FLAT_ARC = 50;
/* How far a face's triangles may lean from the one clicked and still be the
   same flat face. Tight, because a curved surface must not pass for a plane,
   and not tighter, because the thin slivers a CAD tessellation leaves on a big
   flat face have normals that float32 corners bend by a degree or so. */
export const PLANE_DEG = 2;

const RAD = Math.PI / 180;
// The same rounding `buildFillTopology` joins triangles by.
const key = (p) => p.map((v) => Math.round(v * 1e7)).join(",");
const clampUnit = (v) => Math.max(-1, Math.min(1, v));

function keysOf(topology, face) {
  topology.keys ||= [];
  return (topology.keys[face] ||= topology.vertices[face].map(key));
}
/* Which of a STEP's faces each triangle came from, from the ranges its
   tessellation wrote: one [first, last] run of triangle numbers per face, in
   order and covering every triangle. Anything else was not written by that
   tessellation, and the mesh is measured as a mesh. */
export function brepTopology(ranges, count) {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  const of = new Int32Array(count);
  let next = 0;
  for (const [id, range] of ranges.entries()) {
    const [first, last] = Array.isArray(range) ? range : [];
    // A face the tessellator could not mesh is a run of none.
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first !== next ||
      last < first - 1 ||
      last >= count
    )
      return null;
    of.fill(id, first, last + 1);
    next = last + 1;
  }
  return next === count ? { of, ranges } : null;
}
// A little more than float32 rounding, at the size the points are at.
const rounding = (points) =>
  1e-6 * Math.max(...points.flatMap((p) => p.toArray().map(Math.abs)));
// A triangle with no area has no direction, so it can neither make an edge nor
// hide one.
const flat = (topology, face) => topology.normals[face].lengthSq() < 0.5;

/* The faces on the other side of an edge. Usually one; none on the rim of an
   open mesh; more where a model was built with faces meeting along a line. */
function across(topology, face, ka, kb) {
  const out = [];
  for (const other of topology.adjacency[face]) {
    if (flat(topology, other)) continue;
    const k = keysOf(topology, other);
    if (k.includes(ka) && k.includes(kb)) out.push(other);
  }
  return out;
}
export function isFeatureEdge(topology, face, ka, kb) {
  if (flat(topology, face)) return false;
  const others = across(topology, face, ka, kb);
  // An open rim is as much an edge as a fold is.
  if (!others.length) return true;
  const brep = topology.brep?.of;
  if (brep) return others.some((o) => brep[o] !== brep[face]);
  const cos = Math.cos(FEATURE_DEG * RAD);
  return others.some(
    (o) => topology.normals[o].dot(topology.normals[face]) < cos,
  );
}
// A triangle's three sides, as the keys and points of their ends.
export function faceEdges(topology, face) {
  const k = keysOf(topology, face),
    v = topology.vertices[face];
  return [0, 1, 2].map((i) => ({
    ka: k[i],
    kb: k[(i + 1) % 3],
    a: v[i],
    b: v[(i + 1) % 3],
  }));
}
/* Every triangle around a vertex, found by walking from one of them across the
   sides that meet there. */
function fanAround(topology, start, vk) {
  const seen = new Set([start]),
    queue = [start];
  for (let i = 0; i < queue.length; i++)
    for (const next of topology.adjacency[queue[i]])
      if (!seen.has(next) && keysOf(topology, next).includes(vk)) {
        seen.add(next);
        queue.push(next);
      }
  return queue;
}
// The feature edges that leave a vertex, each as the vertex at its far end.
function featureEdgesAt(topology, face, vk) {
  const found = new Map(),
    checked = new Set();
  for (const f of fanAround(topology, face, vk)) {
    const k = keysOf(topology, f);
    const i = k.indexOf(vk);
    for (const j of [(i + 1) % 3, (i + 2) % 3]) {
      if (checked.has(k[j])) continue;
      if (isFeatureEdge(topology, f, vk, k[j])) {
        checked.add(k[j]);
        found.set(k[j], { key: k[j], point: topology.vertices[f][j], face: f });
      }
    }
  }
  return [...found.values()];
}

/* The straight edge a side of a triangle belongs to, end to end.

   It runs on through a vertex only when exactly one other feature edge leaves
   that vertex and it carries on in the same line: that is an edge the
   tessellation split, while a vertex with a third edge is a corner, where a
   drawing's edge ends too. Then it is asked whether the edge is straight at
   all. A piece of a curve looks like a short straight edge whose neighbours
   carry on at a slight turn; measuring it would give the length of one facet
   of a hole's rim, which is a number nobody asked for and nothing on the model
   is that long. */
export function straightEdge(topology, face, ka, kb, frame) {
  if (topology.brep) return brepEdge(topology, face, ka, kb, frame);
  const at = (v) => new Vector3().fromArray(v.point).applyMatrix4(frame);
  const k = keysOf(topology, face);
  const vertex = (key) => ({
    key,
    point: topology.vertices[face][k.indexOf(key)],
    face,
  });
  const chain = [vertex(ka), vertex(kb)];
  const extend = () => {
    for (let guard = 0; guard < 100000; guard++) {
      const last = chain[chain.length - 1],
        prev = chain[chain.length - 2];
      const edges = featureEdgesAt(topology, last.face, last.key).filter(
        (e) => e.key !== prev.key,
      );
      // A corner, or the end of an open rim: the edge stops here.
      if (edges.length !== 1) return null;
      const next = edges[0];
      const here = at(last);
      const along = here.clone().sub(at(prev)).normalize();
      const step = at(next).sub(here);
      const length = step.length();
      const turn = Math.acos(clampUnit(along.dot(step.normalize()))) / RAD;
      if (turn > COLLINEAR_DEG) return { turn, length };
      chain.push(next);
    }
    return null;
  };
  const ahead = extend();
  chain.reverse();
  const behind = extend();
  const ends = [at(chain[0]), at(chain[chain.length - 1])];
  const length = ends[0].distanceTo(ends[1]);
  const smooth = (r) => r && r.turn < CURVE_TURN_DEG;
  const curved = Boolean(
    smooth(ahead) &&
    smooth(behind) &&
    length <= 1.5 * Math.max(ahead.length, behind.length),
  );
  return { ends, length, curved, points: chain.map(at) };
}

/* The two STEP faces a side of a triangle lies between, as one key: the
   triangle's own and the one across, or nothing (-1) on the rim of an open
   face. None when both sides are the same face. */
function brepPair(topology, face, ka, kb) {
  const of = topology.brep.of;
  const others = across(topology, face, ka, kb);
  const there = others.length
    ? Math.min(...others.map((o) => of[o]).filter((id) => id !== of[face]))
    : -1;
  return there === Infinity ? null : [of[face], there].sort().join("|");
}
/* A STEP edge, end to end: the line between the two faces a side lies
   between, followed through every vertex where the same two faces carry on,
   to where a third face meets them, or all the way round when they meet in a
   loop. A turn sharper than a curve's own pieces ever make is a corner too,
   for the rare pair of faces that meet along two lines. Straight when every
   point it passes through is on the line between its ends; nothing about it
   depends on how sharply the faces turn, so a shallow chamfer or the line
   where a round runs into a flat is as measurable as a square edge. */
function brepEdge(topology, face, ka, kb, frame) {
  const at = (v) => new Vector3().fromArray(v.point).applyMatrix4(frame);
  const pair = brepPair(topology, face, ka, kb);
  const k = keysOf(topology, face);
  const vertex = (key) => ({
    key,
    point: topology.vertices[face][k.indexOf(key)],
    face,
  });
  const chain = [vertex(ka), vertex(kb)];
  let closed = false;
  const onwards = (from, vk, back) => {
    const found = new Map();
    for (const f of fanAround(topology, from, vk)) {
      const keys = keysOf(topology, f);
      const i = keys.indexOf(vk);
      for (const j of [(i + 1) % 3, (i + 2) % 3])
        if (
          keys[j] !== back &&
          !found.has(keys[j]) &&
          !flat(topology, f) &&
          brepPair(topology, f, vk, keys[j]) === pair
        )
          found.set(keys[j], {
            key: keys[j],
            point: topology.vertices[f][j],
            face: f,
          });
    }
    return [...found.values()];
  };
  const extend = () => {
    for (let guard = 0; guard < 100000; guard++) {
      const last = chain[chain.length - 1],
        prev = chain[chain.length - 2];
      const next = onwards(last.face, last.key, prev.key);
      if (next.length !== 1) return;
      if (next[0].key === chain[0].key) {
        closed = true;
        return;
      }
      const here = at(last);
      const along = here.clone().sub(at(prev)).normalize();
      const step = at(next[0]).sub(here).normalize();
      if (Math.acos(clampUnit(along.dot(step))) / RAD > CURVE_TURN_DEG) return;
      chain.push(next[0]);
    }
  };
  extend();
  if (!closed) {
    chain.reverse();
    extend();
  }
  const points = chain.map(at);
  const ends = [points[0], points[points.length - 1]];
  const length = ends[0].distanceTo(ends[1]);
  const direction = ends[1].clone().sub(ends[0]).normalize();
  let off = 0;
  for (const p of points) {
    const d = p.clone().sub(ends[0]);
    off = Math.max(
      off,
      d.addScaledVector(direction, -d.dot(direction)).length(),
    );
  }
  const curved =
    closed || !(length > 0) || off > STRAIGHT_SHARE * length + rounding(points);
  return {
    ends,
    length,
    curved,
    points: closed ? [...points, points[0]] : points,
  };
}

/* The flat face a triangle lies in, and the plane through it: the triangles
   grown from it within `PLANE_DEG`, their normals summed by area -- the plane
   that fits them best when they are flat and a fair average when they are
   nearly -- through their area-weighted centre. In the model's frame.

   On a STEP the face is the file's own, whole, and it is only a plane if it
   is flat: every corner on the plane fitted through them. A curved one comes
   back marked `curved`, for the page to refuse rather than measure. */
export function planeAt(topology, seed, frame) {
  if (topology.brep) return brepPlane(topology, seed, frame);
  if (flat(topology, seed)) return null;
  return fitPlane(topology, planarFaces(topology, seed, PLANE_DEG), frame);
}
function brepPlane(topology, seed, frame) {
  const [first, last] = topology.brep.ranges[topology.brep.of[seed]];
  const faces = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const plane = fitPlane(topology, faces, frame);
  // A face closed on itself, the side of a whole cylinder, sums to no
  // direction at all.
  if (!plane) return { faces, curved: true };
  const corners = faces.flatMap((f) =>
    topology.vertices[f].map((p) =>
      new Vector3().fromArray(p).applyMatrix4(frame),
    ),
  );
  const low = corners[0].clone(),
    high = corners[0].clone();
  let off = 0;
  for (const p of corners) {
    low.min(p);
    high.max(p);
    off = Math.max(off, Math.abs(p.clone().sub(plane.point).dot(plane.normal)));
  }
  plane.curved =
    off > STRAIGHT_SHARE * low.distanceTo(high) + rounding([low, high]);
  return plane;
}
function fitPlane(topology, faces, frame) {
  const normal = new Vector3(),
    centre = new Vector3(),
    ab = new Vector3(),
    ac = new Vector3();
  let area = 0;
  for (const f of faces) {
    const [a, b, c] = topology.vertices[f].map((p) =>
      new Vector3().fromArray(p).applyMatrix4(frame),
    );
    const cross = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const weight = cross.length() / 2;
    normal.add(cross);
    centre.addScaledVector(a.add(b).add(c).divideScalar(3), weight);
    area += weight;
  }
  if (!area || !normal.lengthSq()) return null;
  // A mirrored frame turns every triangle's winding over with it.
  if (frame.determinant() < 0) normal.negate();
  return {
    faces,
    normal: normal.normalize(),
    point: centre.divideScalar(area),
  };
}
// Where a point lands on a plane, straight down its normal.
export const ontoPlane = (point, plane) =>
  point
    .clone()
    .addScaledVector(
      plane.normal,
      -point.clone().sub(plane.point).dot(plane.normal),
    );

/* Two faces: how far apart when they are parallel, at what angle when not.

   Apart is measured from where the second face was clicked, straight across to
   the first, each click first taken onto its own face's plane so that the
   reading is the gap between the faces and not between two hit points a hair
   off either. The angle is the one between the two planes, 0 to 90 degrees,
   the way a drawing states it; the normals go with it, because 45° between a
   chamfer and a side and 45° inside a groove are different shapes. */
export function planesMeasure(first, second) {
  const dot = first.plane.normal.dot(second.plane.normal);
  const angle = Math.acos(Math.min(1, Math.abs(dot))) / RAD;
  const a = ontoPlane(first.pick, first.plane),
    b = ontoPlane(second.pick, second.plane);
  if (angle <= PARALLEL_DEG) {
    const n = first.plane.normal
      .clone()
      .addScaledVector(second.plane.normal, dot < 0 ? -1 : 1)
      .normalize();
    const gap = b.clone().sub(a).dot(n);
    return {
      quantity: "length",
      value: Math.abs(gap),
      points: [b.clone().addScaledVector(n, -gap), b],
    };
  }
  return { quantity: "angle", value: angle, points: [a, b] };
}

/* The circle through three points on the rim of a hole or a shaft: its centre,
   the normal of the plane it lies in, and its diameter. Nothing when the
   points are in a line, or so nearly that the circle is far bigger than they
   are apart (`FLAT_ARC`). On a tessellated rim every vertex lies on the true
   circle, which is why the page snaps each click to one. */
export function circleThrough([a, b, c]) {
  const ab = b.clone().sub(a),
    ac = c.clone().sub(a);
  const normal = ab.clone().cross(ac);
  const twice = 2 * normal.lengthSq();
  if (!(twice > 0)) return null;
  const centre = a
    .clone()
    .add(
      normal
        .clone()
        .cross(ab)
        .multiplyScalar(ac.lengthSq())
        .add(ac.clone().cross(normal).multiplyScalar(ab.lengthSq()))
        .divideScalar(twice),
    );
  const radius = centre.distanceTo(a);
  const spread = Math.max(ab.length(), ac.length(), b.distanceTo(c));
  if (!(radius <= FLAT_ARC * spread)) return null;
  return { centre, normal: normal.normalize(), diameter: 2 * radius };
}
// The circle itself, as a closed line from `start` round, to draw it by.
export function circleLine({ centre, normal }, start, pieces = 96) {
  const u = start.clone().sub(centre);
  const v = normal.clone().cross(u);
  return Array.from({ length: pieces + 1 }, (_, i) => {
    const turn = (2 * Math.PI * i) / pieces;
    return centre
      .clone()
      .addScaledVector(u, Math.cos(turn))
      .addScaledVector(v, Math.sin(turn));
  });
}
