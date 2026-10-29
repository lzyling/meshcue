import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import {
  FACE_CAP,
  LINE_ALL,
  LINE_DEPTH,
  LINE_FACES,
  LINE_PART,
  LineVisibility,
  faceIdentity,
  faceTestedLine,
  fittedDepth,
} from "../src/viewer/line-visibility.js";
import { DisplayModesMethods } from "../src/viewer/display-modes.js";

const box = (material = new THREE.MeshBasicMaterial()) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(200, 160, 20).toNonIndexed(),
    material,
  );
  mesh.updateMatrixWorld(true);
  return mesh;
};

test("lines are face-tested instead of depth-tested, for native and wide lines alike", () => {
  const visibility = new LineVisibility();
  for (const material of [new THREE.LineBasicMaterial(), new LineMaterial()]) {
    const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
    material.clippingPlanes = planes;
    let chained = false;
    material.onBeforeCompile = () => {
      chained = true;
    };
    const key = material.customProgramCacheKey();
    assert.equal(faceTestedLine(material, visibility), material);
    // The colour pass's depth buffer no longer decides; the face pass does.
    assert.equal(material.depthTest, false);
    assert.equal(material.depthWrite, false);
    assert.equal(material.clippingPlanes, planes);
    assert.equal(material.customProgramCacheKey(), `${key}:line-faces-v1`);
    const wide = !!material.isLineMaterial;
    const shader = {
      vertexShader: wide
        ? new LineMaterial().vertexShader
        : "#include <project_vertex>\n#include <clipping_planes_vertex>",
      fragmentShader: "void main() {\n#include <clipping_planes_fragment>\n}",
      uniforms: {},
    };
    material.onBeforeCompile(shader, {});
    assert.equal(chained, true);
    assert.match(shader.vertexShader, /vLineViewZ = mvPosition\.z;/);
    assert.match(shader.vertexShader, /vLineFaces = lineFaces;/);
    // A wide quad tests at its centre line, a native line at its own pixel.
    if (wide) assert.match(shader.vertexShader, /vLineCentre = /);
    assert.match(
      shader.fragmentShader,
      wide
        ? /lineFaceVisible\(lineFacePixel/
        : /lineFaceVisible\(gl_FragCoord\.xy/,
    );
    // Visibility is computed before clipping can discard (derivatives), and
    // section clipping still applies to the line.
    assert.ok(
      shader.fragmentShader.indexOf("bool lineFaceShown") <
        shader.fragmentShader.indexOf("#include <clipping_planes_fragment>"),
    );
    assert.match(shader.fragmentShader, /if \(!lineFaceShown\) discard;/);
    for (const name of Object.keys(visibility.uniforms))
      assert.equal(shader.uniforms[name], visibility.uniforms[name]);
    assert.equal(shader.uniforms.lineFaceOwn, material.userData.lineFaceOwn);
  }
});

test("display surfaces carry no depth offset in any style; source materials are untouched", () => {
  const original = new THREE.MeshStandardMaterial();
  const mesh = box(original);
  const viewer = Object.assign(new DisplayModesMethods(), {
    meshes: [mesh],
    displayEdges: [],
    restoreSectionSides() {},
    applySectionMaterials() {},
  });
  for (const style of ["edges", "shaded", "wireframe", "hidden", "xray"]) {
    viewer.setDisplayStyle(style);
    assert.equal(mesh.material.polygonOffset, false, style);
    assert.equal(mesh.material.polygonOffsetFactor, 0, style);
  }
  viewer.restoreDisplayMaterials();
  assert.equal(mesh.material, original);
  assert.equal(original.polygonOffset, false);
});

test("the face pass keeps the camera's pixels and fits depth to resolve a 0.015 mm wall", () => {
  for (const orthographic of [false, true])
    for (const distance of [500, 1000, 2000]) {
      const camera = orthographic
        ? new THREE.OrthographicCamera(
            -140,
            140,
            140,
            -140,
            distance * 1e-4,
            distance * 4,
          )
        : new THREE.PerspectiveCamera(30, 1, distance * 1e-4, distance * 4);
      camera.position.z = distance;
      camera.updateMatrixWorld();
      const fitted = fittedDepth(
        camera.projectionMatrix.clone(),
        orthographic,
        distance - 150,
        distance + 150,
      );
      const a = camera.projectionMatrix.elements,
        b = fitted.elements;
      for (const i of [0, 1, 4, 5, 8, 9, 3, 7, 11, 12, 13, 15])
        assert.equal(b[i], a[i], `${orthographic}:${distance}:${i}`);
      const depth = (projection, z) => {
        const clip = new THREE.Vector4(10, 20, z, 1).applyMatrix4(projection);
        return (clip.z / clip.w) * 0.5 + 0.5;
      };
      const quanta = (projection, z) =>
        Math.abs(depth(projection, z - 0.015) - depth(projection, z)) *
        (2 ** 24 - 1);
      for (const offset of [-140, 0, 140]) {
        const z = -distance + offset;
        const fine = quanta(fitted, z);
        assert.ok(fine > 16, `${orthographic}:${distance}:${offset}: ${fine}`);
        // In the colour pass's own range the same wall is under one quantum
        // in perspective: there depth could never be what decides.
        if (!orthographic)
          assert.ok(quanta(camera.projectionMatrix, z) < 1, `${distance}`);
      }
    }
});

test("face numbers ride on the drawn geometry, 24 bits on each vertex of a triangle", () => {
  const attribute = faceIdentity(Uint32Array.from([7, 0xabcdef]));
  assert.equal(attribute.itemSize, 4);
  assert.equal(attribute.normalized, true);
  assert.equal(attribute.count, 6);
  const at = (i) => Array.from(attribute.array.slice(i * 4, i * 4 + 4));
  for (const v of [0, 1, 2]) assert.deepEqual(at(v), [0, 0, 7, 0]);
  for (const v of [3, 4, 5]) assert.deepEqual(at(v), [0xab, 0xcd, 0xef, 0]);
  // Kept on the mesh's own geometry: freed with the model, no new GPU object.
  const visibility = new LineVisibility();
  const mesh = box();
  visibility.setFaces(mesh, new Uint32Array(12));
  assert.equal(visibility.proxies.get(mesh).geometry, mesh.geometry);
  assert.equal(mesh.geometry.attributes.faceIdentity.count, 36);
  // Faces not known yet read face 0 of the block, never a stale value.
  const material = visibility.proxies.get(mesh).material;
  visibility.syncMeshes([mesh]);
  assert.deepEqual(
    visibility.proxies.get(mesh).material.defaultAttributeValues.faceIdentity,
    [0, 0, 0, 0],
  );
  assert.ok(Array.isArray(material));
});

test("the face target is allocated with the canvas and only grows, so models never recreate it", () => {
  const visibility = new LineVisibility();
  const allocated = [];
  const renderer = {
    width: 300,
    getDrawingBufferSize(v) {
      return v.set(this.width, 200);
    },
    getPixelRatio: () => 2,
    initRenderTarget: (target) => allocated.push([target.width, target.height]),
  };
  visibility.resize(renderer);
  renderer.width = 640;
  visibility.resize(renderer);
  renderer.width = 320;
  visibility.resize(renderer);
  assert.deepEqual(allocated, [
    [300, 200],
    [640, 200],
    [640, 200],
  ]);
  assert.equal(
    visibility.uniforms.lineFaceIds.value,
    visibility.target.texture,
  );
  assert.equal(
    visibility.uniforms.lineFaceDepth.value,
    visibility.target.depthTexture,
  );
  // No multisampling or filtering: identities must not blend.
  assert.equal(visibility.target.samples, 0);
  assert.equal(visibility.target.texture.magFilter, THREE.NearestFilter);
  assert.equal(visibility.target.texture.minFilter, THREE.NearestFilter);
});

test("occluders are exactly the depth-writing surfaces; identity blocks never overlap", () => {
  const visibility = new LineVisibility();
  const plain = box();
  plain.userData.fillTopology = { vertices: new Array(12) };
  const ghost = box(new THREE.MeshBasicMaterial({ depthWrite: false }));
  ghost.userData.fillTopology = { vertices: new Array(40) };
  const parent = new THREE.Group();
  const hidden = box();
  parent.add(hidden);
  parent.visible = false;
  const multi = box([
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
  ]);
  multi.material[1].visible = false;
  multi.geometry.clearGroups();
  multi.geometry.addGroup(0, 18, 0);
  multi.geometry.addGroup(18, 18, 1);
  const meshes = [plain, ghost, hidden, multi];
  visibility.syncMeshes(meshes);
  const data = meshes.map((mesh) => visibility.proxies.get(mesh).userData);
  assert.deepEqual(
    data.map((d) => [d.first, d.capacity]),
    [
      [1, 12],
      [13, 40],
      [53, 12],
      [65, 12],
    ],
  );
  assert.deepEqual(
    data.map((d) => d.occluder),
    [true, false, false, true],
  );
  const proxy = visibility.proxies.get(multi);
  assert.deepEqual(
    proxy.material.map((m) => m.visible),
    [true, false],
  );
  assert.deepEqual(proxy.geometry.groups, multi.geometry.groups);
  // Unindexed review geometry is drawn as it is, the same object.
  assert.equal(visibility.proxies.get(plain).geometry, plain.geometry);
  assert.ok(data.at(-1).first + data.at(-1).capacity < FACE_CAP);
  // Releasing a proxy must not free the model's own geometry.
  let disposed = false;
  plain.geometry.addEventListener("dispose", () => (disposed = true));
  visibility.syncMeshes([ghost, multi]);
  assert.equal(visibility.proxies.has(plain), false);
  assert.equal(disposed, false);
  assert.equal(plain.geometry.attributes.position.count, 36);
});

test("each line takes its mode from its own mesh at draw time", () => {
  const visibility = new LineVisibility();
  const scene = new THREE.Scene();
  const solid = box();
  const ghost = box(new THREE.MeshBasicMaterial({ depthWrite: false }));
  scene.add(solid, ghost);
  const edge = faceTestedLine(new THREE.LineBasicMaterial(), visibility);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), edge);
  solid.add(lines);
  visibility.track(lines, solid, "faces");
  const ghostLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    faceTestedLine(new THREE.LineBasicMaterial(), visibility),
  );
  ghost.add(ghostLines);
  visibility.track(ghostLines, ghost, "faces");
  const shared = faceTestedLine(new LineMaterial(), visibility);
  const mark = new LineSegments2(new LineSegmentsGeometry(), shared);
  scene.add(mark);
  visibility.track(mark, solid, "part");
  visibility.syncMeshes([solid, ghost]);
  const first = visibility.proxies.get(solid).userData.first;
  const own = (line) => line.material.userData.lineFaceOwn.value.toArray();
  const renderer = { getViewport: (v) => v.set(0, 0, 8, 8) };
  lines.onBeforeRender(renderer);
  assert.deepEqual(own(lines), [LINE_FACES, first, 0, 0]);
  ghostLines.onBeforeRender(renderer);
  assert.deepEqual(own(ghostLines), [LINE_DEPTH, 0, 0, 0]);
  shared.uniformsNeedUpdate = false;
  mark.onBeforeRender(renderer);
  assert.deepEqual(own(mark), [LINE_PART, first, first + 12, 0]);
  // Shared between marks of different parts: uploaded again for each draw.
  assert.equal(shared.uniformsNeedUpdate, true);
  // LineSegments2's own resolution update still runs.
  assert.deepEqual(shared.resolution.toArray(), [8, 8]);
  lines.userData.lineFace.enabled = false;
  lines.onBeforeRender(renderer);
  assert.deepEqual(own(lines), [LINE_ALL, 0, 0, 0]);
});

