import { Matrix3, Plane, Vector3 } from "three";

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

// Keep the nearest retained intersection even when it is a back face. Walking
// past it would let a click pass through the amber fill and mark another part
// that the reviewer cannot see. Occlusion uses that same hit as a blocker.
export function sectionIntersection(hits, plane) {
  return hits.find((hit) => retainedPoint(hit.point, plane)) || null;
}

export function sectionPick(hits, plane, direction) {
  const hit = sectionIntersection(hits, plane);
  if (!hit || !plane) return hit;
  const normal = hit.face.normal
    .clone()
    .applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld));
  return normal.dot(direction) < 0 ? hit : null;
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
