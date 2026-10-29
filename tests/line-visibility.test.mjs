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
  LINE_NEAR,
  LineVisibility,
  cutLike,
  faceIdentity,
  faceTestedLine,
  fittedDepth,
  outlineEdges,
  segmentSources,
} from "../src/viewer/line-visibility.js";
import { DisplayModesMethods } from "../src/viewer/display-modes.js";
import { extractEdges } from "../src/viewer/edges.js";
import { buildFillTopology } from "../src/planar-fill.js";
import { brepTopology } from "../src/measure.js";
import { MeshBVH } from "three-mesh-bvh";

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
    assert.equal(material.customProgramCacheKey(), `${key}:line-faces-v2`);
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
  visibility.track(lines, solid);
  const ghostLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    faceTestedLine(new THREE.LineBasicMaterial(), visibility),
  );
  ghost.add(ghostLines);
  visibility.track(ghostLines, ghost);
  const shared = faceTestedLine(new LineMaterial(), visibility);
  const markGeometry = new LineSegmentsGeometry().setPositions([
    -100, 80, 10, 100, 80, 10,
  ]);
  const mark = new LineSegments2(markGeometry, shared);
  scene.add(mark);
  visibility.track(
    mark,
    solid,
    segmentSources(solid.geometry, [
      new THREE.Vector3(-100, 80, 10),
      new THREE.Vector3(100, 80, 10),
    ]),
  );
  visibility.syncMeshes([solid, ghost]);
  const first = visibility.proxies.get(solid).userData.first;
  const own = (line) => line.material.userData.lineFaceOwn.value.toArray();
  const renderer = { getViewport: (v) => v.set(0, 0, 8, 8) };
  // No faces known for a mesh without file faces until its edges are built.
  lines.onBeforeRender(renderer);
  assert.deepEqual(own(lines), [LINE_NEAR, 0, 0, 0]);
  assert.deepEqual(
    Array.from(markGeometry.attributes.lineFaces.array),
    [-1, -1],
  );
  visibility.setFaces(
    solid,
    Int32Array.from({ length: 12 }, (_, t) => t >> 1),
  );
  lines.onBeforeRender(renderer);
  assert.deepEqual(own(lines), [LINE_FACES, first, 0, 0]);
  ghostLines.onBeforeRender(renderer);
  assert.deepEqual(own(ghostLines), [LINE_DEPTH, 0, 0, 0]);
  shared.uniformsNeedUpdate = false;
  mark.onBeforeRender(renderer);
  // A mark is tested against its own two faces, never its whole part: the
  // box's top (+y, face 2) and front (+z, face 4), mapped once faces arrive.
  // The third value: the mesh draws front faces only, so a mark segment
  // turned away on both sides is not drawn. Display edges carry no normals.
  assert.deepEqual(own(mark), [LINE_FACES, first, 1, 0]);
  assert.ok(markGeometry.attributes.lineFaces.isInstancedBufferAttribute);
  assert.deepEqual(
    Array.from(markGeometry.attributes.lineFaces.array).sort(),
    [2, 4],
  );
  // The normals of the triangles either side, for the facing test.
  const normals = ["lineNormalA", "lineNormalB"].map((name) =>
    Array.from(markGeometry.attributes[name].array).join(),
  );
  assert.deepEqual(normals.sort(), ["0,0,1", "0,1,0"]);
  // Drawn double-sided, nothing is set aside by facing.
  solid.material.side = THREE.DoubleSide;
  visibility.syncMeshes([solid, ghost]);
  mark.onBeforeRender(renderer);
  assert.deepEqual(own(mark), [LINE_FACES, first, 0, 0]);
  solid.material.side = THREE.FrontSide;
  visibility.syncMeshes([solid, ghost]);
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
  visibility.track(lines, mesh);
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

/* A STEP face the tessellator could not mesh is an empty run, and keeps its
   number: the faces after it are numbered past the mesh's triangle count. Run
   through the display pipeline (the worker module's one call made in place),
   every identity a mesh draws and every face its edges claim stays inside its
   own block, so no part can take another part's face for its own. */
