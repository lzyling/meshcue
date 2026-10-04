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
