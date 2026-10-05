import { Color, Matrix3, Plane, Vector3 } from "three";

// Positive distance is retained, matching three.js material clipping. The
// plane is made in the source frame before the preview's fit and Z-up turn;
// neither operation is allowed to change what the axis or offset means.
export function sectionPlane({ axis, offset, flip = false }, matrixWorld) {
  const normal = new Vector3();
  normal[axis] = flip ? 1 : -1;
  return new Plane(normal, flip ? -offset : offset).applyMatrix4(matrixWorld);
}

export function sectionRange(bounds, axis) {
  const min = bounds.min[axis],
    max = bounds.max[axis];
  return { min, max, offset: min + (max - min) / 2 };
}

export const retainedPoint = (point, plane) =>
  !plane || plane.distanceToPoint(point) >= -1e-8;

// Picking must use the same aggregate winding as the GPU, not the side of
// the first retained hit: a front face inside another solid is behind the
// cap, while the opposite winding of an inner shell cancels a cavity hole.
// The synthetic hit is only an occluder; it never names a markable source face.
export function sectionIntersection(hits, plane, direction, origin) {
  if (!plane) return hits[0] || null;
  let winding = 0,
    surface = null;
  const crossings = new Map();
  for (const hit of hits) {
    if (!retainedPoint(hit.point, plane)) continue;
    const normal = hit.face.normal
      .clone()
      .applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));
    const facing = normal.dot(direction);
    if (Math.abs(facing) < 1e-10) continue;
    if (!surface && facing < 0) surface = hit;
    // A ray on a tessellation diagonal can hit both triangles. Count that
    // crossing once per mesh, but preserve independent overlapping shells.
    const distance = hit.point.distanceTo(origin);
    const previous = crossings.get(hit.object);
    const sign = facing < 0 ? -1 : 1;
    if (
      !previous ||
      Math.abs(previous.distance - distance) > 1e-8 ||
      previous.sign !== sign
    ) {
      winding += sign;
      crossings.set(hit.object, { distance, sign });
    }
  }
  const denominator = plane.normal.dot(direction);
  const distance = -plane.distanceToPoint(origin) / denominator;
  // Eight-bit wrapping deliberately matches Increment/DecrementWrap on the
  // renderer's stencil buffer, including its finite overlap limit.
  if (
    Math.abs(denominator) > 1e-10 &&
    distance >= 0 &&
    winding % 256 !== 0 &&
    (!surface || distance < surface.point.distanceTo(origin) - 1e-8)
  ) {
    return {
      sectionCap: true,
      distance,
      point: origin.clone().addScaledVector(direction, distance),
    };
  }
  return surface;
}

export function sectionPick(hits, plane, direction, origin) {
  const hit = sectionIntersection(hits, plane, direction, origin);
  return hit?.sectionCap ? null : hit;
}

// Only the screen target is shortened: an edge measurement still names the
// file's complete feature. Inventing an endpoint at the viewing plane would
// quietly turn a view control into a geometry measurement.
export function sectionSegment(a, b, plane) {
  if (!plane) return [a, b];
  const da = plane.distanceToPoint(a),
    db = plane.distanceToPoint(b);
  if (da < 0 && db < 0) return null;
  if (da >= 0 && db >= 0) return [a, b];
  const at = a.clone().lerp(b, da / (da - db));
  return da < 0 ? [at, b] : [a, at];
}

// The part tree owns identity, including multiple glTF material primitives on
// one node. Legacy exports can instead make every open face a separate node:
// those fragments must keep their shared counter or an inward cavity shell
// becomes a filled part. Original topology (before review subdivision creates
// T-junctions) lets us detect these fragments without welding geometry again.
export function sectionPartGroups(meshes, parts) {
  const owners = new Map();
  for (const mesh of meshes) {
    const id = parts?.partOfMesh(mesh.userData.reviewId) || "model";
    if (!owners.has(id)) owners.set(id, { id, meshes: [] });
    owners.get(id).meshes.push(mesh);
  }
  const groups = [],
    fragments = [];
  const order = new Map((parts?.list() || []).map((part, i) => [part.id, i]));
  const sorted = [...owners.values()].sort(
    (a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0),
  );
  for (const group of sorted) {
    // Multiple primitives already belong to one part and must never be split.
    const topology = group.meshes[0].userData.fillTopology;
    if (
      group.meshes.length === 1 &&
      topology?.adjacency.some((a) => a.size < 3)
    )
      fragments.push(...group.meshes);
    else groups.push(group);
  }
  if (fragments.length) groups.push({ id: "open-shells", meshes: fragments });
  return groups;
}

// These middle-value categorical colours remain visible against either canvas
// theme. Keep the order fixed: hiding a neighbour must never recolour a part.
const SECTION_PALETTE = [
  "#d99a47",
  "#55b7c7",
  "#be79c9",
  "#7cba65",
  "#dc737a",
  "#7c99dc",
  "#c5b85d",
  "#64b6a0",
  "#d08aaf",
  "#9d9b73",
];
export function sectionPartColors(source, plain = false) {
  const similar = source.some((a, i) =>
    source
      .slice(0, i)
      .some((b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 0.18),
  );
  const tooDark = source.some((c) => Math.max(c.r, c.g, c.b) < 0.08);
  const categorical = tooDark || (source.length > 1 && (plain || similar));
  // Three stores linear RGB. Multiplying by 0.68 retains the source hue while
  // making the cut visibly darker. Hatch ink multiplies that result by 0.42.
  return source.map((c, i) =>
    (categorical
      ? new Color(SECTION_PALETTE[i % SECTION_PALETTE.length])
      : c.clone()
    ).multiplyScalar(0.68),
  );
}

// Software-renderer measurements at 50 parts made full stencil clears the
// expensive part of independent caps. Beyond 32 parts, complete parts sharing
// a categorical colour also share one winding counter (at most ten clears).
// This keeps palette identity and hatch direction per part without ever
// splitting a part's outer/cavity shells between counters. As with ordinary
// per-part caps, the last category wins where different solids overlap.
export function sectionCapBatches(groups) {
  if (groups.length <= 32) return groups;
  const batches = Array.from({ length: SECTION_PALETTE.length }, (_, i) => ({
    id: `palette-${i}`,
    meshes: [],
    palette: true,
  }));
  groups.forEach((group, i) =>
    batches[i % batches.length].meshes.push(...group.meshes),
  );
  return batches;
}
