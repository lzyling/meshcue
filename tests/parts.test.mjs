import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { convertStep } from "../server/step.mjs";
import { buildPartTree, createParts } from "../src/viewer/parts-tree.js";
import { ModelViewer } from "../src/viewer.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function unpack(bytes) {
  const size = bytes.readUInt32LE(12);
  return {
    json: JSON.parse(bytes.subarray(20, 20 + size)),
    bin: bytes.subarray(28 + size),
  };
}
function pack(json, bin) {
  const body = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([
    body,
    Buffer.alloc((4 - (body.length % 4)) % 4, 32),
  ]);
  const head = Buffer.alloc(20),
    tail = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + padded.length + bin.length, 8);
  head.writeUInt32LE(padded.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  tail.writeUInt32LE(bin.length);
  tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, padded, tail, bin]);
}
async function load(bytes, format = "glb") {
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    root: new THREE.Group(),
    grid: new THREE.Object3D(),
    meshMap: new Map(),
    meshes: [],
    loadingEpoch: 0,
    parts: createParts(),
    clearModel() {},
    home() {},
    async onReady(data) {
      this.manifest = data.meshes;
    },
  });
  const model = { id: "test", name: "test", format, sha256: hash(bytes) };
  if (format === "step") model.mesh = { format: "glb", sha256: hash(bytes) };
  await viewer.load(
    model,
    `data:application/octet-stream;base64,${bytes.toString("base64")}`,
  );
  return viewer;
}
const step = async (name) =>
  (await convertStep(fs.readFileSync(`tests/fixtures/${name}.step`))).glb;

test("STEP hierarchy preserves base 15d03b0 mesh buffers, materials and b-rep face numbering", async () => {
  // Captured from unmodified 15d03b0 before implementation. The hash includes
  // every source vertex, index, normal, accessor, face range and material.
  const baseline = {
    plate: "4c7870eed87ea4bfb555399b3c02bdaae3ebb8035c0a148691e86b84311dbac8",
    "grouped-colours":
      "e16ea65f7def82ee062581d2ea02d88ca314cc7a1dda759c392fc621a543ee0d",
  };
  for (const [name, expected] of Object.entries(baseline)) {
    const { json: j, bin } = unpack(await step(name));
    assert.equal(
      createHash("sha256")
        .update(
          JSON.stringify([j.meshes, j.accessors, j.bufferViews, j.materials]),
        )
        .update(bin)
        .digest("hex"),
      expected,
    );
    if (name === "grouped-colours") {
      const root = j.nodes[j.scenes[0].nodes[0]];
      assert.equal(root.name, "COMPOUND");
      assert.equal(j.nodes[root.children[0]].name, "part");
      assert.equal(j.nodes[root.children[0]].children.length, 3);
    }
  }
});

test("STEP assembly loading keeps every mesh id, matrix and review face identical to flat base output", async () => {
  for (const name of ["plate", "grouped-colours"]) {
    const bytes = await step(name),
      { json, bin } = unpack(bytes);
    const flat = structuredClone(json);
    flat.nodes = flat.meshes.map((m, mesh) => ({
      mesh,
      ...(m.name ? { name: m.name } : {}),
    }));
    flat.scenes = [{ nodes: flat.nodes.map((_, i) => i) }];
    const before = await load(pack(flat, bin), "step"),
      after = await load(bytes, "step");
    assert.deepEqual(after.manifest, before.manifest);
    for (let i = 0; i < after.meshes.length; i++) {
      assert.deepEqual(
        after.meshes[i].geometry.userData.sourceFaces,
        before.meshes[i].geometry.userData.sourceFaces,
      );
      assert.deepEqual(
        after.meshes[i].geometry.attributes.position.array,
        before.meshes[i].geometry.attributes.position.array,
      );
    }
    assert.equal(
      after.parts.list().filter((p) => !p.childIds.length).length,
      before.meshes.length,
    );
  }
});

