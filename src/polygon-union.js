import * as martinez from "martinez-polygon-clipping";

/* The half 0.13.2 left alone, and said so: a face larger than the brush is
   covered by the union of several stamps and by no single one, so the stamp
   that reports `whole` never arrives and every dab is stored. Measured on a
   coarse face painted the way someone shades an area in — fourteen passes —
   the stored polygons grew 52 -> 492 and their vertices 1,584 -> 14,656, while
   the union of them stayed one ring and grew 418 -> 530. Linear in how long
   the stroke was, against nearly flat.

   The note in `brush.js` also records how not to do this: subtracting patches
   from each other turned one line into 230,151 patches and 33MB. What that
   attempt lacked was a boolean operation that is exact about where two edges
   cross, which is what `robust-predicates` under this library provides.

   Everything here is confined to one face at a time. The polygons on a face
   are coplanar by construction — all of them were clipped from the same
   review triangle — so the union happens in that plane and the third
   coordinate is recovered from it rather than carried through the operation. */

// The axis the face plane is most nearly perpendicular to is the one worth
// dropping: projecting along it keeps the other two furthest from degenerate.
function planeOf(triangle) {
  const [a, b, c] = triangle;
  const u = b.map((v, i) => v - a[i]);
  const v = c.map((w, i) => w - a[i]);
  const normal = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const magnitude = normal.map(Math.abs);
  const drop = magnitude.indexOf(Math.max(...magnitude));
  if (!(magnitude[drop] > 0)) return null;
  const axes = [0, 1, 2].filter((i) => i !== drop);
  return {
    drop,
    axes,
    flatten: (p) => [p[axes[0]], p[axes[1]]],
    // Solve the plane equation for the dropped coordinate. Exact for points
    // that were on the plane to begin with, which every one of these was.
    lift: (q) => {
      const p = [];
      p[axes[0]] = q[0];
      p[axes[1]] = q[1];
      p[drop] =
        a[drop] -
        (normal[axes[0]] * (q[0] - a[axes[0]]) +
          normal[axes[1]] * (q[1] - a[axes[1]])) /
          normal[drop];
      return p;
    },
    area: Math.abs(normal[drop]) / 2,
  };
}
const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(sum / 2);
};
const closed = (flat) => {
  const ring = flat.map((p) => [p[0], p[1]]);
  ring.push([...ring[0]]);
  return ring;
};

/* Returns the same surface described by fewer polygons, or null when the
   answer is not usable and the caller should keep what it had. Null is
   returned rather than a best effort for two reasons, and both are the same
   reason: a mark that no longer means what the reviewer painted is worse than
   a mark that costs too much.

   - A union with holes cannot be written back. Storage is a flat list of
     simple rings with nowhere to say "except this part", and splitting a
     holed polygon into simple ones is a second geometry problem. Painting a
     closed loop and leaving the middle is the only way to reach it.
   - Anything the library refuses, for any reason. */
// Matches the service's per-polygon vertex ceiling. A union that would not be
// accepted is not worth holding, and the soup it replaces is always valid.
export const MAX_POLYGON_VERTICES = 4096;

export function unionFace(polygons, triangle) {
  if (polygons.length < 2) return null;
  const plane = planeOf(triangle);
  if (!plane) return null;
  let result;
  try {
    result = polygons
      .map((poly) => [closed(poly.map(plane.flatten))])
      .reduce((acc, poly) => (acc ? martinez.union(acc, poly) : poly), null);
  } catch {
    return null;
  }
  if (!result?.length) return null;
  if (result.some((polygon) => polygon.length > 1)) return null;
  const rings = result.map((polygon) => polygon[0]);
  if (rings.some((ring) => ring.length < 4)) return null;
  if (rings.some((ring) => ring.length - 1 > MAX_POLYGON_VERTICES)) return null;
  /* The union is only taken when it is cheaper, so compaction can never make a
     draft larger than leaving it alone would have. A boundary can in principle
     be described by more vertices than the pieces behind it — two dabs barely
     touching is the small case — and paying for that would be a strange way to
     spend a saving. */
  const before = polygons.reduce((n, poly) => n + poly.length, 0);
  const after = rings.reduce((n, ring) => n + ring.length - 1, 0);
  if (after >= before) return null;
  const covered = rings.reduce((n, ring) => n + ringArea(ring), 0);
  return {
    // Drop the repeated closing vertex: storage has never written one.
    polygons: rings.map((ring) => ring.slice(0, -1).map(plane.lift)),
    /* The two fixes meet here. A face the union says is covered end to end is
       exactly what `source-v2` stores for nothing, so the cost of painting one
       face rises with the boundary until the boundary becomes the face itself
       and then falls to a single number. That is the ceiling. */
    whole: covered >= plane.area * (1 - 1e-6),
    coverage: covered / plane.area,
  };
}
