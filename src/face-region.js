import { planarFaces } from "./planar-fill.js";

// STEP's tessellator preserves the author's face boundaries, including tangent
// joins and closed curved surfaces. Normal-angle growth cannot recover those
// boundaries, so only meshes without that provenance use the spread setting.
// These are still source triangle ids: saved fills retain their existing shape.
export function faceRegion(topology, seed, tolerance = 6) {
  if (!Number.isInteger(seed) || seed < 0 || !topology.normals[seed]) return [];
  if (!topology.brep) return planarFaces(topology, seed, tolerance);
  const [first, last] = topology.brep.ranges[topology.brep.of[seed]];
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}
