import { Matrix4 } from "three";

// File Y-up -> CAD Z-up: (x,y,z) -> (x,-z,y), R_x(+pi/2).
// CAD -> three.js preview: (x,y,z) -> (x,z,-y), R_x(-pi/2).
// Composition for up:y is identity. Only root is turned, never mark geometry.
export const previewRotation = (up = "z") => (up === "y" ? 0 : -Math.PI / 2);
export const canonicalBounds = (bounds, up = "z") =>
  bounds
    .clone()
    .applyMatrix4(new Matrix4().makeRotationX(up === "y" ? Math.PI / 2 : 0));
export const sectionMatrix = (rootMatrix, up = "z") =>
  rootMatrix
    .clone()
    .multiply(new Matrix4().makeRotationX(up === "y" ? -Math.PI / 2 : 0));