test("faces after an empty B-rep face stay inside their own part's identities", async () => {
  const triangle = (x) => {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute([x, 0, 0, x + 1, 0, 0, x, 1, 0], 3),
      ),
      new THREE.MeshBasicMaterial(),
    );
    mesh.updateMatrixWorld(true);
    mesh.userData.fillTopology = buildFillTopology(
      mesh.geometry,
      mesh.matrixWorld,
    );
    return mesh;
  };
  const step = triangle(0);
  step.userData.fillTopology.brep = brepTopology(
    [
      [0, -1],
      [0, 0],
    ],
    1,
  );
  assert.ok(step.userData.fillTopology.brep);
  const plate = triangle(2);
  const holed = triangle(4);
  holed.userData.fillTopology.brep = brepTopology(
    [
      [0, -1],
      [0, -1],
      [0, -1],
      [0, 0],
    ],
    1,
  );
  const meshes = [step, plate, holed];
  const saved = { Worker: globalThis.Worker, document: globalThis.document };
  globalThis.Worker = class {
    postMessage(input) {
      setTimeout(() => this.onmessage({ data: extractEdges(input) }));
    }
    terminate() {}
  };
  globalThis.document = { documentElement: { dataset: {} } };
  try {
    const viewer = Object.assign(new DisplayModesMethods(), {
      meshes,
      model: { sha256: "empty-brep-face-regression" },
      clipMaterial: (m) => m,
      restoreSectionSides() {},
      applySectionMaterials() {},
    });
    viewer.initializeDisplayModes();
    await viewer.buildDisplayEdges();
    assert.equal(viewer.displayError, null);
    const visibility = viewer.lineVisibility;
    visibility.syncMeshes(meshes);
    const blocks = [];
    for (const mesh of meshes) {
      const { first, capacity } = visibility.proxies.get(mesh).userData;
      const drawn = new Set();
      const colour =
        visibility.proxies.get(mesh).geometry.attributes.faceIdentity.array;
      for (let i = 0; i < colour.length; i += 4)
        drawn.add(
          first + ((colour[i] << 16) | (colour[i + 1] << 8) | colour[i + 2]),
        );
      for (const id of drawn)
        assert.ok(
          id >= first && id < first + capacity,
          `${id} in [${first}, ${first + capacity})`,
        );
      const edges = mesh.children.find((c) => c.isLineSegments);
      for (const face of edges.geometry.attributes.lineFaces.array)
        assert.ok(drawn.has(first + face), `edge face ${first + face}`);
      blocks.push(drawn);
    }
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++)
        for (const id of blocks[i])
          assert.ok(
            !blocks[j].has(id),
            `identity ${id} shared by parts ${i} and ${j}`,
          );
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("a face table outside the mesh's block is refused, and a block past 24 bits owns no line", () => {
  const visibility = new LineVisibility();
  const mesh = box();
  mesh.userData.fillTopology = { vertices: new Array(12) };
  assert.equal(visibility.setFaces(mesh, new Int32Array(12).fill(12)), false);
  assert.equal(visibility.proxies.get(mesh).userData.table, null);
  assert.equal(mesh.geometry.attributes.faceIdentity, undefined);
  assert.equal(visibility.setFaces(mesh, new Int32Array(11)), false);
  assert.equal(visibility.setFaces(mesh, new Int32Array(12).fill(11)), true);
  const huge = box();
  huge.userData.fillTopology = { vertices: { length: FACE_CAP } };
  const after = box();
  visibility.syncMeshes([mesh, huge, after]);
  const data = [mesh, huge, after].map(
    (m) => visibility.proxies.get(m).userData,
  );
  assert.deepEqual(
    data.map((d) => [d.first, d.overflow, d.uniforms.faceScale.value]),
    [
      [1, false, 1],
      [FACE_CAP, true, 0],
      [13, false, 1],
    ],
  );
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    faceTestedLine(new THREE.LineBasicMaterial(), visibility),
  );
  huge.add(lines);
  visibility.track(lines, huge);
  lines.onBeforeRender({});
  assert.deepEqual(lines.material.userData.lineFaceOwn.value.toArray(), [
    LINE_NEAR,
    0,
    0,
    0,
  ]);
});

test("part outlines are EdgesGeometry's segments, each with the triangles either side", () => {
  const geometries = [
    new THREE.BoxGeometry(4, 4, 0.015),
    new THREE.BoxGeometry(2, 3, 4).toNonIndexed(),
    new THREE.CylinderGeometry(1, 1, 2, 24),
    new THREE.TorusKnotGeometry(1, 0.3, 64, 8),
  ];
  for (const geometry of geometries) {
    const expected = new THREE.EdgesGeometry(geometry, 30).attributes.position
      .array;
    const { geometry: outline, sources } = outlineEdges(geometry, 30);
    assert.deepEqual(outline.attributes.position.array, expected);
    assert.equal(sources.stride, 2);
    assert.equal(sources.sources.length, expected.length / 3);
    const position = geometry.attributes.position,
      index = geometry.index;
    const corner = (t, k) =>
      new THREE.Vector3().fromBufferAttribute(
        position,
        index ? index.getX(t * 3 + k) : t * 3 + k,
      );
    for (let s = 0; s < expected.length / 6; s++) {
      const a = new THREE.Vector3().fromArray(expected, s * 6),
        b = new THREE.Vector3().fromArray(expected, s * 6 + 3);
      const [one, two] = sources.sources.slice(s * 2, s * 2 + 2);
      assert.ok(one >= 0);
      for (const t of two < 0 ? [one] : [one, two]) {
        const corners = [0, 1, 2].map((k) => corner(t, k));
        for (const p of [a, b])
          assert.ok(corners.some((c) => c.distanceTo(p) < 1e-4));
      }
    }
  }
});

