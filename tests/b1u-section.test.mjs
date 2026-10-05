import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as section from "../src/section.js";
import { buildFillTopology } from "../src/planar-fill.js";
import { buildPartTree, createParts } from "../src/viewer/parts-tree.js";

function assembly(geometries) {
  const root = new THREE.Group();
  const meshes = geometries.map((geometry, i) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.userData.reviewId = `mesh-${i}`;
    mesh.userData.fillTopology = buildFillTopology(geometry, mesh.matrixWorld);
    root.add(mesh);
    return mesh;
  });
  const parts = createParts();
  parts.reset(buildPartTree(root));
  return { meshes, parts };
}

test("section counts closed parts independently and keeps legacy open face shells together", () => {
  const { meshes, parts } = assembly([
    new THREE.BoxGeometry(),
    new THREE.BoxGeometry(),
    new THREE.PlaneGeometry(),
    new THREE.PlaneGeometry(),
  ]);
  const groups = section.sectionPartGroups(meshes, parts);
  assert.deepEqual(
    groups.map((g) => g.meshes.length),
    [1, 1, 2],
  );
  assert.equal(groups[0].id, parts.partOfMesh("mesh-0"));
  // Visibility is applied to the counters, never to the stable grouping/order.
  parts.setVisible(groups[0].id, false);
  assert.deepEqual(section.sectionPartGroups(meshes, parts), groups);
});

test("section uses darkened source colours or a stable palette for similar and plain parts", () => {
  const source = [new THREE.Color("#dd7855"), new THREE.Color("#48b890")];
  const colours = section.sectionPartColors(source, false);
  assert.ok(Math.abs(colours[0].r - source[0].r * 0.68) < 1e-8);
  const same = [source[0], source[0].clone()];
  const palette = section.sectionPartColors(same, false);
  assert.notEqual(palette[0].getHexString(), palette[1].getHexString());
  assert.deepEqual(section.sectionPartColors(source, true), palette);
});

test("section cap quads are bounded per part instead of repainting the whole assembly", async () => {
  const { SectionViewMethods } = await import("../src/viewer/section-view.js");
  const { meshes, parts } = assembly([
    new THREE.BoxGeometry(),
    new THREE.BoxGeometry(),
  ]);
  // Source topology stays simple even when the review mesh is subdivided.
  meshes[0].geometry = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  meshes[1].position.x = 100;
  meshes[1].updateMatrixWorld();
  const viewer = Object.assign(new SectionViewMethods(), {
    meshes,
    parts,
    root: new THREE.Group(),
    sectionCapGroup: new THREE.Group(),
    sectionBounds: new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(101, 1, 1),
    ),
    renderer: { getPixelRatio: () => 1 },
  });
  viewer.buildSectionCaps();
  const counter = viewer.sectionCapGroup.children.find(
    (c) => c.userData.partMeshId === "mesh-0",
  );
  assert.equal(counter.geometry.attributes.position.count, 36);
  assert.notEqual(counter.geometry, meshes[0].geometry);
  for (const cap of viewer.sectionCaps)
    assert.ok(cap.scale.x * cap.geometry.parameters.width < 2);
  const materials = viewer.sectionCaps.map((c) => c.material);
  let disposed = 0;
  for (const m of materials) m.addEventListener("dispose", () => disposed++);
  viewer.disposeSectionCaps();
  assert.equal(disposed, 2);
  assert.equal(viewer.sectionCapGroup.children.length, 0);
});

test("large sections share at most ten palette counters without splitting a part's meshes", () => {
  const groups = Array.from({ length: 50 }, (_, i) => ({
    id: `part-${i}`,
    meshes: [{ id: i }],
  }));
  const batches = section.sectionCapBatches(groups);
  assert.equal(batches.length, 10);
  assert.deepEqual(
    batches[0].meshes.map((m) => m.id),
    [0, 10, 20, 30, 40],
  );
  assert.equal(batches[0].palette, true);
  assert.equal(section.sectionCapBatches(groups.slice(0, 32)).length, 32);
});
