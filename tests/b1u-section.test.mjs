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
