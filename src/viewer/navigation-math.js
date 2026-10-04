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
) {
  const target = box.getCenter(new THREE.Vector3());
  const back = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(
    new THREE.Vector3(0, 1, 0),
    back,
  );
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  let distance = 0,
    height = 0;
  for (const corner of boxCorners(box)) {
    const p = corner.sub(target);
    const half =
      Math.max(Math.abs(p.dot(up)), Math.abs(p.dot(right)) / aspect) * 1.08;
    height = Math.max(height, half * 2);
    distance = Math.max(distance, half / tan + p.dot(back));
  }
  if (orthographic)
    distance = Math.max(distance, perspectiveDistance(height, fov));
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
  d.applyAxisAngle(right, THREE.MathUtils.degToRad(-vertical));
  d.applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(horizontal),
  );
  if (Math.abs(d.y) > 1 - 1e-9) {
    d.z = 1e-4;
    d.normalize();
  }
  return d;
}
