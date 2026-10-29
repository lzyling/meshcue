import * as THREE from "three";

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
   its faces, so blocks are known before any edge is built and never overlap;
   the 600k triangle ceiling keeps every block below FACE_CAP. A face is a B-rep
   face where the file has them, otherwise the smooth patch bounded by the same
   crease edges the display draws (edges.js). Each mesh's local face numbers
   ride on its own review geometry as one more vertex attribute, and the pass
   draws that same geometry object: no texture or geometry per model is added,
   and the target below is allocated with the canvas, not per model.

   The pass uses the main camera's x/y projection exactly, so its pixels are the
   drawing buffer's pixels, with a depth range fitted to the visible model. With
   24-bit depth that resolves surfaces about 1e-4 mm apart at 500 mm, which is
   what decides which face is in front; the line test never compares a line with
   a different face's depth. No multisampling: identities must not blend.
   Picking, measuring and marks use source geometry and are not involved. */

export const FACE_CAP = 0xffffff;
// Modes, per line: every fragment visible (wireframe); own faces by attribute;
// any face of its own mesh (object marks); and a plain depth test for lines of
// a mesh that does not occlude in this pass (ghosted or depth-less material).
export const LINE_ALL = 0,
  LINE_FACES = 1,
  LINE_PART = 2,
  LINE_DEPTH = 3;

