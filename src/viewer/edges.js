// One threshold for both the worker and its geometry tests. Positions are
// welded with the same precision as fill topology, before review subdivision
// introduces independent T-junctions that are not edges in the source file.
export const CREASE_DEGREES = 30;
export function extractEdges(
  { positions, normals, faceIds },
  threshold = CREASE_DEGREES,
) {
  const started = performance.now();
  const vertices = new Map(),
    edges = new Map();
  const ids = new Uint32Array(positions.length / 3);
  for (let i = 0; i < ids.length; i++) {
    const key = [0, 1, 2]
      .map((j) => Math.round(positions[i * 3 + j] * 1e7))
      .join(",");
    if (!vertices.has(key)) vertices.set(key, vertices.size);
    ids[i] = vertices.get(key);
  }
  const cos = Math.cos((threshold * Math.PI) / 180);
  for (let face = 0; face < ids.length / 3; face++) {
    const normal = normals.subarray(face * 3, face * 3 + 3);
    if (normal.reduce((sum, n) => sum + n * n, 0) < 0.5) continue;
    for (let j = 0; j < 3; j++) {
      const a = face * 3 + j,
        b = face * 3 + ((j + 1) % 3);
      if (ids[a] === ids[b]) continue;
      const key =
        ids[a] < ids[b] ? `${ids[a]}:${ids[b]}` : `${ids[b]}:${ids[a]}`;
      const edge = edges.get(key);
      if (!edge) edges.set(key, { a, b, owners: [face], feature: false });
      else {
        edge.feature ||= edge.owners.some((other) =>
          faceIds
            ? faceIds[other] !== faceIds[face]
            : normal.reduce(
                (sum, n, k) => sum + n * normals[other * 3 + k],
                0,
              ) <
              cos - 1e-7,
        );
        edge.owners.push(face);
      }
    }
  }
  let count = 0;
  for (const edge of edges.values())
    if (edge.feature || edge.owners.length === 1) count++;
  const feature = new Float32Array(count * 6);
  // STEP wireframe follows file faces; triangle diagonals are intentionally
  // absent even where those triangles approximate a curved B-rep surface.
  const wire = faceIds ? feature : new Float32Array(edges.size * 6);
  let f = 0,
    w = 0;
  for (const edge of edges.values()) {
    const selected = edge.feature || edge.owners.length === 1;
    for (const i of [edge.a, edge.b])
      for (let k = 0; k < 3; k++) {
        const value = positions[i * 3 + k];
        if (selected) feature[f++] = value;
        if (!faceIds) wire[w++] = value;
      }
  }
  return {
    feature,
    wire,
    buildMs: performance.now() - started,
    bytes: feature.byteLength + (wire === feature ? 0 : wire.byteLength),
  };
}

export function edgeInput(topology) {
  const positions = new Float32Array(topology.vertices.length * 9);
  const normals = new Float32Array(topology.vertices.length * 3);
  topology.vertices.forEach((points, i) => {
    points.forEach((p, j) => positions.set(p, i * 9 + j * 3));
    const n = topology.normals[i];
    normals.set([n.x, n.y, n.z], i * 3);
  });
  return { positions, normals, faceIds: topology.brep?.of.slice() };
}
