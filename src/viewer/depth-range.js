import * as THREE from "three";

/* How far the drawn scene reaches along the view, so the depth range can be
   fitted to it. The depth buffer has a fixed number of steps between the
   near and far planes, and in perspective almost all of them are spent close
   to the near plane: a near plane set by distance alone makes the step at the
   model grow with the distance, until two faces a fraction of a millimetre
   apart share one. Fitting near to the nearest thing actually drawn makes the
   step follow the model's own size instead.

   Every bound here is conservative: a bounding sphere contains its geometry,
   the view cone contains the frustum, and the ground's bound is the nearest
   point of its plane anywhere inside the frustum. A near plane at or before
   these can never cut a drawn pixel. */

const sphere = new THREE.Sphere();
const offset = new THREE.Vector3();
const ray = new THREE.Vector3();

export const emptyDepth = () => ({ nearest: Infinity, farthest: -Infinity });

/* Nearest depth of a sphere inside a circular cone around the view axis,
   apex at the eye: the sphere's centre at depth `z` and `rho` off the axis,
   radius `r`, the cone's half-angle tangent `tan`. Infinity where the sphere
   is not in the cone at all; not above zero where the eye is inside it.
   Without a cone (tan Infinity) this is the sphere's own nearest depth.

   By symmetry the answer lies in the plane through the axis and the centre.
   There, if the sphere's nearest point along the axis is inside the cone it
   is the answer; otherwise the answer is where the sphere first meets the
   cone's edge on the centre's side. */
export function coneDepth(z, rho, r, tan = Infinity) {
  const nearest = z - r;
  if (!(tan < Infinity) || rho * rho + z * z <= r * r) return nearest;
  if (nearest >= 0 && rho <= nearest * tan) return nearest;
  const length = Math.hypot(1, tan);
  const along = (rho * tan + z) / length;
  const across = rho * rho + z * z - along * along;
  if (across > r * r) return Infinity;
  const t = along - Math.sqrt(r * r - across);
  // Eye outside the sphere: both crossings are on one side of it.
  return t < 0 ? Infinity : t / length;
}

/* Widen `range` by a bounding sphere (geometry's, placed by matrixWorld).
   With a cone, a sphere beside or behind the view only counts for the part
   of it that can be on screen. */
export function addSphereDepth(
  range,
  geometry,
  matrixWorld,
  eye,
  forward,
  tan = Infinity,
) {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere;
  if (!bounds || !(bounds.radius >= 0)) return range;
  sphere.copy(bounds).applyMatrix4(matrixWorld);
  if (!Number.isFinite(sphere.radius)) return range;
  const v = offset.subVectors(sphere.center, eye);
  const z = v.dot(forward);
  const rho = Math.sqrt(Math.max(0, v.lengthSq() - z * z));
  const nearest = coneDepth(z, rho, sphere.radius, tan);
  if (nearest === Infinity) return range;
  range.nearest = Math.min(range.nearest, nearest);
  range.farthest = Math.max(range.farthest, z + sphere.radius);
  return range;
}

/* Nearest view depth of the horizontal plane y = height inside a perspective
   frustum (unbounded in depth), or Infinity where the plane is not in view.
   The plane's part inside the frustum is convex and depth grows along every
   direction it extends to, so its nearest point is where one of the four
   corner rays meets it. `right`, `up` and `forward` are the camera's unit
   axes; `tanX` and `tanY` are the half-angles' tangents. */
export function planeDepth(height, eye, right, up, forward, tanX, tanY) {
  let nearest = Infinity;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      // Scaled so its forward component is 1: the hit's t is its depth.
      ray
        .copy(forward)
        .addScaledVector(right, sx * tanX)
        .addScaledVector(up, sy * tanY);
      if (ray.y === 0) continue;
      const t = (height - eye.y) / ray.y;
      if (t > 0) nearest = Math.min(nearest, t);
    }
  return nearest;
}

/* The depth range to draw with. `near` and `far` are the distance-based
   planes, used as they are when nothing bounds the scene or the camera is
   inside the bounds (zoomed in among the parts). Near only ever moves out,
   to just short of the nearest bound; far only ever moves out, so whatever
   it already showed beyond the model (the ground) stays. */
export function fittedRange(range, near, far) {
  if (!(range.farthest > range.nearest) || !Number.isFinite(range.nearest))
    return { near, far };
  const margin = (range.farthest - range.nearest) * 1e-3;
  return {
    near: Math.max(near, range.nearest - margin),
    far: Math.max(far, range.farthest + margin),
  };
}
