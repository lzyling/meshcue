import * as THREE from "three";

export const easeNavigation = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export const visibleHeight = (distance, fov = 38) =>
  2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2));
export const perspectiveDistance = (height, fov = 38) =>
  height / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
export const zoomLimits = (size) => ({ min: size * 0.001, max: size * 20 });
export function boxCorners(box) {
  return Array.from(
    { length: 8 },
    (_, i) =>
      new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ),
  );
}

/* Fit all eight corners in camera space, including their depth. A bounding
   sphere wastes the screen on thin plates and an XY-only fit clips the near
   corners of a deep assembly in perspective. */
export function fitFrame(
  box,
  direction,
  aspect,
  fov = 38,
  orthographic = false,
  area = { left: 0, right: 1, top: 0, bottom: 1 },
  cameraUp = new THREE.Vector3(0, 1, 0),
) {
  const target = box.getCenter(new THREE.Vector3());
  const back = direction.clone().normalize();
  // A rolled view has a different screen basis; Fit must not crop its tall
  // projection by measuring against the pre-roll world-up direction.
  const right = new THREE.Vector3().crossVectors(cameraUp, back);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const halfWidth = area.right - area.left,
    halfHeight = area.bottom - area.top,
    centerX = area.left + area.right - 1,
    centerY = 1 - area.top - area.bottom;
  let distance = 0,
    height = 0;
  for (const corner of boxCorners(box)) {
    const p = corner.sub(target);
    const x = p.dot(right) * 1.08,
      y = p.dot(up) * 1.08,
      z = p.dot(back);
    height = Math.max(
      height,
      (2 * Math.abs(y)) / halfHeight,
      (2 * Math.abs(x)) / (aspect * halfWidth),
    );
    // The shifted screen centre changes perspective depth at every corner.
    // Solve each side's inequality rather than fitting then merely panning:
    // panning alone would clip the near corners of a deep assembly.
    distance = Math.max(
      distance,
      z + Math.abs(x / (tan * aspect) + centerX * z) / halfWidth,
      z + Math.abs(y / tan + centerY * z) / halfHeight,
    );
  }
  if (orthographic)
    distance = Math.max(distance, perspectiveDistance(height, fov));
  const span = orthographic ? height : visibleHeight(distance, fov);
  target
    .addScaledVector(right, (-centerX * span * aspect) / 2)
    .addScaledVector(up, (-centerY * span) / 2);
  return {
    target,
    position: target.clone().addScaledVector(back, distance),
    height,
  };
}

/* Screen-axis turns keep +Y as the camera's up vector: the orbit can approach
   either pole but never acquire roll. Crossing a pole reflects the yaw, which
   also makes a 90-degree step from Top reach the adjacent side. */
export function rotateDirection(direction, horizontal, vertical) {
  const d = direction.clone().normalize();
  const right = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), d)
    .normalize();
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(d, right).normalize();
  d.applyAxisAngle(right, THREE.MathUtils.degToRad(-vertical));
  d.applyAxisAngle(up, THREE.MathUtils.degToRad(horizontal));
  if (Math.abs(d.y) > 1 - 1e-9) {
    d.z = 1e-4;
    d.normalize();
  }
  return d;
}
