import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ModelViewer } from "../src/viewer.js";
import { sourceVertexNormals } from "../src/outline.js";
import { buildFillTopology } from "../src/planar-fill.js";

// Wound into -Z, but a file can independently supply outward +Z normals.
function triangle({
  normals = true,
  indexed = false,
  side = THREE.DoubleSide,
} = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3),
  );
  if (normals)
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
    );
  if (indexed) geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side }));
  mesh.updateMatrixWorld(true);
  mesh.userData.fillTopology = buildFillTopology(geometry, mesh.matrixWorld);
  mesh.userData.echoSource = {
    normals: sourceVertexNormals(geometry),
    groups: geometry.groups.map((g) => ({ ...g })),
  };
  return mesh;
}
function viewerFor(mesh) {
  return Object.assign(Object.create(ModelViewer.prototype), {
    meshMap: new Map([["mesh-0", mesh]]),
    lineMaterials: new Map(),
    container: { getBoundingClientRect: () => ({ width: 800, height: 600 }) },
  });
}
function outline(mesh) {
  const viewer = viewerFor(mesh);
  const group = new THREE.Group();
  viewer.drawOutline(group, {
    type: "region",
    coverage: "source-v2",
    faces: { "mesh-0": [0] },
  });
  return {
    viewer,
    group,
    lift: group.children[0].geometry.getAttribute("instanceLift"),
  };
}

test("source vertex normals are kept in source order for indexed and non-indexed geometry", () => {
  for (const indexed of [false, true]) {
    const mesh = triangle({ indexed });
    assert.deepEqual([...sourceVertexNormals(mesh.geometry)], [0, 0, 1]);
    if (indexed) {
      mesh.geometry.setIndex([2, 1, 0]);
      assert.deepEqual([...sourceVertexNormals(mesh.geometry)], [0, 0, 1]);
    }
  }
});
test("missing, cancelling or invalid source normals do not invent an outward direction", () => {
  const mesh = triangle({ normals: false });
  assert.equal(sourceVertexNormals(mesh.geometry), null);
  for (const values of [
    [0, 0, 1, 0, 0, -1, 0, 0, 0],
    [NaN, 0, 1, 0, 0, 1, 0, 0, 1],
  ]) {
    mesh.geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(values, 3),
    );
    assert.deepEqual([...sourceVertexNormals(mesh.geometry)], [0, 0, 0]);
  }
});
test("an inward-wound face with outward vertex normals lifts along the normals, not the winding", () => {
  const { group, lift } = outline(triangle());
  assert.equal(group.children.length, 3);
  assert.equal(lift.count, 3);
  for (let i = 0; i < lift.count; i++) {
    assert.ok(lift.getZ(i) > 0);
    // Position is kept on the actual surface; the shader applies the lift.
    assert.equal(
      group.children[0].geometry.attributes.instanceStart.getZ(i),
      0,
    );
  }
});
test("a double-sided face without source normals relies on the eye-depth bias only", () => {
  const { lift } = outline(triangle({ normals: false }));
  assert.ok([...lift.array].every((v) => v === 0));
});
test("single-sided fallback respects the source face material, including material groups", () => {
  for (const side of [THREE.FrontSide, THREE.BackSide]) {
    const mesh = triangle({ normals: false });
    mesh.material = [
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ side }),
    ];
    mesh.userData.echoSource.groups = [
      { start: 0, count: 3, materialIndex: 1 },
    ];
    const { lift } = outline(mesh);
    assert.ok(side === THREE.FrontSide ? lift.getZ(0) < 0 : lift.getZ(0) > 0);
  }
});
test("lift normals survive a mirrored non-uniform model transform", () => {
  const mesh = triangle();
  mesh.scale.set(-2, 3, 0.5);
  mesh.rotation.y = Math.PI / 2;
  mesh.updateMatrixWorld(true);
  const { lift } = outline(mesh);
  assert.ok(lift.getX(0) > 0.0059);
  assert.ok(Math.abs(lift.getY(0)) < 1e-6 && Math.abs(lift.getZ(0)) < 1e-6);
});
test("all echo strokes keep depth testing and lift on the visible side of the surface", () => {
  const { group } = outline(triangle());
  assert.deepEqual(
    group.children.map((o) => o.renderOrder),
    [5, 6, 7],
  );
  for (const line of group.children) {
    const material = line.material;
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, false);
    const shader = { vertexShader: material.vertexShader };
    material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /attribute vec3 instanceLift/);
    assert.match(
      shader.vertexShader,
      /dot\(lift, -start\.xyz\) < 0\.0 \? -lift : lift/,
    );
    assert.match(shader.vertexShader, /start\.xyz \*= 0\.999000/);
  }
  assert.equal(group.children.at(-1).material.dashed, true);
});
