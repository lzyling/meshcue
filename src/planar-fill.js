import { Vector3, Matrix3 } from "three";

// Use the original mesh topology, before independent review tessellation creates
// T-junctions. No links between disconnected objects or merely parallel planes.
export function buildFillTopology(geometry, matrixWorld) {
  const attr = geometry.attributes.position,
    index = geometry.index;
  const count = (index?.count || attr.count) / 3;
  const normalMatrix = new Matrix3().getNormalMatrix(matrixWorld);
  const vertices = [],
    normals = [],
    adjacency = Array.from({ length: count }, () => new Set());
  const edges = new Map();
  const key = (p) => p.map((v) => Math.round(v * 1e7)).join(",");
  for (let face = 0; face < count; face++) {
    const points = [0, 1, 2].map((j) =>
      new Vector3().fromBufferAttribute(
        attr,
        index ? index.getX(face * 3 + j) : face * 3 + j,
      ),
    );
    vertices.push(points.map((p) => p.toArray()));
    normals.push(
      points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]))
        .applyMatrix3(normalMatrix)
        .normalize(),
    );
    const keys = points.map((p) => key(p.toArray()));
    for (let j = 0; j < 3; j++) {
      const edge = [keys[j], keys[(j + 1) % 3]].sort().join("|");
      const owners = edges.get(edge) || [];
      for (const other of owners) {
        adjacency[face].add(other);
        adjacency[other].add(face);
      }
      owners.push(face);
      edges.set(edge, owners);
    }
  }
  return { vertices, normals, adjacency };
}
export function planarFaces(topology, seed, tolerance = 6) {
  const { normals, adjacency } = topology;
  if (!normals[seed]) return [];
  // The slider deliberately has a bounded range: it cannot dissolve a whole
  // rounded object into a single plane through a moving reference normal.
  const cos = Math.cos(
    (Math.max(0.1, Math.min(30, tolerance)) * Math.PI) / 180,
  );
  const result = new Set([seed]),
    queue = [seed];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of adjacency[current]) {
      if (
        result.has(next) ||
        normals[next].dot(normals[seed]) < cos ||
        normals[next].dot(normals[current]) < cos
      )
        continue;
      result.add(next);
      queue.push(next);
    }
  }
  return [...result];
}
