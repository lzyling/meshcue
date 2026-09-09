import { subtract } from "./brush.js";

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
    return polygons.flatMap((poly) =>
      Array.from({ length: Math.max(0, poly.length - 2) }, (_, i) => ({
        ...p,
        vertices: [poly[0], poly[i + 1], poly[i + 2]].map((q) => q.slice(2)),
      })),
    );
  });
}
