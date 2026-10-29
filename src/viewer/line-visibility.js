import * as THREE from "three";
import { localFaces } from "./edges.js";

/* Which surface is in front at each pixel, by face identity rather than depth.

   A display edge lies on the boundary between its own faces, so its depth is
   the depth of those faces there; a wall in front of it can be any distance
   away, down to a few hundredths of a millimetre on a badly drawn fillet. No
   depth tolerance separates the two cases: one small enough to hide the edge
   breaks genuine lines on sloping and curved faces, one large enough to keep
   them shows the edge. So a separate pass draws the opaque model into an
   offscreen target, one 24-bit identity per face, and a line fragment is kept
   only where one of its own faces is the front surface at or next to its pixel.

   Identities: 0 is background, FACE_CAP is a section cap, and each mesh owns
   the block [first, first + capacity), first = 1 + the capacities of the meshes
   before it. Capacity is the mesh's source triangle count, an upper bound on
   its faces, so blocks are known before any edge is built and never overlap.
   A face is a B-rep face where the file has them, numbered densely over the
   faces that have triangles (`localFaces`: the file's own numbers also count
   faces it could not mesh, and could pass the capacity), otherwise the smooth
   patch bounded by the same crease edges the display draws (edges.js), named
   by one of its triangles. `setFaces` refuses a table with any number outside
   the block; a mesh whose block would pass FACE_CAP is drawn as an occluder
   that owns no line. Each mesh's local face numbers ride on its own review
   geometry as one more vertex attribute, and the pass draws that same geometry
   object: no texture or geometry per model is added, and the target below is
   allocated with the canvas, not per model.

   The pass uses the main camera's x/y projection exactly, so its pixels are the
   drawing buffer's pixels, with a depth range fitted to the visible model. With
   24-bit depth that resolves surfaces about 1e-4 mm apart at 500 mm, which is
   what decides which face is in front; the line test never compares a line with
   a different face's depth. No multisampling: identities must not blend. A
   surface the colour pass cuts away by alpha test is cut away here too, so a
   line behind the hole stays visible.
   Picking, measuring and marks use source geometry and are not involved. */

export const FACE_CAP = 0xffffff;
// Modes, per line: every fragment visible (wireframe); own faces, from the
// line's `lineFaces` attribute; a close depth test where the line's faces are
// not known (`LINE_NEAR`, below); and a plain depth test for lines of a mesh
// that does not occlude in this pass (ghosted or depth-less material).
export const LINE_ALL = 0,
  LINE_FACES = 1,
  LINE_NEAR = 2,
  LINE_DEPTH = 3;