test("GLB nested, duplicate and unnamed nodes retain their names and deterministic part ids", async () => {
  const { json, bin } = unpack(await step("grouped-colours"));
  json.nodes = [
    { name: "Assembly [α]", children: [1, 4] },
    { children: [2, 3] },
    { name: "Same name", mesh: 0 },
    { name: "Same name", mesh: 1 },
    { mesh: 2 },
  ];
  json.scenes = [{ nodes: [0] }];
  const bytes = pack(json, bin);
  const one = await load(bytes),
    two = await load(bytes);
  assert.deepEqual(one.parts.list(), two.parts.list());
  const list = one.parts.list();
  assert.deepEqual(
    list.map((p) => p.name),
    ["Assembly [α]", "Part 2", "Same name", "Same name", "Part 5"],
  );
  assert.equal(new Set(list.map((p) => p.id)).size, 5);
  assert.deepEqual(list[0].meshIds, ["mesh-0", "mesh-1", "mesh-2"]);
  assert.equal(list[2].parentId, list[1].id);
  assert.equal(one.parts.partOfMesh("mesh-1"), list[3].id);
  const original = one.parts.list();
  original[0].meshIds.length = 0;
  assert.equal(
    one.parts.list()[0].meshIds.length,
    3,
    "callers cannot mutate the tree",
  );
  json.nodes = [{ name: "Two materials", mesh: 0 }];
  json.scenes = [{ nodes: [0] }];
  json.meshes[0].primitives.push(structuredClone(json.meshes[0].primitives[0]));
  const multi = await load(pack(json, bin));
  assert.equal(multi.parts.list().length, 1);
  assert.deepEqual(multi.parts.list()[0].meshIds, ["mesh-0", "mesh-1"]);
  assert.equal(
    multi.parts.partOfMesh("mesh-0"),
    multi.parts.partOfMesh("mesh-1"),
  );
});

test("subtree visibility, temporary isolation, transparency, selection and reset remain independent", async () => {
  const viewer = await load(await step("grouped-colours"), "step");
  const parts = viewer.parts,
    list = parts.list(),
    root = list[0],
    leaves = list.filter((p) => !p.childIds.length);
  let changes = 0;
  const off = parts.onChange(() => changes++);
  parts.setVisible(root.id, false);
  assert.equal(parts.isVisible(root.id), false);
  parts.isolate([leaves[0].id]);
  assert.equal(parts.isVisible(leaves[0].id), true);
  assert.equal(parts.isVisible(leaves[1].id), false);
  parts.isolate(null);
  assert.equal(
    parts.isVisible(root.id),
    false,
    "leaving isolation restores pre-isolate hiding",
  );
  parts.showAll();
  parts.setTransparent(root.id, true);
  assert.equal(parts.meshPickable("mesh-0"), false);
  assert.equal(parts.meshVisible("mesh-0"), true);
  parts.select(leaves[0].id);
  assert.equal(parts.selected(), leaves[0].id);
  assert.equal(changes, 6);
  off();
  parts.reset(buildPartTree(viewer.root.children[0]));
  assert.equal(parts.selected(), null);
  assert.equal(parts.meshPickable("mesh-0"), true);
  assert.equal(changes, 6);
});

test("part objects are the loaded objects and bounds follow transforms in world space", async () => {
  const viewer = await load(await step("grouped-colours"), "step");
  const part = viewer.parts.list().find((p) => !p.childIds.length);
  const object = viewer.parts.object(part.id);
  assert.equal(object, viewer.meshMap.get(part.meshIds[0]));
  const before = viewer.parts.bounds(part.id);
  viewer.parts.setVisible(part.id, false);
  object.position.x += 7;
  const after = viewer.parts.bounds(part.id);
  assert.ok(
    Math.abs(after.min.x - before.min.x - 7 * viewer.root.scale.x) < 1e-6,
  );
  assert.equal(viewer.parts.bounds("missing").isEmpty(), true);
});

test("hidden and transparent meshes are excluded from ordinary and section rays", () => {
  const a = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  const b = a.clone();
  b.position.z = -3;
  const root = new THREE.Group();
  root.add(a, b);
  root.updateMatrixWorld(true);
  a.userData.reviewId = "mesh-0";
  b.userData.reviewId = "mesh-1";
  const parts = createParts();
  parts.reset(buildPartTree(root));
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    meshes: [a, b],
    parts,
    ray: new THREE.Raycaster(
      new THREE.Vector3(0, 0, 3),
      new THREE.Vector3(0, 0, -1),
    ),
  });
  const id = parts.partOfMesh("mesh-0");
  assert.equal(viewer.sectionHits()[0].object, a);
  parts.setTransparent(id, true);
  assert.equal(viewer.sectionHits()[0].object, b);
  viewer.section = { axis: "z" };
  assert.ok(viewer.sectionHits().every((hit) => hit.object === b));
  parts.setTransparent(id, false);
  parts.setVisible(id, false);
  assert.ok(viewer.sectionHits().every((hit) => hit.object === b));
});

