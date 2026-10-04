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
