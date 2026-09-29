/* The outline of a set of surface polygons: the stretches of their edges that
   no other polygon of the set shares.

   The Agent's echo is drawn as this outline and nothing more. Filled, it
   covered the reviewer's own marks — an echo of the very region they painted
   hid their colour under the Agent's — so it now traces the places it means
   and leaves every surface inside them to the reviewer.

   Two polygons share an edge only along the triangle edge both lie on, and
   they need not share it end to end: a face taken whole meets a neighbour's
   partial polygon along part of its edge. So an edge is placed on the carrier
   triangle edge it lies on, keyed by that edge's own two corners — exact
   positions, which neighbouring triangles hold identically — and what is
   counted is how much of the carrier each side covers. A stretch covered once
   is outline; twice, it is inside the region. An edge that lies on no carrier
   edge crosses its face, and is outline wherever it is. */

// How far off a carrier edge a point may sit and still be on it, as a share of
// that edge's length and of how far the model reaches from its origin.
const ON_EDGE = 1e-5;
const MAGNITUDE = 1e-6;
// Stretches shorter than this share of their carrier are rounding, not outline.
const SLIVER = 1e-6;

const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
// A fixed order for a carrier's two corners, so both faces beside it measure
// along it from the same end.
const before = (a, b) =>
  a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];

// Where along the carrier p..q the point x sits, or null when it is off it.
function along(x, p, q, span) {
  const d = minus(q, p),
    length2 = dot(d, d);
  if (!length2) return null;
  const t = dot(minus(x, p), d) / length2;
  const off = minus(minus(x, p), [d[0] * t, d[1] * t, d[2] * t]);
  const tolerance = Math.max(ON_EDGE * Math.sqrt(length2), MAGNITUDE * span);
  if (dot(off, off) > tolerance * tolerance) return null;
  if (t < -ON_EDGE || t > 1 + ON_EDGE) return null;
  return Math.min(1, Math.max(0, t));
}

function carried(a, b, carriers, span) {
  for (const triangle of carriers)
    for (let k = 0; k < 3; k++) {
      let p = triangle[k],
        q = triangle[(k + 1) % 3];
      if (!before(p, q)) [p, q] = [q, p];
      const ta = along(a, p, q, span);
      if (ta === null) continue;
      const tb = along(b, p, q, span);
      if (tb === null) continue;
      return {
        key: `${p.join(",")}|${q.join(",")}`,
        p,
        q,
        from: Math.min(ta, tb),
        to: Math.max(ta, tb),
      };
    }
  return null;
}

/* `polygons` are `{ vertices, carriers }`: a polygon's corners, and the
   triangles its edges may lie along — the face it was cut from, and for a mark
   indexed against the review mesh the review triangle too. Returns the outline
   as `{ from, to, owner }` segments, `owner` being the index of the polygon the
   segment bounds, which is the side the region is on. */
export function outlineSegments(polygons) {
  let span = 0;
  for (const polygon of polygons)
    for (const v of polygon.vertices)
      span = Math.max(span, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  const lines = new Map();
  const segments = [];
  polygons.forEach((polygon, owner) => {
    const v = polygon.vertices;
    for (let i = 0; i < v.length; i++) {
      const a = v[i],
        b = v[(i + 1) % v.length];
      if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
      const hit = carried(a, b, polygon.carriers || [], span);
      if (!hit) {
        segments.push({ from: a, to: b, owner });
        continue;
      }
      if (!lines.has(hit.key))
        lines.set(hit.key, { p: hit.p, q: hit.q, stretches: [] });
      lines.get(hit.key).stretches.push({ from: hit.from, to: hit.to, owner });
    }
  });
  for (const { p, q, stretches } of lines.values()) {
    const cuts = [...new Set(stretches.flatMap((s) => [s.from, s.to]))].sort(
      (a, b) => a - b,
    );
    let open = null;
    const close = () => {
      if (open && open.to - open.from > SLIVER)
        segments.push({
          from: lerp(p, q, open.from),
          to: lerp(p, q, open.to),
          owner: open.owner,
        });
      open = null;
    };
    for (let i = 0; i < cuts.length - 1; i++) {
      const [from, to] = [cuts[i], cuts[i + 1]];
      if (to - from <= SLIVER) continue;
      const middle = (from + to) / 2;
      const covering = stretches.filter(
        (s) => s.from <= middle && s.to >= middle,
      );
      if (covering.length !== 1) {
        close();
        continue;
      }
      const owner = covering[0].owner;
      if (open && open.owner === owner && Math.abs(open.to - from) <= SLIVER)
        open.to = to;
      else {
        close();
        open = { from, to, owner };
      }
    }
    close();
  }
  return segments;
}