const ID_VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <clipping_planes_pars_vertex>
attribute vec4 faceIdentity;
uniform float faceOffset;
uniform float faceScale;
flat varying vec3 vFace;
void main() {
  #include <uv_vertex>
  #include <color_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  uvec3 c = uvec3(round(faceIdentity.rgb * 255.0 * faceScale));
  uint id = uint(faceOffset) + ((c.r << 16) | (c.g << 8) | c.b);
  vFace = vec3(float((id >> 16) & 255u), float((id >> 8) & 255u), float(id & 255u)) / 255.0;
}`;

// Alpha keeps this face's depth slope (window depth per pixel, log-encoded and
// rounded up) for the line test's self-occlusion guard below. The colour
// pass's alpha test is repeated with the same inputs (opacity, map and its
// transform, vertex alpha, alpha map); three defines the chunks from the
// material's own map, alphaMap, alphaTest and vertexColors, set in syncMeshes.
const ID_FRAGMENT = /* glsl */ `
uniform float opacity;
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <clipping_planes_pars_fragment>
flat varying vec3 vFace;
void main() {
  float slope = fwidth(gl_FragCoord.z);
  #include <clipping_planes_fragment>
  vec4 diffuseColor = vec4(1.0, 1.0, 1.0, opacity);
  #include <map_fragment>
  #include <color_fragment>
  #include <alphamap_fragment>
  #include <alphatest_fragment>
  float code = slope > 0.0 ? clamp(ceil((log2(slope) + 32.0) * 8.0), 1.0, 255.0) : 0.0;
  gl_FragColor = vec4(vFace, code / 255.0);
}`;

function idMaterial(shared, options = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      opacity: { value: 1 },
      alphaTest: { value: 0 },
      map: { value: null },
      mapTransform: { value: new THREE.Matrix3() },
      alphaMap: { value: null },
      alphaMapTransform: { value: new THREE.Matrix3() },
    },
    vertexShader: ID_VERTEX,
    fragmentShader: ID_FRAGMENT,
    clipping: true,
    blending: THREE.NoBlending,
    ...options,
  });
  // A mesh whose faces are not known yet (edges still building, section caps)
  // reads face 0 of its block, never a stale generic attribute value.
  material.defaultAttributeValues = { faceIdentity: [0, 0, 0, 0] };
  return material;
}

/* The colour pass discards a fragment whose alpha is below the material's
   alphaTest, and writes no depth there; so must this pass, or a cut-out
   surface would hide the lines behind its holes. Only discarding matters
   here: without an alpha test (or alpha hash, taken at its mean threshold) a
   surface that writes depth hides lines whatever its alpha, in both passes. */
const transformOf = (texture, uniform) => {
  if (!texture) return;
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  uniform.value.copy(texture.matrix);
};
export function cutLike(material, source, geometry) {
  const threshold =
    source?.alphaTest > 0 ? source.alphaTest : source?.alphaHash ? 0.5 : 0;
  const cut = threshold > 0;
  const map = (cut && source.map) || null,
    alphaMap = (cut && source.alphaMap) || null;
  const vertexAlpha =
    cut && !!source.vertexColors && geometry.attributes.color?.itemSize === 4;
  const key = cut
    ? `${map ? map.channel : "-"}:${alphaMap ? alphaMap.channel : "-"}:${vertexAlpha}`
    : "";
  material.map = map;
  material.alphaMap = alphaMap;
  material.vertexColors = vertexAlpha;
  material.alphaTest = threshold;
  if (material.userData.cut !== key) {
    material.userData.cut = key;
    material.needsUpdate = true;
  }
  const u = material.uniforms;
  u.alphaTest.value = threshold;
  u.opacity.value = source?.opacity ?? 1;
  u.map.value = map;
  u.alphaMap.value = alphaMap;
  transformOf(map, u.mapTransform);
  transformOf(alphaMap, u.alphaMapTransform);
  return material;
}

/* The line side. A line knows its own faces: two per segment, from its
   `lineFaces` attribute (one face twice on a border), local to its mesh.

   - Where the surface at the line's own pixel is behind the line, or there is
     none, the pixel centre is outside anything that could hide it. The line
     itself may still be up to half a pixel inside a silhouette that misses
     that centre: the rear edge of a 0.015 mm wall lies just inside the wall's
     outline. So the four pixel centres around the line's exact point are read,
     and the line is drawn unless surfaces that would hide it (by the tests
     below) cover at least half of that point, interpolated bilinearly. This
     keeps silhouette edges whose visible face is thinner than a pixel, more
     than half a pixel outside whatever is behind them, and hides an edge more
     than half a pixel inside an occluder's outline.
   - Otherwise the front surface is level with the line or in front of it, and
     depth cannot say which: the line is drawn only if one of its own faces is
     in front in the 3x3 neighbourhood. Its own pixel may land on either face,
     on a third face at a corner, or past a silhouette; a native line is within
     half a pixel of the true edge and both of its faces touch the edge, so one
     of them covers a pixel in that window unless both are under a pixel wide.
   - The window cannot expose a hidden edge behind a wall: the wall covers the
     whole window, and none of its pixels are the edge's faces, however close it
     is. It can extend a line by at most a pixel under the silhouette of an
     occluder at the edge's own depth; where the occluder at the line's own pixel
     is in front by more than the slope allowance the fragment is dropped.
   - An own face can also hide its own edge (the far rim of a hole behind the
     hole's wall). A matching pixel counts only if the line is not behind it by
     more than three of that face's depth slopes plus the line's own slope, the
     most one plane can differ across the window, and four depth quanta of
     rounding. That is a slope allowance, not a wall thickness: it never applies
     to a different face, including another face of the same part.
   - A segment whose faces are not known (-1: a mark on a mesh whose crease
     patches are still being built, or a mark that no longer lies on two faces)
     and every line of a mesh outside the identity range use LINE_NEAR: the
     front surface at the line's own pixel may be ahead of it by one depth slope
     of each, the most a pixel centre half a pixel off the line can differ, and
     no more. That is a depth test, so it cannot tell an edge from a wall
     closer than that slope; it is never applied where the faces are known. */
const LINE_PARS = /* glsl */ `
uniform sampler2D lineFaceIds;
uniform sampler2D lineFaceDepth;
uniform vec4 lineFaceView;
uniform float lineFaceOrtho;
uniform vec4 lineFaceOwn;
flat varying vec2 vLineFaces;
flat varying float vLineFacing;
varying float vLineViewZ;
varying vec3 vLineCentre;
float lineFaceWindowDepth(float z) {
  float clipZ = lineFaceView.z * z + lineFaceView.w;
  return (lineFaceOrtho > 0.5 ? clipZ : clipZ / -z) * 0.5 + 0.5;
}
uint lineFaceAt(ivec2 p, out float depth, out float slope) {
  uvec4 c = uvec4(round(texelFetch(lineFaceIds, p, 0) * 255.0));
  depth = texelFetch(lineFaceDepth, p, 0).r;
  slope = c.a == 0u ? 0.0 : c.a == 255u ? 1.0 : exp2(float(c.a) / 8.0 - 32.0);
  return (c.r << 16) | (c.g << 8) | c.b;
}
bool lineFaceOwns(uint id) {
  uint first = uint(lineFaceOwn.y);
  return id == first + uint(vLineFaces.x) || id == first + uint(vLineFaces.y);
}
const float lineFaceRounding = 4.0 / 16777215.0;
// Whether a surface sampled next to the line would hide it, by the same rule
// the line's mode applies at its own pixel.
bool lineFaceHides(uint id, float front, float slope, float depth, float lineSlope) {
  if (id == 0u) return false;
  float allowance = 3.0 * (slope + lineSlope) + lineFaceRounding;
  if (lineFaceOwn.x > 2.5) return depth > front + allowance;
  if (lineFaceOwn.x > 1.5 || vLineFaces.x < 0.0)
    return depth > front + slope + lineSlope + lineFaceRounding;
  if (lineFaceOwns(id)) return depth > front + allowance;
  return front <= depth + allowance;
}
bool lineFaceVisible(vec2 pixel, vec2 exact, float depth, float lineSlope) {
  if (lineFaceOwn.x < 0.5) return true;
  if (lineFaceOwn.z > 0.5 && vLineFacing < 0.5) return false;
  ivec2 last = ivec2(lineFaceView.xy) - 1;
  ivec2 centre = clamp(ivec2(floor(pixel)), ivec2(0), last);
  const float rounding = lineFaceRounding;
  float front, slope;
  uint id = lineFaceAt(centre, front, slope);
  float allowance = 3.0 * (slope + lineSlope) + rounding;
  // Nothing in front of the line at its own pixel: background, or a surface
  // behind it. Drawn unless the line's exact point is inside an occluder's
  // outline that passes between it and this pixel's centre.
  if (id == 0u || front > depth + allowance) {
    vec2 corner = exact - 0.5;
    ivec2 base = ivec2(floor(corner));
    vec2 t = corner - floor(corner);
    float covered = 0.0;
    for (int k = 0; k < 4; k++) {
      ivec2 o = ivec2(k & 1, k >> 1);
      uint beside = lineFaceAt(clamp(base + o, ivec2(0), last), front, slope);
      if (lineFaceHides(beside, front, slope, depth, lineSlope))
        covered += (o.x == 1 ? t.x : 1.0 - t.x) * (o.y == 1 ? t.y : 1.0 - t.y);
    }
    return covered < 0.5;
  }
  if (lineFaceOwn.x > 2.5) return depth <= front + allowance;
  if (lineFaceOwn.x > 1.5 || vLineFaces.x < 0.0)
    return depth <= front + slope + lineSlope + rounding;
  if (depth > front + allowance && !lineFaceOwns(id)) return false;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      id = lineFaceAt(clamp(centre + ivec2(dx, dy), ivec2(0), last), front, slope);
      if (lineFaceOwns(id) && depth <= front + 3.0 * (slope + lineSlope) + rounding)
        return true;
    }
  return false;
}
`;

/* A mark's segment turned away on both sides is on the far side of its own
   solid, whatever is in front of it: a solid drawn front faces only shows
   none of its faces there. That holds at any distance from a silhouette,
   where the pixel tests above can be half a pixel out. Mark segments carry
   the normals of the triangles either side (zero where unknown or on an open
   border, which then counts as facing); display edges carry none. Used only
   where the line's mesh occludes and draws front faces only (lineFaceOwn.z). */
const LINE_FACING = /* glsl */ `
attribute vec3 lineNormalA;
attribute vec3 lineNormalB;
flat varying float vLineFacing;
float lineFaceTowards(vec3 normal, vec3 at) {
  if (dot(normal, normal) < 0.25) return 1.0;
  vec3 eye = isOrthographic ? vec3(0.0, 0.0, 1.0) : -at;
  return dot(normalMatrix * normal, eye) > 0.0 ? 1.0 : 0.0;
}
float lineFaceFacing(vec3 at) {
  return max(lineFaceTowards(lineNormalA, at), lineFaceTowards(lineNormalB, at));
}
`;

// The line's exact point: its clip position, interpolated along the line.
const LINE_POINT = /* glsl */ `
vec2 lineFacePixel = (vLineCentre.xy / vLineCentre.z * 0.5 + 0.5) * lineFaceView.xy;`;

const NATIVE_TEST = /* glsl */ `
float lineFaceDepthHere = lineFaceWindowDepth(vLineViewZ);${LINE_POINT}
bool lineFaceShown = lineFaceVisible(gl_FragCoord.xy, lineFacePixel, lineFaceDepthHere, fwidth(lineFaceDepthHere));
#include <clipping_planes_fragment>
if (!lineFaceShown) discard;`;

// A wide line's quad reaches pixels away from the edge; test at its centre line.
const WIDE_TEST = /* glsl */ `
float lineFaceDepthHere = lineFaceWindowDepth(vLineViewZ);${LINE_POINT}
bool lineFaceShown = lineFaceVisible(lineFacePixel, lineFacePixel, lineFaceDepthHere, fwidth(lineFaceDepthHere));
#include <clipping_planes_fragment>
if (!lineFaceShown) discard;`;

const WIDE_VERTEX_AT =
  "vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation";

/* Patches a LineBasicMaterial or LineMaterial to the face test. The line no
   longer depth-tests in the colour pass: that test is what needed a surface
   polygon offset and a line lift, and either one let close rear edges through.
   Uniforms shared with the pass are live objects. */
export function faceTestedLine(material, visibility) {
  const own = { value: new THREE.Vector4(LINE_ALL, 0, 0, 0) };
  const wide = !!material.isLineMaterial;
  material.userData.lineFaceOwn = own;
  material.depthTest = false;
  material.depthWrite = false;
  if (material.isShaderMaterial)
    material.defaultAttributeValues = {
      ...material.defaultAttributeValues,
      lineFaces: [-1, -1],
      lineNormalA: [0, 0, 0],
      lineNormalB: [0, 0, 0],
    };
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms, visibility.uniforms, { lineFaceOwn: own });
    const define = wide ? "#define LINE_FACE_WIDE\n" : "";
    const varyings =
      "attribute vec2 lineFaces;\nflat varying vec2 vLineFaces;\nvarying float vLineViewZ;\nvarying vec3 vLineCentre;\n" +
      LINE_FACING;
    shader.vertexShader =
      define +
      varyings +
      (wide
        ? shader.vertexShader.replace(
            WIDE_VERTEX_AT,
            `${WIDE_VERTEX_AT}\nvLineViewZ = mvPosition.z;\nvLineFaces = lineFaces;\nvLineFacing = lineFaceFacing(start.xyz);\nvec4 lineFaceClip = projectionMatrix * mvPosition;\nvLineCentre = vec3(lineFaceClip.xy, lineFaceClip.w);`,
          )
        : shader.vertexShader.replace(
            "#include <clipping_planes_vertex>",
            "#include <clipping_planes_vertex>\nvLineViewZ = mvPosition.z;\nvLineFaces = lineFaces;\nvLineFacing = lineFaceFacing(mvPosition.xyz);\nvLineCentre = vec3(gl_Position.xy, gl_Position.w);",
          ));
    shader.fragmentShader =
      define +
      LINE_PARS +
      shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        wide ? WIDE_TEST : NATIVE_TEST,
      );
  };
  material.customProgramCacheKey = () => `${key}:line-faces-v2`;
  return material;
}

// Local face numbers of an unindexed geometry's triangles, as a 24-bit value
// on each of their three vertices (normalised bytes; the fourth is unused).
export function faceIdentity(faces) {
  const data = new Uint8Array(faces.length * 12);
  for (let t = 0; t < faces.length; t++) {
    const face = faces[t];
    for (let v = t * 12; v < t * 12 + 12; v += 4) {
      data[v] = (face >> 16) & 255;
      data[v + 1] = (face >> 8) & 255;
      data[v + 2] = face & 255;
    }
  }
  return new THREE.BufferAttribute(data, 4, true);
}

// Replace only the depth rows of the camera's projection: identical pixels,
// a depth range fitted to what is drawn.
export function fittedDepth(projection, orthographic, near, far) {
  const e = projection.elements;
  if (orthographic) {
    e[10] = -2 / (far - near);
    e[14] = -(far + near) / (far - near);
  } else {
    e[10] = -(far + near) / (far - near);
    e[14] = (-2 * far * near) / (far - near);
  }
  return projection;
}

const triangleCount = (geometry) =>
  (geometry.index?.count ?? geometry.attributes.position.count) / 3;
const capacityOf = (mesh) =>
  Math.max(
    1,
    mesh.userData.fillTopology?.vertices.length ?? triangleCount(mesh.geometry),
  );

/* Marks know their segments' faces from the geometry they lie on. The source
   triangles each segment of an edge mark touches at its midpoint, `stride` to
   a segment, -1 for none, -2 when more touch than fit. A mark's points are
   tessellation vertices along an edge and review subdivision only splits
   triangles in their own plane, so a midpoint lies on the triangles either
   side of the edge (more where a vertex falls there) and on no others, unless
   another surface passes within `tolerance` of it, a few millionths of the
   model's size. The faces are looked up when known (`remap`): a mark is often
   drawn before a mesh's crease patches are built. */
const near = new THREE.Vector3(),
  middle = new THREE.Vector3(),
  normal = new THREE.Vector3(),
  first = new THREE.Vector3(),
  scratch = new THREE.Triangle();
export function segmentSources(geometry, points, stride = 8) {
  const segments = Math.max(0, points.length - 1);
  const out = new Int32Array(segments * stride).fill(-1);
  // The first touching triangle's normal, and the one turned furthest from
  // it (the other side of the edge); one side only on an open border.
  const normals = new Float32Array(segments * 6);
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere;
  const tolerance = 2e-6 * (bounds.radius + bounds.center.length());
  const sourceFaces = geometry.userData.sourceFaces;
  const position = geometry.attributes.position,
    index = geometry.index;
  for (let s = 0; s < segments; s++) {
    middle.addVectors(points[s], points[s + 1]).multiplyScalar(0.5);
    let found = 0,
      turn = 0.999;
    const touch = (triangle, t) => {
      triangle.closestPointToPoint(middle, near);
      if (near.distanceTo(middle) > tolerance) return;
      triangle.getNormal(normal);
      if (!found) normal.toArray(normals, s * 6);
      else {
        const dot = normal.dot(first.fromArray(normals, s * 6));
        if (dot < turn) {
          turn = dot;
          normal.toArray(normals, s * 6 + 3);
        }
      }
      const source = sourceFaces ? sourceFaces[t] : t;
      for (let k = 0; k < Math.min(found, stride); k++)
        if (out[s * stride + k] === source) return;
      if (found < stride) out[s * stride + found] = source;
      else out[s * stride] = -2;
      found++;
    };
    if (geometry.boundsTree)
      geometry.boundsTree.shapecast({
        intersectsBounds: (box) => box.distanceToPoint(middle) <= tolerance,
        intersectsTriangle: (triangle, t) => void touch(triangle, t),
      });
    else
      for (let t = 0; t < triangleCount(geometry); t++) {
        const at = (k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
        scratch.a.fromBufferAttribute(position, at(0));
        scratch.b.fromBufferAttribute(position, at(1));
        scratch.c.fromBufferAttribute(position, at(2));
        touch(scratch, t);
      }
  }
  return { sources: out, stride, normals };
}

/* THREE.EdgesGeometry, segment for segment (same welding, threshold and
   order: it is what whole-part outlines have always drawn), also keeping the
   source triangle on each side of every segment, -1 on an open side. */
export function outlineEdges(geometry, thresholdAngle) {
  const precision = 1e4;
  const thresholdDot = Math.cos(THREE.MathUtils.DEG2RAD * thresholdAngle);
  const index = geometry.getIndex(),
    position = geometry.getAttribute("position");
  const count = index ? index.count : position.count;
  const sourceFaces = geometry.userData.sourceFaces;
  const sourceOf = (t) => (sourceFaces ? sourceFaces[t] : t);
  const corner = [0, 0, 0],
    hashes = new Array(3),
    edges = new Map(),
    vertices = [],
    sides = [],
    normals = [];
  const triangle = new THREE.Triangle(),
    normal = new THREE.Vector3(),
    v0 = new THREE.Vector3(),
    v1 = new THREE.Vector3();
  const points = [triangle.a, triangle.b, triangle.c];
  const hash = (v) =>
    `${Math.round(v.x * precision)},${Math.round(v.y * precision)},${Math.round(v.z * precision)}`;
  for (let i = 0; i < count; i += 3) {
    for (let k = 0; k < 3; k++) {
      corner[k] = index ? index.getX(i + k) : i + k;
      points[k].fromBufferAttribute(position, corner[k]);
      hashes[k] = hash(points[k]);
    }
    triangle.getNormal(normal);
    if (
      hashes[0] === hashes[1] ||
      hashes[1] === hashes[2] ||
      hashes[2] === hashes[0]
    )
      continue;
    for (let j = 0; j < 3; j++) {
      const next = (j + 1) % 3;
      const key = `${hashes[j]}_${hashes[next]}`,
        reverse = `${hashes[next]}_${hashes[j]}`;
      const sibling = edges.get(reverse);
      if (sibling) {
        if (normal.dot(sibling.normal) <= thresholdDot) {
          vertices.push(...points[j].toArray(), ...points[next].toArray());
          sides.push(sourceOf(i / 3), sibling.source);
          normals.push(...normal.toArray(), ...sibling.normal.toArray());
        }
        edges.set(reverse, null);
      } else if (!edges.has(key))
        edges.set(key, {
          index0: corner[j],
          index1: corner[next],
          normal: normal.clone(),
          source: sourceOf(i / 3),
        });
    }
  }
  // EdgesGeometry walks a plain object's keys: insertion order, as here.
  for (const edge of edges.values())
    if (edge) {
      v0.fromBufferAttribute(position, edge.index0);
      v1.fromBufferAttribute(position, edge.index1);
      vertices.push(...v0.toArray(), ...v1.toArray());
      sides.push(edge.source, -1);
      normals.push(...edge.normal.toArray(), 0, 0, 0);
    }
  return {
    geometry: new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    ),
    sources: {
      sources: Int32Array.from(sides),
      stride: 2,
      normals: Float32Array.from(normals),
    },
  };
}

const sphere = new THREE.Sphere();
const forward = new THREE.Vector3();
const eye = new THREE.Vector3();
const size = new THREE.Vector2();
const clear = new THREE.Color();

export class LineVisibility {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      samples: 0,
    });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.target.depthTexture.format = THREE.DepthStencilFormat;
    this.target.depthTexture.type = THREE.UnsignedInt248Type;
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = this.camera.matrixWorldAutoUpdate = false;
    this.proxies = new Map();
    this.caps = new Map();
    this.lines = new Set();
    this.uniforms = {
      lineFaceIds: { value: this.target.texture },
      lineFaceDepth: { value: this.target.depthTexture },
      lineFaceView: { value: new THREE.Vector4(1, 1, -1, 0) },
      lineFaceOrtho: { value: 0 },
    };
    this.capMaterial = idMaterial(
      { faceOffset: { value: FACE_CAP }, faceScale: { value: 0 } },
      {
        side: THREE.DoubleSide,
        clipping: false,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp,
      },
    );
    this.renders = 0;
  }
  /* Allocated with the canvas, before any model loads, at least as large as
     the window in drawing-buffer pixels, and only ever grown: panels opening
     or closing between models resize the canvas, and the pass then draws into
     a corner of the same two textures instead of recreating them. */
  resize(renderer, width = 0, height = 0) {
    renderer.getDrawingBufferSize(size);
    const ratio = renderer.getPixelRatio?.() || 1;
    const w = Math.max(
      this.target.width,
      size.x,
      width,
      Math.ceil((globalThis.innerWidth || 0) * ratio),
    );
    const h = Math.max(
      this.target.height,
      size.y,
      height,
      Math.ceil((globalThis.innerHeight || 0) * ratio),
    );
    if (w !== this.target.width || h !== this.target.height)
      this.target.setSize(w, h);
    renderer.initRenderTarget?.(this.target);
  }
  /* A line object to face-test. Its material must have gone through
     faceTestedLine. A display edge comes with its `lineFaces` attribute; a
     mark comes with the source triangles beside each segment (`sources`, from
     segmentSources or outlineEdges), and its attribute is written here and
     again whenever its mesh's faces change. */
  track(line, mesh, sources = null) {
    line.userData.lineFace = { mesh, sources, enabled: true };
    this.lines.add(line);
    if (sources) {
      this.facesOf(mesh);
      this.remap(line);
      const geometry = line.geometry;
      const wide = !!geometry.isInstancedBufferGeometry;
      const segments = sources.normals.length / 6;
      for (const [name, at] of [
        ["lineNormalA", 0],
        ["lineNormalB", 3],
      ]) {
        const array = new Float32Array(segments * (wide ? 3 : 6));
        for (let s = 0; s < segments; s++)
          for (let v = 0; v < (wide ? 1 : 2); v++)
            array.set(
              sources.normals.subarray(s * 6 + at, s * 6 + at + 3),
              (s * (wide ? 1 : 2) + v) * 3,
            );
        geometry.setAttribute(
          name,
          wide
            ? new THREE.InstancedBufferAttribute(array, 3)
            : new THREE.BufferAttribute(array, 3),
        );
      }
    }
    const before = line.onBeforeRender;
    line.onBeforeRender = function (...args) {
      before.apply(this, args);
      line.userData.lineFace.visibility?.prepare(line);
    };
    line.userData.lineFace.visibility = this;
    return line;
  }
  /* Each segment's faces: the distinct faces of its source triangles. One is
     a border; more than two, or none, or faces not known yet, is -1 (unknown),
     which the line test answers with LINE_NEAR. */
  remap(line) {
    const { mesh, sources: from } = line.userData.lineFace;
    if (!from) return;
    const { sources, stride } = from;
    const table = this.proxies.get(mesh)?.userData.table;
    const geometry = line.geometry;
    const wide = !!geometry.isInstancedBufferGeometry;
    const segments = sources.length / stride,
      per = wide ? 2 : 4;
    let attribute = geometry.getAttribute("lineFaces");
    if (attribute?.array.length !== segments * per) {
      const array = new Float32Array(segments * per);
      attribute = wide
        ? new THREE.InstancedBufferAttribute(array, 2)
        : new THREE.BufferAttribute(array, 2);
      geometry.setAttribute("lineFaces", attribute);
    }
    const out = attribute.array;
    for (let s = 0; s < segments; s++) {
      let a = -1,
        b = -1,
        known = !!table;
      for (let k = 0; known && k < stride; k++) {
        const source = sources[s * stride + k];
        if (source === -1) continue;
        const face = source < 0 ? undefined : table[source];
        if (face === undefined) known = false;
        else if (a < 0 || face === a) a = face;
        else if (b < 0 || face === b) b = face;
        else known = false;
      }
      if (!known || a < 0) a = b = -1;
      else if (b < 0) b = a;
      out.set(wide ? [a, b] : [a, b, a, b], s * per);
    }
    attribute.needsUpdate = true;
  }
  prepare(line) {
    const { mesh, sources, enabled } = line.userData.lineFace;
    const own = line.material.userData.lineFaceOwn?.value;
    if (!own) return;
    const data = this.proxies.get(mesh)?.userData;
    if (!enabled) own.set(LINE_ALL, 0, 0, 0);
    else if (!data?.occluder) own.set(LINE_DEPTH, 0, 0, 0);
    else {
      // Only marks carry the normals the facing test reads.
      const facing = sources && data.frontOnly ? 1 : 0;
      if (data.overflow || !data.table) own.set(LINE_NEAR, 0, facing, 0);
      else own.set(LINE_FACES, data.first, facing, 0);
    }
    // Object-mark materials are shared between meshes; refresh per draw.
    if (line.material.isShaderMaterial) line.material.uniformsNeedUpdate = true;
  }
  needed() {
    let needed = false;
    for (const line of this.lines) {
      let node = line,
        shown = line.userData.lineFace.enabled && line.material.visible;
      for (; node.parent; node = node.parent) shown &&= node.visible;
      if (!node.isScene) this.lines.delete(line);
      else if (shown && node.visible) needed = true;
    }
    return needed;
  }
  proxyOf(mesh) {
    let proxy = this.proxies.get(mesh);
    if (proxy?.userData.source === mesh.geometry) return proxy;
    if (proxy) this.release(mesh);
    const source = mesh.geometry;
    // The pass draws the mesh's own geometry object. Review geometry is always
    // unindexed, so a per-vertex face is a per-triangle face; only an indexed
    // mesh (never produced by loading) gets an unindexed copy of its positions.
    let geometry = source;
    if (source.index) {
      geometry = new THREE.BufferGeometry();
      const index = source.index;
      // Positions, and what an alpha test reads: texture coordinates, colour.
      for (const [name, from] of Object.entries(source.attributes)) {
        if (!/^(position|uv\d?|color)$/.test(name)) continue;
        const array = new Float32Array(index.count * from.itemSize);
        for (let i = 0; i < index.count; i++)
          for (let k = 0; k < from.itemSize; k++)
            array[i * from.itemSize + k] = from.getComponent(index.getX(i), k);
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(array, from.itemSize),
        );
      }
      for (const group of source.groups)
        geometry.addGroup(group.start, group.count, group.materialIndex);
      if (!source.boundingSphere) source.computeBoundingSphere();
      geometry.boundingSphere = source.boundingSphere;
    }
    proxy = new THREE.Mesh(geometry, []);
    proxy.matrixAutoUpdate = false;
    proxy.userData = {
      source,
      uniforms: { faceOffset: { value: 1 }, faceScale: { value: 1 } },
      materials: [],
      owned: geometry !== source,
      table: null,
    };
    this.proxies.set(mesh, proxy);
    this.scene.add(proxy);
    return proxy;
  }
  /* `table[s]` is the local face of the mesh's source triangle s: the
     B-rep face (localFaces) or the crease patch. Refused, leaving the mesh's
     faces unknown, unless every number fits the mesh's block. The drawn
     triangles' faces are kept on the drawn geometry itself, so they live and
     are freed with the model; marks on the mesh are mapped again. */
  setFaces(mesh, table) {
    const proxy = this.proxyOf(mesh);
    const data = proxy.userData;
    if (data.table === table) return true;
    const capacity = capacityOf(mesh);
    if (!table || table.length < capacity) return false;
    for (let s = 0; s < capacity; s++)
      if (!(table[s] >= 0 && table[s] < capacity)) return false;
    const sourceFaces = mesh.geometry.userData.sourceFaces;
    const faces = new Uint32Array(triangleCount(mesh.geometry));
    for (let t = 0; t < faces.length; t++)
      faces[t] = table[sourceFaces ? sourceFaces[t] : t];
    proxy.geometry.setAttribute("faceIdentity", faceIdentity(faces));
    data.table = table;
    for (const line of this.lines)
      if (line.userData.lineFace.mesh === mesh) this.remap(line);
    return true;
  }
  // A STEP's faces are known as soon as it loads; crease patches arrive with
  // the display edges.
  facesOf(mesh) {
    const data = this.proxyOf(mesh).userData;
    if (!data.table) {
      const faces = localFaces(mesh.userData.fillTopology);
      if (faces) this.setFaces(mesh, faces);
    }
    return data.table;
  }
  release(mesh) {
    const proxy = this.proxies.get(mesh);
    if (!proxy) return;
    this.proxies.delete(mesh);
    proxy.removeFromParent();
    for (const material of proxy.userData.materials) material.dispose();
    // The mesh's own geometry belongs to the model and is freed with it.
    if (proxy.userData.owned) proxy.geometry.dispose();
  }
  releaseAll() {
    for (const mesh of [...this.proxies.keys()]) this.release(mesh);
    for (const proxy of this.caps.values()) proxy.removeFromParent();
    this.caps.clear();
  }
  syncMeshes(meshes) {
    let first = 1;
    const alive = new Set(meshes);
    for (const mesh of [...this.proxies.keys()])
      if (!alive.has(mesh)) this.release(mesh);
    for (const mesh of meshes) {
      const proxy = this.proxyOf(mesh);
      const data = proxy.userData;
      data.capacity = capacityOf(mesh);
      // The 600k triangle ceiling keeps every block below FACE_CAP; past it a
      // mesh still hides what is behind it but owns no identity.
      data.overflow = first + data.capacity > FACE_CAP;
      data.first = data.overflow ? FACE_CAP : first;
      if (!data.overflow) first += data.capacity;
      data.uniforms.faceOffset.value = data.first;
      data.uniforms.faceScale.value = data.overflow ? 0 : 1;
      if (!data.table) this.facesOf(mesh);
      const sources = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      while (data.materials.length < sources.length)
        data.materials.push(idMaterial(data.uniforms));
      // Occluders are exactly the surfaces that write depth in the colour
      // pass: ghosted parts, X-ray and wireframe surfaces do not.
      let occluder = false;
      data.frontOnly = true;
      sources.forEach((source, i) => {
        const material = data.materials[i];
        material.visible = !!source?.visible && !!source.depthWrite;
        occluder ||= material.visible;
        if (
          material.visible &&
          (source.side ?? THREE.FrontSide) !== THREE.FrontSide
        )
          data.frontOnly = false;
        material.side = source?.side ?? THREE.FrontSide;
        const planes = source?.clippingPlanes ?? null;
        if (material.clippingPlanes !== planes) {
          material.clippingPlanes = planes;
          material.needsUpdate = true;
        }
        cutLike(material, source, proxy.geometry);
      });
      proxy.material = Array.isArray(mesh.material)
        ? data.materials.slice(0, sources.length)
        : data.materials[0];
      let shown = true;
      for (let node = mesh; node; node = node.parent) shown &&= node.visible;
      proxy.visible = shown;
      data.occluder = shown && occluder;
      proxy.renderOrder = mesh.renderOrder;
      proxy.matrix.copy(mesh.matrixWorld);
      proxy.matrixWorld.copy(mesh.matrixWorld);
    }
  }
  // Section caps: replay the colour pass's stencil count, then cap with an
  // identity that owns no line, so lines inside a cut solid stay hidden.
  syncCaps(group) {
    const alive = new Set();
    let shown = !!group;
    for (let node = group; node; node = node.parent) shown &&= node.visible;
    if (shown)
      for (const source of group.children) {
        alive.add(source);
        let proxy = this.caps.get(source);
        if (!proxy) {
          const counter = source.material.colorWrite === false;
          proxy = new THREE.Mesh(
            source.geometry,
            counter ? source.material : this.capMaterial,
          );
          proxy.matrixAutoUpdate = false;
          if (!counter) proxy.onAfterRender = (r) => r.clearStencil();
          this.caps.set(source, proxy);
          this.scene.add(proxy);
        }
        proxy.visible = source.visible;
        proxy.renderOrder = source.renderOrder;
        proxy.matrix.copy(source.matrixWorld);
        proxy.matrixWorld.copy(source.matrixWorld);
      }
    for (const [source, proxy] of this.caps)
      if (!alive.has(source)) {
        proxy.removeFromParent();
        this.caps.delete(source);
      }
  }
  // Called before the colour pass of every frame. Does nothing unless a
  // face-tested line will be drawn; then one extra draw per visible mesh.
  render(renderer, camera, renderTarget, meshes, caps) {
    if (!this.needed()) return false;
    if (renderTarget) size.set(renderTarget.width, renderTarget.height);
    else renderer.getDrawingBufferSize(size);
    const width = size.x,
      height = size.y;
    if (width > this.target.width || height > this.target.height)
      this.resize(renderer, width, height);
    // Same pixel grid as the colour pass: the viewport starts at the origin.
    this.target.viewport.set(0, 0, width, height);
    size.set(width, height);
    this.syncMeshes(meshes);
    this.syncCaps(caps);
    // Depth range: the visible occluders' bounding spheres along the view.
    // Lines outside it still compare correctly; their depth is analytic.
    camera.getWorldDirection(forward);
    eye.setFromMatrixPosition(camera.matrixWorld);
    let nearest = Infinity,
      farthest = -Infinity;
    for (const proxy of this.proxies.values()) {
      if (!proxy.userData.occluder) continue;
      if (!proxy.geometry.boundingSphere)
        proxy.geometry.computeBoundingSphere();
      sphere
        .copy(proxy.geometry.boundingSphere)
        .applyMatrix4(proxy.matrixWorld);
      const depth = sphere.center.sub(eye).dot(forward);
      nearest = Math.min(nearest, depth - sphere.radius);
      farthest = Math.max(farthest, depth + sphere.radius);
    }
    let near = camera.near,
      far = camera.far;
    if (farthest > nearest) {
      const margin = (farthest - nearest) * 1e-3;
      near = Math.max(near, nearest - margin);
      far = Math.min(far, farthest + margin);
      if (!(far > near)) [near, far] = [camera.near, camera.far];
    }
    const view = this.camera;
    view.projectionMatrix.copy(camera.projectionMatrix);
    view.matrixWorld.copy(camera.matrixWorld);
    view.matrixWorldInverse.copy(camera.matrixWorldInverse);
    const orthographic = !!camera.isOrthographicCamera;
    fittedDepth(view.projectionMatrix, orthographic, near, far);
    view.projectionMatrixInverse.copy(view.projectionMatrix).invert();
    const e = view.projectionMatrix.elements;
    this.uniforms.lineFaceView.value.set(size.x, size.y, e[10], e[14]);
    this.uniforms.lineFaceOrtho.value = orthographic ? 1 : 0;
    const previous = renderer.getRenderTarget(),
      autoClear = renderer.autoClear,
      alpha = renderer.getClearAlpha();
    renderer.getClearColor(clear);
    try {
      renderer.setRenderTarget(this.target);
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.render(this.scene, view);
    } finally {
      renderer.setClearColor(clear, alpha);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
    this.renders++;
    return true;
  }
  dispose() {
    this.releaseAll();
    this.capMaterial.dispose();
    this.target.depthTexture.dispose();
    this.target.dispose();
  }
}
