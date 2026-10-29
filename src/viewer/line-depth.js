import * as THREE from "three";

// One window-depth quantum, not a visual clip-space lift. The old 1e-6
// NDC offset was ~8.4 quanta in a 24-bit buffer and could pull internal
// edges through millimetres of shell. Apply only a rounding tolerance
// in clip space using the actual buffer precision, rather than an arbitrary
// visual lift. The factor of two converts window depth to OpenGL NDC.
// Both native and screen-width lines use this rule, in either projection.
// No source/picking geometry is changed; the complementary raster-only
// model-surface separation is below.
export function lineDepthQuantum(bits) {
  return 1 / (2 ** bits - 1);
}

export function biasSurfaceLine(material) {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.depthTest = true;
  material.depthWrite = false;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    const gl = renderer.getContext();
    shader.uniforms.surfaceLineDepthQuantum = {
      value: lineDepthQuantum(gl.getParameter(gl.DEPTH_BITS)),
    };
    shader.vertexShader =
      "uniform float surfaceLineDepthQuantum;\n" +
      shader.vertexShader.replace(
        "#include <logdepthbuf_vertex>",
        "gl_Position.z -= 2.0 * surfaceLineDepthQuantum * gl_Position.w;\n#include <logdepthbuf_vertex>",
      );
  };
  material.customProgramCacheKey = () => `${key}:surface-line-depth-v1`;
  return material;
}

// An unnecessarily tiny near plane makes even one rounding interval wider
// than a thin wall when zoomed out. Improve it only in empty camera space:
// every visible model bounding sphere stays at least twice as far away.
// Near/inside the assembly, retain the old close-inspection near plane.
// Geometry, picking and measurement coordinates are untouched.
const sphere = new THREE.Sphere();
const forward = new THREE.Vector3();
export function surfaceLineNear(camera, meshes, fallback, preferred) {
  camera.getWorldDirection(forward);
  let nearest = Infinity;
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const depth =
      sphere.center.sub(camera.position).dot(forward) - sphere.radius;
    nearest = Math.min(nearest, depth);
  }
  return Number.isFinite(nearest) && nearest > 0
    ? Math.max(fallback, Math.min(preferred, nearest * 0.5))
    : fallback;
}

// Native GL lines do not implement polygonOffset. Bias only the rendered
// model surfaces by one raster slope/quantum so both native and wide lines
// stay continuous on sloping faces. This is depth-buffer separation, not a
// position change: raycasting, measuring and mark anchors retain the source.
export function biasLineSurface(material) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = 1;
  material.polygonOffsetUnits = 1;
  return material;
}