test("the face pass runs only when a face-tested line will be drawn, and restores the renderer", () => {
  const visibility = new LineVisibility();
  const calls = [];
  const renderer = {
    autoClear: true,
    target: null,
    getDrawingBufferSize: (v) => v.set(640, 480),
    getRenderTarget() {
      return this.target;
    },
    setRenderTarget(target) {
      calls.push(["target", target]);
      this.target = target;
    },
    getClearAlpha: () => 1,
    getClearColor: (c) => c.set(0x123456),
    setClearColor: (c, a) =>
      calls.push(["clearColor", new THREE.Color(c).getHex(), a]),
    clear: (...args) => calls.push(["clear", ...args]),
    render: (scene, camera) => calls.push(["render", scene, camera]),
  };
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 4000);
  camera.position.z = 1000;
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  const mesh = box();
  scene.add(mesh);
  assert.equal(visibility.render(renderer, camera, null, [mesh], null), false);
  assert.equal(calls.length, 0);
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    faceTestedLine(new THREE.LineBasicMaterial(), visibility),
  );
  mesh.add(lines);
  visibility.track(lines, mesh, "faces");
  lines.visible = false;
  assert.equal(visibility.render(renderer, camera, null, [mesh], null), false);
  lines.visible = true;
  assert.equal(visibility.render(renderer, camera, null, [mesh], null), true);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["target", "clearColor", "clear", "render", "clearColor", "target"],
  );
  assert.equal(calls[0][1], visibility.target);
  assert.deepEqual(calls[2].slice(1), [true, true, true]);
  assert.equal(calls[3][1], visibility.scene);
  assert.deepEqual(calls[4].slice(1), [0x123456, 1]);
  assert.equal(calls[5][1], null);
  assert.equal(renderer.autoClear, true);
  assert.deepEqual(
    [visibility.target.width, visibility.target.height],
    [640, 480],
  );
  assert.deepEqual(visibility.target.viewport.toArray(), [0, 0, 640, 480]);
  // Fitted to the box's bounding sphere, inside the camera's own range.
  const view = visibility.uniforms.lineFaceView.value;
  assert.deepEqual([view.x, view.y], [640, 480]);
  const p = calls[3][2].projectionMatrix.elements;
  assert.equal(view.z, p[10]);
  assert.equal(view.w, p[14]);
  const near = p[14] / (p[10] - 1),
    far = p[14] / (p[10] + 1);
  const radius = mesh.geometry.boundingSphere.radius;
  assert.ok(near < 1000 - radius && near > 1000 - radius - 1, `${near}`);
  assert.ok(far > 1000 + radius && far < 1000 + radius + 1, `${far}`);
  for (const i of [0, 5, 8, 9, 11])
    assert.equal(p[i], camera.projectionMatrix.elements[i]);
  // A line removed from the scene is forgotten; nothing else is drawn.
  lines.removeFromParent();
  calls.length = 0;
  assert.equal(visibility.render(renderer, camera, null, [mesh], null), false);
  assert.equal(visibility.lines.size, 0);
  assert.equal(calls.length, 0);
});