test("STL exposes a single part and hundreds of nodes build without duplicate ids", async () => {
  const stl = Buffer.from(
    "solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid",
  );
  const viewer = await load(stl, "stl");
  assert.equal(viewer.parts.list().length, 1);
  const scene = new THREE.Scene();
  for (let i = 0; i < 500; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    mesh.userData.reviewId = `mesh-${i}`;
    scene.add(mesh);
  }
  const tree = buildPartTree(scene);
  assert.equal(tree.entries.length, 500);
  assert.equal(tree.meshParts.size, 500);
  assert.equal(new Set(tree.entries.map((p) => p.id)).size, 500);
});

test("part opacity restores source alpha through plain view and updates existing cap counters", () => {
  const material = new THREE.MeshStandardMaterial({
    opacity: 0.6,
    alphaTest: 0.4,
    transparent: true,
    depthWrite: true,
  });
  const a = new THREE.Mesh(new THREE.BoxGeometry(), material),
    b = new THREE.Mesh(a.geometry, material);
  a.userData.reviewId = "mesh-0";
  b.userData.reviewId = "mesh-1";
  const root = new THREE.Group();
  root.add(a, b);
  root.updateMatrixWorld(true);
  const counter = new THREE.Mesh();
  counter.userData.partMeshId = "mesh-0";
  const sectionCapGroup = new THREE.Group();
  sectionCapGroup.add(counter);
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    meshes: [a, b],
    meshMap: new Map([
      ["mesh-0", a],
      ["mesh-1", b],
    ]),
    partMaterials: new WeakMap(),
    sectionSides: new Map(),
    sectionCapGroup,
    clearMeasure() {},
    clearOverlay() {},
  });
  viewer.parts = createParts((kind) => viewer.updateParts(kind));
  viewer.buildParts(root);
  const id = viewer.parts.partOfMesh("mesh-0");
  assert.notEqual(a.material, b.material);
  viewer.setNeutral(true);
  viewer.parts.setTransparent(id, true);
  assert.equal(a.material.opacity, 0.18);
  assert.equal(a.material.alphaTest, 0);
  assert.equal(a.material.depthWrite, false);
  assert.equal(b.material.opacity, 0.6);
  assert.equal(counter.visible, false);
  viewer.setNeutral(false);
  viewer.setNeutral(true);
  viewer.parts.setTransparent(id, false);
  assert.equal(a.material.opacity, 0.6);
  assert.equal(a.material.alphaTest, 0.4);
  assert.equal(a.material.transparent, true);
  assert.equal(a.material.depthWrite, true);
  assert.equal(counter.visible, true);
  viewer.parts.setVisible(id, false);
  assert.equal(counter.visible, false);
  viewer.parts.showAll();
  assert.equal(counter.visible, true);
});

test("showing a child of a hidden mesh node draws only the child", () => {
  const parent = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  const child = new THREE.Mesh(parent.geometry, parent.material);
  parent.userData.reviewId = "mesh-0";
  child.userData.reviewId = "mesh-1";
  parent.add(child);
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    meshes: [parent, child],
    meshMap: new Map([
      ["mesh-0", parent],
      ["mesh-1", child],
    ]),
    partMaterials: new WeakMap(),
    clearMeasure() {},
    clearOverlay() {},
  });
  viewer.parts = createParts((kind) => viewer.updateParts(kind));
  viewer.buildParts(parent);
  viewer.parts.setVisible(viewer.parts.partOfMesh("mesh-0"), false);
  assert.equal(parent.visible, false);
  viewer.parts.setVisible(viewer.parts.partOfMesh("mesh-1"), true);
  assert.equal(parent.visible, true);
  assert.equal(parent.material.visible, false);
  assert.equal(child.visible, true);
  assert.equal(child.material.visible, true);
  assert.equal(viewer.parts.meshPickable("mesh-0"), false);
  assert.equal(viewer.parts.meshPickable("mesh-1"), true);
});
