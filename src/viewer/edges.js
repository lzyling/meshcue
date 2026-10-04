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
  // A linked list in typed storage avoids one object and one owners array per
  // edge: at 600k triangles those tiny allocations outweighed the model itself.
  // Each triangle corner identifies its outgoing edge and its owning face.
  // Numeric pair keys remain exact below the 600k source-triangle ceiling.
  const next = new Int32Array(ids.length).fill(-1);
  const selected = new Uint8Array(ids.length);
  const cos = Math.cos((threshold * Math.PI) / 180);
  for (let face = 0; face < ids.length / 3; face++) {
    const n = face * 3;
    if (normals[n] ** 2 + normals[n + 1] ** 2 + normals[n + 2] ** 2 < 0.5)
      continue;
    for (let j = 0; j < 3; j++) {
      const a = face * 3 + j,
        b = face * 3 + ((j + 1) % 3);
      if (ids[a] === ids[b]) continue;
      const key =
        Math.min(ids[a], ids[b]) * ids.length + Math.max(ids[a], ids[b]);
      const first = edges.get(key);
      if (first === undefined) edges.set(key, a);
      else {
        for (
          let owner = first;
          owner !== -1 && !selected[first];
          owner = next[owner]
        ) {
          const other = Math.floor(owner / 3);
          selected[first] = faceIds
            ? faceIds[other] !== faceIds[face]
            : normals[n] * normals[other * 3] +
                normals[n + 1] * normals[other * 3 + 1] +
                normals[n + 2] * normals[other * 3 + 2] <
              cos - 1e-7;
        }
        next[a] = next[first];
        next[first] = a;
      }
    }
  }
  let count = 0;
  for (const first of edges.values())
    if (selected[first] || next[first] === -1) count++;
  const feature = new Float32Array(count * 6);
  // STEP wireframe follows file faces; triangle diagonals are intentionally
  // absent even where those triangles approximate a curved B-rep surface.
  const wire = faceIds ? feature : new Float32Array(edges.size * 6);
  let f = 0,
    w = 0;
  for (const first of edges.values()) {
    const include = selected[first] || next[first] === -1;
    const b = first - (first % 3) + ((first + 1) % 3);
    for (const i of [first, b])
      for (let k = 0; k < 3; k++) {
        const value = positions[i * 3 + k];
        if (include) feature[f++] = value;
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