test("an edge mark finds the faces either side of each segment, through review subdivision", () => {
  const geometry = new THREE.BoxGeometry(4, 4, 0.015).toNonIndexed();
  // Every source triangle split in two, as review subdivision does.
  const position = geometry.attributes.position;
  const split = [],
    sourceFaces = [];
  for (let t = 0; t < position.count / 3; t++) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(position, t * 3 + k),
    );
    const m = a.clone().lerp(b, 0.5);
    split.push(...a.toArray(), ...m.toArray(), ...c.toArray());
    split.push(...m.toArray(), ...b.toArray(), ...c.toArray());
    sourceFaces.push(t, t);
  }
  const review = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(split, 3),
  );
  review.userData.sourceFaces = Uint32Array.from(sourceFaces);
  // The rear left edge of a 0.015 thick wall: its faces are the left (-x)
  // and rear (-z) sides, not the front only 0.015 away.
  const edge = segmentSources(review, [
    new THREE.Vector3(-2, -1.8, -0.0075),
    new THREE.Vector3(-2, 0.4, -0.0075),
    new THREE.Vector3(-2, 1.8, -0.0075),
  ]);
  const faceOf = (t) => t >> 1;
  for (let s = 0; s < 2; s++) {
    const found = Array.from(
      edge.sources.slice(s * edge.stride, (s + 1) * edge.stride),
    ).filter((t) => t >= 0);
    assert.deepEqual([...new Set(found.map(faceOf))].sort(), [1, 5]);
  }
  // A segment that lies on no face of this mesh is unknown, not guessed.
  const loose = segmentSources(review, [
    new THREE.Vector3(9, 9, 9),
    new THREE.Vector3(9, 8, 9),
  ]);
  assert.ok(loose.sources.every((t) => t === -1));
});

/* Moving a part's coordinates (the geometry translated, the mesh moved back,
   nothing in the world changed) must not change which faces its marks are
   on. Through the viewer's indirect BVH and without one, on the 0.015 mm
   plate (offsets along the wall, and across it where float32 still holds
   the wall) and on a scan-like mesh whose segments are its own triangle
   sides. Allowing more than float32 steps of the coordinates, or counting
   distance from the origin as model size, finds the front wall at 100000. */