test("section caps replay the stencil count and occlude with an identity no line owns", () => {
  const visibility = new LineVisibility();
  const group = new THREE.Group();
  const counter = new THREE.Mesh(
    new THREE.PlaneGeometry(),
    new THREE.MeshBasicMaterial({ colorWrite: false, stencilWrite: true }),
  );
  counter.renderOrder = 1.1;
  const cap = new THREE.Mesh(
    new THREE.PlaneGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  cap.renderOrder = 1.2;
  group.add(counter, cap);
  group.updateMatrixWorld(true);
  visibility.syncCaps(group);
  const [a, b] = [visibility.caps.get(counter), visibility.caps.get(cap)];
  assert.equal(a.material, counter.material);
  assert.equal(b.material, visibility.capMaterial);
  assert.equal(b.material.uniforms.faceOffset.value, FACE_CAP);
  assert.equal(b.material.stencilFunc, THREE.NotEqualStencilFunc);
  assert.deepEqual([a.renderOrder, b.renderOrder], [1.1, 1.2]);
  let cleared = false;
  b.onAfterRender({ clearStencil: () => (cleared = true) });
  assert.equal(cleared, true);
  group.visible = false;
  visibility.syncCaps(group);
  assert.equal(visibility.caps.size, 0);
  assert.equal(a.parent, null);
});