const ID_VERTEX = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
attribute vec4 faceIdentity;
uniform float faceOffset;
flat varying vec3 vFace;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  uvec3 c = uvec3(round(faceIdentity.rgb * 255.0));
  uint id = uint(faceOffset) + ((c.r << 16) | (c.g << 8) | c.b);
  vFace = vec3(float((id >> 16) & 255u), float((id >> 8) & 255u), float(id & 255u)) / 255.0;
}`;

// Alpha keeps this face's depth slope (window depth per pixel, log-encoded and
// rounded up) for the line test's self-occlusion guard below.
const ID_FRAGMENT = /* glsl */ `
#include <clipping_planes_pars_fragment>
flat varying vec3 vFace;
void main() {
  float slope = fwidth(gl_FragCoord.z);
  #include <clipping_planes_fragment>
  float code = slope > 0.0 ? clamp(ceil((log2(slope) + 32.0) * 8.0), 1.0, 255.0) : 0.0;
  gl_FragColor = vec4(vFace, code / 255.0);
}`;

function idMaterial(uniforms, options = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms,
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

/* The line side. `own` decides membership: two faces from the line's vertex
   attribute plus its mesh's first identity, or its mesh's whole block.

   - Where the surface at the line's own pixel is behind the line, or there is
     none, nothing hides the line there and it is drawn, as a depth test would.
     This keeps silhouette edges whose visible face is thinner than a pixel.
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
     hole's wall, the back edges of a part outline). A matching pixel counts only
     if the line is not behind it by more than three of that face's depth slopes
     plus the line's own slope, the most one plane can differ across the window,
     and four depth quanta of rounding. That is a slope allowance, not a wall
     thickness: it never applies to a different face. */
const LINE_PARS = /* glsl */ `
uniform sampler2D lineFaceIds;
uniform sampler2D lineFaceDepth;
uniform vec4 lineFaceView;
uniform float lineFaceOrtho;
uniform vec4 lineFaceOwn;
flat varying vec2 vLineFaces;
varying float vLineViewZ;
#ifdef LINE_FACE_WIDE
varying vec3 vLineCentre;
#endif
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
  if (lineFaceOwn.x < 1.5)
    return id == first + uint(vLineFaces.x) || id == first + uint(vLineFaces.y);
  return id >= first && id < uint(lineFaceOwn.z);
}
bool lineFaceVisible(vec2 pixel, float depth, float lineSlope) {
  if (lineFaceOwn.x < 0.5) return true;
  ivec2 last = ivec2(lineFaceView.xy) - 1;
  ivec2 centre = clamp(ivec2(floor(pixel)), ivec2(0), last);
  const float rounding = 4.0 / 16777215.0;
  float front, slope;
  uint id = lineFaceAt(centre, front, slope);
  float allowance = 3.0 * (slope + lineSlope) + rounding;
  // Nothing in front of the line at its own pixel: background, or a surface
  // behind it, as at a silhouette whose visible face is thinner than a pixel.
  if (id == 0u || front > depth + allowance) return true;
  bool behind = depth > front + allowance;
  if (lineFaceOwn.x > 2.5) return !behind;
  if (behind && !lineFaceOwns(id)) return false;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      id = lineFaceAt(clamp(centre + ivec2(dx, dy), ivec2(0), last), front, slope);
      if (lineFaceOwns(id) && depth <= front + 3.0 * (slope + lineSlope) + rounding)
        return true;
    }
  return false;
}
`;

const NATIVE_TEST = /* glsl */ `
float lineFaceDepthHere = lineFaceWindowDepth(vLineViewZ);
bool lineFaceShown = lineFaceVisible(gl_FragCoord.xy, lineFaceDepthHere, fwidth(lineFaceDepthHere));
#include <clipping_planes_fragment>
if (!lineFaceShown) discard;`;

// A wide line's quad reaches pixels away from the edge; test at its centre line.
const WIDE_TEST = /* glsl */ `
float lineFaceDepthHere = lineFaceWindowDepth(vLineViewZ);
vec2 lineFacePixel = (vLineCentre.xy / vLineCentre.z * 0.5 + 0.5) * lineFaceView.xy;
bool lineFaceShown = lineFaceVisible(lineFacePixel, lineFaceDepthHere, fwidth(lineFaceDepthHere));
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
      lineFaces: [0, 0],
    };
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms, visibility.uniforms, { lineFaceOwn: own });
    const define = wide ? "#define LINE_FACE_WIDE\n" : "";
    const varyings =
      "attribute vec2 lineFaces;\nflat varying vec2 vLineFaces;\nvarying float vLineViewZ;\n" +
      (wide ? "varying vec3 vLineCentre;\n" : "");
    shader.vertexShader =
      define +
      varyings +
      (wide
        ? shader.vertexShader.replace(
            WIDE_VERTEX_AT,
            `${WIDE_VERTEX_AT}\nvLineViewZ = mvPosition.z;\nvLineFaces = lineFaces;\nvec4 lineFaceClip = projectionMatrix * mvPosition;\nvLineCentre = vec3(lineFaceClip.xy, lineFaceClip.w);`,
          )
        : shader.vertexShader.replace(
            "#include <clipping_planes_vertex>",
            "#include <clipping_planes_vertex>\nvLineViewZ = mvPosition.z;\nvLineFaces = lineFaces;",
          ));
    shader.fragmentShader =
      define +
      LINE_PARS +
      shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        wide ? WIDE_TEST : NATIVE_TEST,
      );
  };
  material.customProgramCacheKey = () => `${key}:line-faces-v1`;
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
      { faceOffset: { value: FACE_CAP } },
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
  // A line object to face-test. Its material must have gone through
  // faceTestedLine; `kind` is "faces" (display edge with a lineFaces attribute)
  // or "part" (any face of its mesh: object marks).
  track(line, mesh, kind) {
    line.userData.lineFace = { mesh, kind, enabled: true };
    this.lines.add(line);
    const before = line.onBeforeRender;
    line.onBeforeRender = function (...args) {
      before.apply(this, args);
      line.userData.lineFace.visibility?.prepare(line);
    };
    line.userData.lineFace.visibility = this;
    return line;
  }
  prepare(line) {
    const { mesh, kind, enabled } = line.userData.lineFace;
    const own = line.material.userData.lineFaceOwn?.value;
    if (!own) return;
    const data = this.proxies.get(mesh)?.userData;
    if (!enabled) own.set(LINE_ALL, 0, 0, 0);
    else if (!data?.occluder) own.set(LINE_DEPTH, 0, 0, 0);
    else if (kind === "faces") own.set(LINE_FACES, data.first, 0, 0);
    else own.set(LINE_PART, data.first, data.first + data.capacity, 0);
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
      const from = source.attributes.position,
        index = source.index;
      const positions = new Float32Array(index.count * 3);
      for (let i = 0; i < index.count; i++)
        for (let k = 0; k < 3; k++)
          positions[i * 3 + k] = from.getComponent(index.getX(i), k);
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      for (const group of source.groups)
        geometry.addGroup(group.start, group.count, group.materialIndex);
      if (!source.boundingSphere) source.computeBoundingSphere();
      geometry.boundingSphere = source.boundingSphere;
    }
    proxy = new THREE.Mesh(geometry, []);
    proxy.matrixAutoUpdate = false;
    proxy.userData = {
      source,
      uniforms: { faceOffset: { value: 1 } },
      materials: [],
      owned: geometry !== source,
    };
    this.proxies.set(mesh, proxy);
    this.scene.add(proxy);
    return proxy;
  }
  // `faces[t]` is the local face of the mesh's drawn triangle t. It is kept
  // on the drawn geometry itself, so it lives and is freed with the model.
  setFaces(mesh, faces) {
    this.proxyOf(mesh).geometry.setAttribute(
      "faceIdentity",
      faceIdentity(faces),
    );
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
      data.first = first;
      data.capacity = Math.max(
        1,
        mesh.userData.fillTopology?.vertices.length ??
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) / 3,
      );
      first += data.capacity;
      data.uniforms.faceOffset.value = data.first;
      const sources = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      while (data.materials.length < sources.length)
        data.materials.push(idMaterial(data.uniforms));
      // Occluders are exactly the surfaces that write depth in the colour
      // pass: ghosted parts, X-ray and wireframe surfaces do not.
      let occluder = false;
      sources.forEach((source, i) => {
        const material = data.materials[i];
        material.visible = !!source?.visible && !!source.depthWrite;
        occluder ||= material.visible;
        material.side = source?.side ?? THREE.FrontSide;
        const planes = source?.clippingPlanes ?? null;
        if (material.clippingPlanes !== planes) {
          material.clippingPlanes = planes;
          material.needsUpdate = true;
        }
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
