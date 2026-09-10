import * as THREE from "three";

// Deterministic review-only tessellation. The source GLB/STL is never modified.
// Every review triangle remembers its original triangle; selected patches export
// original-mesh local coordinates as well as both indices.
// Bumped when the emitted triangles change: annotations index into them, so a
// stale browser tab must be refused by saveManifest rather than quietly record
// marks against a tessellation the server no longer produces.
export const SURFACE_ALGORITHM = "midpoint-v2-edge0.07-rationed";
const EDGE = 0.07;
const MAX_DEPTH = 12;
export function reviewSurface(geometry, matrixWorld, budget = 600000) {
  const sourceCount =
    (geometry.index?.count || geometry.attributes.position.count) / 3;
  const names = Object.keys(geometry.attributes).filter(
    (n) => geometry.attributes[n].itemSize <= 4,
  );
  const sizes = Object.fromEntries(
    names.map((n) => [n, geometry.attributes[n].itemSize]),
  );
  const output = Object.fromEntries(names.map((n) => [n, []])),
    sources = [],
    groups = [];
  const va = new THREE.Vector3(),
    vb = new THREE.Vector3();
  const read = (i) =>
    Object.fromEntries(
      names.map((n) => [
        n,
        Array.from({ length: sizes[n] }, (_, c) =>
          geometry.attributes[n].getComponent(i, c),
        ),
      ]),
    );
  const midpoint = (a, b) =>
    Object.fromEntries(
      names.map((n) => {
        const v = a[n].map((x, i) => (x + b[n][i]) / 2);
        if (n === "normal") {
          const len = Math.hypot(...v) || 1;
          for (let i = 0; i < v.length; i++) v[i] /= len;
        }
        return [n, v];
      }),
    );
  // Takes raw positions so the pricing pass can run without building a full
  // attribute record for every candidate midpoint.
  const length = (a, b) => {
    va.fromArray(a).applyMatrix4(matrixWorld);
    vb.fromArray(b).applyMatrix4(matrixWorld);
    return va.distanceToSquared(vb);
  };
  const emit = (vertices, source, material) => {
    for (const v of vertices) for (const n of names) output[n].push(...v[n]);
    const start = sources.length * 3;
    sources.push(source);
    const previous = groups.at(-1);
    if (previous?.materialIndex === material) previous.count += 3;
    else groups.push({ start, count: 3, materialIndex: material });
  };
  const vertexIds = (face) =>
    [0, 1, 2].map((k) =>
      geometry.index ? geometry.index.getX(face * 3 + k) : face * 3 + k,
    );
  // Price every face first, using positions only: the same split predicate and
  // the same first-longest-edge choice, without reading or interpolating any
  // other attribute. Only then is it known whether the budget binds at all.
  const positionOf = (i) => [
    geometry.attributes.position.getX(i),
    geometry.attributes.position.getY(i),
    geometry.attributes.position.getZ(i),
  ];
  const half = (a, b) => a.map((x, i) => (x + b[i]) / 2);
  const fullCost = (corners) => {
    let count = 0;
    const stack = [{ p: corners, depth: 0 }];
    while (stack.length) {
      const { p, depth } = stack.pop();
      const lengths = [
        length(p[0], p[1]),
        length(p[1], p[2]),
        length(p[2], p[0]),
      ];
      const longest = Math.max(...lengths);
      if (longest > EDGE ** 2 && depth < MAX_DEPTH) {
        const a = lengths.indexOf(longest),
          b = (a + 1) % 3,
          c = (a + 2) % 3,
          m = half(p[a], p[b]);
        stack.push(
          { p: [m, p[b], p[c]], depth: depth + 1 },
          { p: [p[a], m, p[c]], depth: depth + 1 },
        );
      } else count++;
    }
    return count;
  };
  const costs = [];
  let wanted = 0;
  for (let face = 0; face < sourceCount; face++) {
    costs.push(fullCost(vertexIds(face).map(positionOf)));
    wanted += costs[face];
  }
  // A single global counter spent the budget on whichever faces the index
  // buffer happened to list first, so on a large model the leading faces were
  // subdivided hundreds of times over while the rest stayed raw triangles and
  // the brush snapped across them. Ration per face instead, and only when the
  // whole model genuinely does not fit.
  const rationed = wanted > budget;
  const caps = rationed
    ? costs.map((cost) => Math.max(1, Math.floor((budget * cost) / wanted)))
    : null;
  for (let face = 0; face < sourceCount; face++) {
    const vertices = vertexIds(face).map(read);
    const group =
      geometry.groups.find(
        (g) => face * 3 >= g.start && face * 3 < g.start + g.count,
      )?.materialIndex || 0;
    const cap = rationed ? caps[face] : Infinity;
    let emitted = 1;
    const queue = [{ v: vertices, depth: 0 }];
    while (queue.length) {
      // Below the budget this stays depth-first, so the emitted geometry is
      // identical to the unrationed algorithm and an in-progress draft's face
      // indices keep pointing at the same triangles. A rationed face goes
      // breadth-first so it degrades evenly rather than in one corner.
      const { v, depth } = rationed ? queue.shift() : queue.pop();
      const lengths = [
        length(v[0].position, v[1].position),
        length(v[1].position, v[2].position),
        length(v[2].position, v[0].position),
      ];
      const longest = Math.max(...lengths);
      if (longest > EDGE ** 2 && depth < MAX_DEPTH && emitted < cap) {
        const a = lengths.indexOf(longest),
          b = (a + 1) % 3,
          c = (a + 2) % 3,
          m = midpoint(v[a], v[b]);
        emitted++;
        queue.push(
          { v: [m, v[b], v[c]], depth: depth + 1 },
          { v: [v[a], m, v[c]], depth: depth + 1 },
        );
      } else emit(v, face, group);
    }
  }
  const result = new THREE.BufferGeometry();
  for (const n of names)
    result.setAttribute(
      n,
      new THREE.Float32BufferAttribute(output[n], sizes[n]),
    );
  for (const g of groups) result.addGroup(g.start, g.count, g.materialIndex);
  result.userData.sourceFaces = sources;
  result.userData.sourceTriangles = sourceCount;
  result.userData.surfaceAlgorithm = SURFACE_ALGORITHM;
  if (!result.attributes.normal) result.computeVertexNormals();
  return result;
}
