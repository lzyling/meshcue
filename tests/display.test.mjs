import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildFillTopology } from "../src/planar-fill.js";
import { brepTopology, isFeatureEdge } from "../src/measure.js";
import { convertStepDetached } from "../server/step.mjs";
import {
  extractEdges,
  edgeInput,
  edgeInputAsync,
} from "../src/viewer/edges.js";
import { DisplayModesMethods } from "../src/viewer/display-modes.js";
const topology = (geometry) => buildFillTopology(geometry, new THREE.Matrix4());
const count = (array) => array.length / 6;

test("display edges omit planar diagonals but wireframe retains them and open borders", () => {
  const result = extractEdges(
    edgeInput(topology(new THREE.PlaneGeometry(2, 2))),
  );
  assert.equal(count(result.feature), 4);
  assert.equal(count(result.wire), 5);
  assert.equal(result.bytes, (4 + 5) * 6 * 4);
});

test("display crease threshold distinguishes 29 and 31 degree folds", () => {
  const fold = (angle) => {
    const r = (angle * Math.PI) / 180;
    const positions = new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      -Math.cos(r),
      Math.sin(r),
    ]);
    const geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    return extractEdges(edgeInput(topology(geometry)));
  };
  assert.equal(count(fold(29).feature), 4);
  assert.equal(count(fold(30).feature), 4);
  assert.equal(count(fold(31).feature), 5);
});

test("display welds duplicate mesh vertices and emits each box edge once", () => {
  const result = extractEdges(
    edgeInput(topology(new THREE.BoxGeometry().toNonIndexed())),
  );
  assert.equal(count(result.feature), 12);
  assert.equal(count(result.wire), 18);
});

test("display STEP uses face identity even for coplanar boundaries and curved tessellation", () => {
  const input = edgeInput(topology(new THREE.PlaneGeometry()));
  input.faceIds = new Int32Array([0, 1]);
  const boundary = extractEdges(input);
  assert.equal(count(boundary.feature), 5);
  assert.equal(boundary.wire, boundary.feature);
  input.faceIds.fill(0);
  assert.equal(count(extractEdges(input).feature), 4);
});

test("display ignores degenerate triangles and cancels pending source packing", async () => {
  const result = extractEdges({
    positions: new Float32Array(9),
    normals: new Float32Array(3),
  });
  assert.equal(result.feature.length, 0);
  assert.equal(result.wire.length, 0);
  const topo = topology(new THREE.BoxGeometry());
  assert.equal(await edgeInputAsync(topo, () => true), null);
  assert.deepEqual(await edgeInputAsync(topo, () => false), edgeInput(topo));
});

test("display STEP plate output agrees with B-rep measuring boundaries", async () => {
  const { glb } = await convertStepDetached(
    fs.readFileSync("tests/fixtures/plate.step"),
  );
  const gltf = await new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
    "",
  );
  let total = 0;
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const topo = topology(mesh.geometry);
    topo.brep = brepTopology(mesh.userData.brepFaces, topo.vertices.length);
    assert.ok(topo.brep);
    const expected = new Set();
    for (let face = 0; face < topo.vertices.length; face++) {
      const keys = topo.vertices[face].map((p) =>
        p.map((v) => Math.round(v * 1e7)).join(","),
      );
      for (let j = 0; j < 3; j++) {
        const a = keys[j],
          b = keys[(j + 1) % 3];
        if (isFeatureEdge(topo, face, a, b))
          expected.add([a, b].sort().join("|"));
      }
    }
    const result = extractEdges(edgeInput(topo));
    assert.equal(count(result.feature), expected.size);
    assert.equal(result.feature, result.wire);
    total += expected.size;
    mesh.geometry.dispose();
  });
  assert.ok(total > 20);
});

test("display styles preserve source materials and do not change surface picking", () => {
  const original = new THREE.MeshStandardMaterial({
    color: "red",
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
  const viewer = Object.assign(new DisplayModesMethods(), {
    meshes: [mesh],
    displayEdges: [],
    restoreSectionSides() {},
    applySectionMaterials() {},
  });
  for (const style of ["edges", "shaded", "wireframe", "hidden", "xray"]) {
    viewer.neutral = true;
    viewer.setDisplayStyle(style);
    assert.equal(mesh.userData.displayOriginal, original);
    assert.equal(mesh.material.side, original.side);
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 3),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(mesh);
    assert.ok(hits.length);
    if (style === "xray") {
      assert.equal(mesh.material.blending, THREE.CustomBlending);
      assert.equal(mesh.material.depthWrite, false);
    }
  }
  viewer.restoreDisplayMaterials();
  assert.equal(mesh.material, original);
  assert.equal(original.color.getHexString(), "ff0000");
});