test("the faces a mark segment touches do not depend on where its coordinates sit", () => {
  const offsets = [
    [0, 0, 0],
    [1e5, 0, 0],
    [-1e5, 1e5, 0],
    [1e5, -3e4, 1000],
  ];
  const found = (geometry, points, bvh) => {
    geometry.boundsTree = bvh
      ? new MeshBVH(geometry, { indirect: true, targetLeafSize: 4 })
      : undefined;
    return segmentSources(geometry, points);
  };
  const faceSets = ({ sources, stride }, faceOf) =>
    Array.from({ length: sources.length / stride }, (_, s) =>
      [
        ...new Set(
          Array.from(sources.slice(s * stride, (s + 1) * stride))
            .filter((t) => t !== -1)
            .map(faceOf),
        ),
      ].sort((a, b) => a - b),
    );
  // Either side's normal, in either order (the facing test takes either).
  const facing = ({ normals }) =>
    Array.from({ length: normals.length / 6 }, (_, s) =>
      [0, 3]
        .map((k) =>
          Array.from(
            normals.slice(s * 6 + k, s * 6 + k + 3),
            (n) => Math.round(n * 1e3) / 1e3 || 0,
          ).join(),
        )
        .sort()
        .join(" "),
    );
  for (const bvh of [true, false]) {
    // The plate's rear left and rear bottom edges: left (1) or bottom (3)
    // with rear (5), never the front (4) 0.015 away.
    const plate = [];
    for (const offset of offsets) {
      const geometry = new THREE.BoxGeometry(4, 4, 0.015).toNonIndexed();
      geometry.translate(...offset);
      const at = (x, y, z) =>
        new THREE.Vector3(x, y, z).add(new THREE.Vector3(...offset));
      const result = found(
        geometry,
        [at(-2, -1.8, -0.0075), at(-2, 0.4, -0.0075), at(-2, 1.8, -0.0075)],
        bvh,
      );
      const bottom = found(
        geometry,
        [at(-1.8, -2, -0.0075), at(1.8, -2, -0.0075)],
        bvh,
      );
      plate.push({
        offset,
        faces: [
          ...faceSets(result, (t) => t >> 1),
          ...faceSets(bottom, (t) => t >> 1),
        ],
        normals: [...facing(result), ...facing(bottom)],
      });
    }
    for (const { offset, faces, normals } of plate) {
      assert.deepEqual(
        faces,
        [
          [1, 5],
          [1, 5],
          [3, 5],
        ],
        `${offset} ${bvh}`,
      );
      // Rear (-z) and left (-x) or bottom (-y): no +z normal from the front.
      assert.deepEqual(
        normals,
        ["-1,0,0 0,0,-1", "-1,0,0 0,0,-1", "0,-1,0 0,0,-1"],
        `${offset} ${bvh}`,
      );
    }
    // A scan-like closed mesh: every segment is a side of two triangles.
    const scan = offsets.map((offset) => {
      const geometry = new THREE.IcosahedronGeometry(30, 4);
      geometry.translate(...offset);
      const position = geometry.attributes.position;
      const points = [];
      for (let t = 0; t < 40; t++) {
        const v = (k) =>
          new THREE.Vector3().fromBufferAttribute(position, t * 21 + k);
        points.push(v(0), v(1));
      }
      const pairs = [];
      for (let k = 0; k < points.length; k += 2) {
        const { sources, stride } = found(
          geometry,
          [points[k], points[k + 1]],
          bvh,
        );
        pairs.push(
          Array.from(sources.slice(0, stride))
            .filter((t) => t !== -1)
            .sort((a, b) => a - b),
        );
      }
      return pairs;
    });
    for (const pair of scan[0]) assert.equal(pair.length, 2);
    for (let k = 1; k < scan.length; k++)
      assert.deepEqual(scan[k], scan[0], `${offsets[k]} ${bvh}`);
  }
});

/* A wall closer than the contact allowance (a few millionths of the part's
   size) is touched too, so the segment's faces are unknown rather than
   guessed; but its normal faces the other way and is not the edge's own, so
   it cannot make a segment that faces away count as facing the eye. */
test("a surface found only through the contact allowance gives a mark no facing normal", () => {
  for (const bvh of [true, false]) {
    const geometry = new THREE.BoxGeometry(4, 4, 4e-6).toNonIndexed();
    if (bvh) geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
    const { sources, stride, normals } = segmentSources(geometry, [
      new THREE.Vector3(-2, -1.8, -2e-6),
      new THREE.Vector3(-2, 1.8, -2e-6),
    ]);
    const sides = [
      ...new Set(
        Array.from(sources.slice(0, stride))
          .filter((t) => t >= 0)
          .map((t) => t >> 1),
      ),
    ].sort();
    assert.deepEqual(sides, [1, 4, 5], `${bvh}`);
    const pair = [0, 3]
      .map((k) => Array.from(normals.slice(k, k + 3), Math.round).join())
      .sort();
    assert.deepEqual(pair, ["-1,0,0", "0,0,-1"], `${bvh}`);
  }
});

test("the face pass cuts away what the colour pass's alpha test cuts away", () => {
  const visibility = new LineVisibility();
  const texture = new THREE.DataTexture(new Uint8Array(8), 2, 1);
  texture.offset.set(0.5, 0);
  const source = new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: 0.5,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const mesh = box(source);
  visibility.syncMeshes([mesh]);
  const material = visibility.proxies.get(mesh).material;
  assert.equal(material.map, texture);
  assert.equal(material.alphaTest, 0.5);
  assert.equal(material.side, THREE.DoubleSide);
  assert.equal(material.uniforms.alphaTest.value, 0.5);
  assert.equal(material.uniforms.opacity.value, 0.8);
  assert.equal(material.uniforms.map.value, texture);
  assert.deepEqual(
    material.uniforms.mapTransform.value.toArray(),
    texture.matrix.toArray(),
  );
  assert.equal(texture.matrix.elements[6], 0.5);
  // Without an alpha test nothing is discarded in either pass: no texture.
  const version = material.version;
  source.alphaTest = 0;
  visibility.syncMeshes([mesh]);
  assert.equal(material.map, null);
  assert.equal(material.alphaTest, 0);
  assert.ok(material.version > version);
  // Alpha hash discards at a per-pixel threshold; here, at its mean.
  source.alphaHash = true;
  cutLike(material, source, mesh.geometry);
  assert.equal(material.alphaTest, 0.5);
  assert.equal(material.map, texture);
});
