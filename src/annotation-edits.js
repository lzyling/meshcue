import { subtract, round } from "./brush.js";

export function letterNumber(label) {
  return /^[A-Z]+$/.test(label)
    ? [...label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
    : 0;
}
export function letterLabel(n) {
  let s = "";
  for (; n > 0; n = Math.floor(n / 26)) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}
export function facesOf(patches) {
  const sets = {};
  for (const p of patches) (sets[p.meshId] ||= new Set()).add(p.faceIndex);
  return Object.fromEntries(
    Object.entries(sets).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]),
  );
}

/* Stamps overlap on purpose — the spacing is half the brush radius, which
   keeps the scallop between two of them under a pixel — so a face small enough
   to sit inside the brush is handed over once per stamp that passed across it.
   Measured on a 600px line over an 80,000-triangle mesh: 16,548 polygons
   describing 5,119 faces, 3.2 copies of the same triangle each.

   Two of those are dropped here and neither needs a boolean operation. A
   polygon identical to one already stored for that face adds nothing. And once
   some stamp reports it took a face whole, every other polygon on that face is
   inside it by definition, including ones stored before it arrived — which is
   what the filter at the end is for.

   What this cannot see is left alone: a face larger than the brush, covered by
   the union of several stamps and by no single one. Collapsing that needs real
   polygon union. Reaching for it by subtracting patches from each other is the
   attempt that turned one line into 230,151 patches and 33MB. */
const faceKey = (p) => `${p.meshId}:${p.faceIndex}`;

/* A face covered end to end is spelled by its own number and nothing else.
   `faces` already names it; a polygon repeating the triangle that number
   points at costs about 142 bytes to say a second time what the index said
   for six, and on a dense mesh under a wide brush that is most of the draft.
   So under `source-v2` a face listed in `faces` with no patch beside it means
   the whole face, and a face with patches means those patches and no more.

   This is what lets the flag survive a reload, which the earlier design could
   not: wholeness is no longer a stamp's passing hint but the shape of what is
   stored, so a draft read back from the server still knows. */
export const wholeFaces = (region) => {
  const whole = new Set();
  for (const [meshId, faces] of Object.entries(region.faces || {}))
    for (const f of faces) whole.add(`${meshId}:${f}`);
  for (const p of region.surfacePatches || []) whole.delete(faceKey(p));
  return whole;
};

// Kept between stamps; rebuilding it per stamp would walk the whole draft each
// time. Thrown away when the region is not the object it was built from, or
// left a different number of patches behind. Erasing replaces the region
// object, so identity catches that before the count is read.
export function paintIndex(region, previous) {
  if (
    previous?.region === region &&
    previous.count === region.surfacePatches.length
  )
    return previous;
  const index = {
    region,
    count: region.surfacePatches.length,
    shapes: new Map(),
    whole: wholeFaces(region),
  };
  for (const p of region.surfacePatches) {
    const key = faceKey(p);
    if (!index.shapes.has(key)) index.shapes.set(key, new Set());
    index.shapes.get(key).add(JSON.stringify(p.vertices));
  }
  return index;
}

// `whole` arrives as the stamp's hint and leaves as an absence: the face is
// recorded, the polygon describing it is not.
export function addPatches(region, patches, index) {
  const collapsed = new Set();
  for (const { whole, ...p } of patches) {
    const key = faceKey(p);
    if (index.whole.has(key)) continue;
    if (whole) {
      index.whole.add(key);
      index.shapes.delete(key);
      collapsed.add(key);
      (region.faces[p.meshId] ||= []).push(p.faceIndex);
      continue;
    }
    const shape = JSON.stringify(p.vertices);
    let shapes = index.shapes.get(key);
    if (shapes?.has(shape)) continue;
    if (!shapes) index.shapes.set(key, (shapes = new Set()));
    shapes.add(shape);
    (region.faces[p.meshId] ||= []).push(p.faceIndex);
    region.surfacePatches.push(p);
  }
  if (collapsed.size)
    region.surfacePatches = region.surfacePatches.filter(
      (p) => !collapsed.has(faceKey(p)),
    );
  index.count = region.surfacePatches.length;
  for (const key of Object.keys(region.faces))
    region.faces[key] = [...new Set(region.faces[key])].sort((a, b) => a - b);
  return index;
}

// Both cutter and subject belong to the same immutable review triangle.
// Project onto its dominant plane; carry XYZ through polygon interpolation.
export function erasePatches(patches, cutters) {
  const byFace = new Map();
  for (const p of cutters) {
    const key = `${p.meshId}:${p.faceIndex}`;
    if (!byFace.has(key)) byFace.set(key, []);
    byFace.get(key).push(p);
  }
  return patches.flatMap((p) => {
    const cuts = byFace.get(`${p.meshId}:${p.faceIndex}`);
    if (!cuts) return [p];
    const [a, b, c] = p.vertices;
    const u = b.map((v, i) => v - a[i]),
      v = c.map((w, i) => w - a[i]);
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const drop = normal
      .map(Math.abs)
      .indexOf(Math.max(...normal.map(Math.abs)));
    const axes = [0, 1, 2].filter((i) => i !== drop);
    const project = (point) => [
      point[axes[0]] - a[axes[0]],
      point[axes[1]] - a[axes[1]],
      ...point,
    ];
    const minArea = Math.abs(normal[drop]) * 0.5e-12;
    let polygons = [p.vertices.map(project)];
    for (const cut of cuts)
      polygons = polygons.flatMap((poly) =>
        subtract(poly, cut.vertices.map(project), minArea),
      );
    // Polygons, for the same reason the brush stores them: a fan repeats the
    // patch's own identity once per triangle it was cut into.
    return polygons.map((poly) => ({
      ...p,
      vertices: poly.map((q) => q.slice(2).map(round)),
    }));
  });
}
