import * as THREE from "three";

// Brush coverage is clipped on the surface, not rounded up to hit triangles.
// Screen coordinates carry perspective-correct local positions. Occluders are
// subtracted before export, so rotating later cannot reveal paint on hidden faces.
const EPS = 1e-8;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function clip(poly, distance) {
  const out = [];
  if (!poly.length) return out;
  let a = poly.at(-1),
    da = distance(a);
  for (const b of poly) {
    const db = distance(b);
    if (da >= 0 !== db >= 0) out.push(mix(a, b, da / (da - db)));
    if (db >= 0) out.push(b);
    a = b;
    da = db;
  }
  return out;
}
const area = (p) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
const useful = (p, minArea = 1e-7) =>
  p.length >= 3 && Math.abs(area(p)) > minArea;
function edge(a, b) {
  return (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}
export function subtract(subject, cutter, minArea = 1e-7) {
  if (!useful(cutter, minArea)) return [subject];
  const ccw = area(cutter) > 0 ? cutter : [...cutter].reverse();
  let inside = subject;
  const outside = [];
  for (let i = 0; i < ccw.length && useful(inside, minArea); i++) {
    const d = edge(ccw[i], ccw[(i + 1) % ccw.length]);
    const piece = clip(inside, (p) => -d(p));
    if (useful(piece, minArea)) outside.push(piece);
    inside = clip(inside, d);
  }
  // Edge extensions may partition a disjoint subject. No actual overlap means
  // no edit, rather than replacing it with equivalent fragments.
  return useful(inside, minArea) ? outside : [subject];
}
function bounds(poly) {
  return [
    Math.min(...poly.map((p) => p[0])),
    Math.min(...poly.map((p) => p[1])),
    Math.max(...poly.map((p) => p[0])),
    Math.max(...poly.map((p) => p[1])),
  ];
}
const overlaps = (a, b) =>
  a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function depthPlane(p) {
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[0], p[i], p[i + 1]];
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < EPS) continue;
    const x =
      ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / det;
    const y =
      ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / det;
    return (v) => a[2] + x * (v[0] - a[0]) + y * (v[1] - a[1]);
  }
  return null;
}

export function brushPatches(meshes, camera, rect, x, y, radius) {
  camera.updateMatrixWorld();
  const candidates = [],
    circle = [];
  // Inscribed 64-gon: under 0.08 CSS px error at maximum supported radius.
  for (let i = 0; i < 64; i++) {
    const theta = (i * Math.PI * 2) / 64;
    circle.push([x + radius * Math.cos(theta), y + radius * Math.sin(theta)]);
  }
  const edges = circle.map((p, i) => edge(p, circle[(i + 1) % circle.length]));
  for (const mesh of meshes) {
    const mvp = new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(mesh.matrixWorld);
    const project = (v) => {
      const q = new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(mvp);
      return [q.x, q.y, q.z, q.w, v.x, v.y, v.z];
    };
    const screen = (q) => [
      rect.left + ((q[0] / q[3] + 1) * rect.width) / 2,
      rect.top + ((1 - q[1] / q[3]) * rect.height) / 2,
      q[2] / q[3],
      1 / q[3],
      q[4] / q[3],
      q[5] / q[3],
      q[6] / q[3],
    ];
    mesh.geometry.boundsTree.shapecast({
      intersectsBounds: (box) => {
        const points = [];
        for (const a of [box.min.x, box.max.x])
          for (const b of [box.min.y, box.max.y])
            for (const c of [box.min.z, box.max.z])
              points.push(project(new THREE.Vector3(a, b, c)));
        if (
          points.every((q) => q[2] < -q[3]) ||
          points.every((q) => q[2] > q[3])
        )
          return false;
        if (points.some((q) => q[3] <= EPS || q[2] < -q[3])) return true;
        const bb = bounds(points.map(screen));
        return overlaps(bb, [x - radius, y - radius, x + radius, y + radius]);
      },
      intersectsTriangle: (t, faceIndex) => {
        let poly = [t.a, t.b, t.c].map(project);
        poly = clip(poly, (q) => q[3] - EPS);
        poly = clip(poly, (q) => q[2] + q[3]);
        poly = clip(poly, (q) => q[3] - q[2]);
        if (poly.length < 3) return false;
        poly = poly.map(screen);
        const group = mesh.geometry.groups.find(
          (g) => faceIndex * 3 >= g.start && faceIndex * 3 < g.start + g.count,
        );
        const material = Array.isArray(mesh.material)
          ? mesh.material[group?.materialIndex || 0]
          : mesh.material;
        const winding =
          area(poly) * (mesh.matrixWorld.determinant() < 0 ? -1 : 1);
        if (
          material?.visible === false ||
          (material?.side === THREE.BackSide
            ? winding < 0
            : material?.side !== THREE.DoubleSide && winding > 0)
        )
          return false;
        const depth = depthPlane(poly);
        if (!depth) return false;
        for (const d of edges) {
          poly = clip(poly, d);
          if (poly.length < 3) return false;
        }
        if (candidates.length >= 6000)
          throw new Error(
            "呢一筆涉及太多表面，請放大模型或縮細畫筆；已有筆跡會保留。",
          );
        if (useful(poly))
          candidates.push({ mesh, faceIndex, poly, depth, box: bounds(poly) });
        return false;
      },
    });
  }
  // Spatial buckets avoid comparing every pair on dense meshes.
  const bins = new Map(),
    cell = 16;
  const keys = (box) => {
    const result = [];
    for (let a = Math.floor(box[0] / cell); a <= Math.floor(box[2] / cell); a++)
      for (
        let b = Math.floor(box[1] / cell);
        b <= Math.floor(box[3] / cell);
        b++
      )
        result.push(`${a}:${b}`);
    return result;
  };
  candidates.forEach((c, i) => {
    for (const key of keys(c.box)) {
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(i);
    }
  });
  const patches = [];
  candidates.forEach((target, i) => {
    let pieces = [target.poly];
    const neighbors = new Set(
      keys(target.box).flatMap((k) => bins.get(k) || []),
    );
    for (const j of neighbors) {
      if (j === i) continue;
      const other = candidates[j];
      if (!overlaps(target.box, other.box)) continue;
      const cover = clip(
        other.poly,
        (p) => target.depth(p) - other.depth(p) - EPS,
      );
      if (!useful(cover)) continue;
      pieces = pieces.flatMap((p) => subtract(p, cover));
      if (!pieces.length) break;
    }
    const local = (p) => [p[4] / p[3], p[5] / p[3], p[6] / p[3]];
    for (const piece of pieces)
      for (let k = 1; k < piece.length - 1; k++) {
        const tri = [piece[0], piece[k], piece[k + 1]];
        if (useful(tri))
          patches.push({
            meshId: target.mesh.userData.reviewId,
            faceIndex: target.faceIndex,
            sourceFaceIndex:
              target.mesh.geometry.userData.sourceFaces[target.faceIndex],
            vertices: tri.map(local),
          });
      }
  });
  return patches;
}
