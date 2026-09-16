import * as THREE from "three";

/* Coverage is stored as the clipped polygon; WebGL wants triangles. Fanning at
   draw time costs nothing and keeps the stored form free of the sixty-odd
   repetitions a stored fan carried. Three vertices fan to themselves, so
   patches written before that change draw through the same path.

   A fan is only right for a convex polygon, and until the union arrived every
   stored polygon was one: the brush clips with half-planes, and an intersection
   of half-planes cannot be concave. The union of the stamps that crossed a face
   very much can be, and fanning one fills in the bays along its edge — drawing
   the mark over ground the reviewer went around. So convexity is tested rather
   than assumed, and the concave ones are ear clipped. */

// The polygon has a plane to be flat in, because every polygon stored for a
// face was clipped from that face's own triangle. Drop the axis it faces.
export function flatten(vertices) {
  const u = vertices[1].map((v, i) => v - vertices[0][i]);
  const w = vertices[2].map((v, i) => v - vertices[0][i]);
  const normal = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0],
  ].map(Math.abs);
  const drop = normal.indexOf(Math.max(...normal));
  const [i0, i1] = [0, 1, 2].filter((i) => i !== drop);
  return vertices.map((p) => [p[i0], p[i1]]);
}
export function convex(flat) {
  let sign = 0;
  for (let i = 0; i < flat.length; i++) {
    const a = flat[i];
    const b = flat[(i + 1) % flat.length];
    const c = flat[(i + 2) % flat.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross === 0) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}
export function fanInto(coords, vertices) {
  if (vertices.length > 3) {
    const flat = flatten(vertices);
    if (!convex(flat)) {
      const shape = flat.map(([x, y]) => new THREE.Vector2(x, y));
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(shape, []))
        coords.push(...vertices[a], ...vertices[b], ...vertices[c]);
      return;
    }
  }
  for (let i = 1; i < vertices.length - 1; i++)
    coords.push(...vertices[0], ...vertices[i], ...vertices[i + 1]);
}
