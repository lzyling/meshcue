import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ModelViewer } from "../src/viewer.js";
import { buildPartTree, createParts } from "../src/viewer/parts-tree.js";

function assembly() {
  const root = new THREE.Group();
  const parent = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
  const child = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  parent.userData.reviewId = "parent";
  child.userData.reviewId = "child";
  child.position.set(3, 4, 5);
  parent.add(child);
  root.add(parent);
  const parts = createParts();
  parts.reset(buildPartTree(root));
  return { root, parent, child, parts };
}

test("parts framing uses navigation fit and Fit all excludes hidden parent surfaces in both projections", () => {
  const { root, parent, child, parts } = assembly();
  parts.setVisible(parts.partOfMesh("parent"), false);
  parts.setVisible(parts.partOfMesh("child"), true);
  // The parent must remain traversable so Three can draw its visible child.
  // Its own much larger geometry must not influence the requested framing.
  assert.equal(parts.isVisible(parts.partOfMesh("parent")), true);
  for (const orthographic of [false, true]) {
    const viewer = Object.assign(Object.create(ModelViewer.prototype), {
      root,
      meshes: [parent, child],
      parts,
      camera: orthographic
        ? new THREE.OrthographicCamera(-2, 2, 2, -2)
        : new THREE.PerspectiveCamera(38, 1),
      controls: { target: new THREE.Vector3() },
      animateNavigation(position, target, options) {
        this.frame = { position, target, ...options };
      },
    });
    viewer.camera.fov = 38;
    viewer.camera.aspect = 1;
    viewer.camera.position.set(0, 0, 10);
    const expected = new THREE.Box3().setFromObject(child);
    assert.deepEqual(viewer.visibleNavigationBounds(), expected);
    viewer.fitAll({ animate: false });
    const all = viewer.frame;
    assert.deepEqual(all.target.toArray(), [3, 4, 5]);
    viewer.fitPart(parts.partOfMesh("child"));
    assert.deepEqual(viewer.frame.position, all.position);
    assert.equal(viewer.frame.height, all.height);
    parts.setVisible(parts.partOfMesh("child"), false);
    const previous = viewer.frame;
    viewer.fitAll();
    assert.equal(viewer.frame, previous, "empty bounds leave framing intact");
    parts.setVisible(parts.partOfMesh("child"), true);
  }
});

test("part visibility changes allow an immediate label on the newly exposed surface", async () => {
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    meshes: [],
    parts: createParts(),
    lastLabelAt: { time: Date.now(), x: 20, y: 20 },
    highlightPart() {},
    clearOverlay() {},
    clearMeasure() {},
    rayAt: () => ({ object: {} }),
    pinFromHit: () => ({ meshId: "behind" }),
    onEdit: async () => true,
    ripple() {},
    onStrokeEnd() {},
    onError(message) {
      throw new Error(message);
    },
    onPin(pin) {
      this.placed = pin;
    },
  });
  viewer.updateParts("view");
  viewer.mode = "label";
  viewer.clickStart = [20, 20];
  await viewer.clickEdit({ clientX: 20, clientY: 20 });
  assert.deepEqual(viewer.placed, { meshId: "behind" });
});

function displayAssembly() {
  const data = assembly();
  const viewer = Object.assign(Object.create(ModelViewer.prototype), data, {
    meshes: [data.parent, data.child],
    meshMap: new Map([
      ["parent", data.parent],
      ["child", data.child],
    ]),
    displayStyle: "edges",
    displayEdges: [],
    previewOverlay: new THREE.Group(),
    restoreSectionSides() {},
    applySectionMaterials() {},
    updateDisplayEdgeColor() {},
    clearMeasure() {},
    clearOverlay() {},
    highlightPart() {},
  });
  for (const mesh of viewer.meshes) {
    const geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(6), 3),
    );
    const edge = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial(),
    );
    edge.userData = { feature: geometry, wire: geometry };
    mesh.add(edge);
    viewer.displayEdges.push(edge);
  }
  viewer.parts.onChange((kind) => viewer.updateParts(kind));
  viewer.applyDisplayStyle();
  return viewer;
}

test("display styles keep a hidden parent surface and its edges hidden while drawing a visible child", () => {
  const viewer = displayAssembly();
  const parent = viewer.parts.partOfMesh("parent");
  const child = viewer.parts.partOfMesh("child");
  viewer.parts.setVisible(parent, false);
  viewer.parts.setVisible(child, true);
  for (const style of ["edges", "hidden", "wireframe", "xray", "shaded"]) {
    viewer.setDisplayStyle(style);
    assert.equal(viewer.parent.visible, true);
    assert.equal(viewer.parent.material.visible, false);
    assert.equal(viewer.child.material.visible, true);
    assert.equal(viewer.displayEdges[0].visible, false);
    assert.equal(
      viewer.displayEdges[1].visible,
      ["edges", "hidden", "wireframe"].includes(style),
    );
    viewer.setNeutral(true);
    assert.equal(viewer.parent.material.visible, false);
    viewer.setNeutral(false);
  }
  viewer.parts.showAll();
  viewer.setDisplayStyle("edges");
  assert.ok(viewer.displayEdges.every((edge) => edge.visible));
  assert.ok(viewer.meshes.every((mesh) => mesh.material.visible));
});

test("part transparency composes with X-ray and restores source alpha through every display and plain-view toggle", () => {
  const viewer = displayAssembly();
  const id = viewer.parts.partOfMesh("child");
  const original = viewer.child.userData.displayOriginal;
  original.opacity = 0.7;
  original.transparent = true;
  original.alphaTest = 0.5;
  for (const style of ["edges", "hidden", "wireframe", "xray", "shaded"]) {
    viewer.setDisplayStyle(style);
    viewer.parts.setTransparent(id, true);
    for (const neutral of [true, false]) {
      viewer.setNeutral(neutral);
      const material = viewer.child.material;
      assert.ok(
        Math.abs(
          material.opacity - 0.7 * 0.18 * (style === "xray" ? 0.24 : 1),
        ) < 1e-12,
      );
      assert.equal(material.alphaTest, 0);
      assert.equal(material.depthWrite, false);
      assert.equal(viewer.parts.meshPickable("child"), false);
      if (style === "xray") {
        const shader = {
          fragmentShader:
            "#include <color_fragment>\n#include <opaque_fragment>",
        };
        material.onBeforeCompile(shader);
        assert.match(shader.fragmentShader, /displayAlpha = diffuseColor.a/);
        assert.match(shader.fragmentShader, /gl_FragColor.a = displayAlpha/);
      }
    }
    viewer.parts.setTransparent(id, false);
    viewer.setDisplayStyle("shaded");
    assert.equal(viewer.child.material.opacity, 0.7);
    assert.equal(viewer.child.material.alphaTest, 0.5);
    assert.equal(viewer.child.material.transparent, true);
    assert.equal(viewer.parts.meshPickable("child"), true);
    assert.equal(original.opacity, 0.7);
  }
  viewer.restoreDisplayMaterials();
  assert.equal(viewer.child.material, original);
});
