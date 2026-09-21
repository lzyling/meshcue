import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ModelViewer } from "../src/viewer.js";

/* The extent the agent is given for a painted region, and the space it is in.

   `load()` fits every model into a 3-unit box and centres it, so scene
   coordinates say more about the preview than about the part. A pin's position
   was already the model's own, and until 1.3.0-dev a region's four numbers were
   the preview's — the two sitting in one array under one sentence about units.
   On the 160 mm assembly this was first noticed against, a stroke covering
   3,846 mm² reported an area of 1.35, which reads as square millimetres. */

const bounds = (region, root, meshes) =>
  ModelViewer.prototype.annotationBounds.call(
    {
      root,
      meshMap: new Map(meshes),
      sourceTriangle: ModelViewer.prototype.sourceTriangle,
    },
    region,
  );

// One triangle spanning a 160 mm part: base 160, height 40, area 3,200.
const part = () => {
  const mesh = new THREE.Object3D();
  mesh.userData.fillTopology = {
    vertices: [
      [
        [-80, 0, 0],
        [80, 0, 0],
        [-80, 40, 0],
      ],
    ],
  };
  return mesh;
};

const fitted = (mesh) => {
  const root = new THREE.Object3D();
  root.add(mesh);
  // Exactly what load() does once it has measured the model.
  root.scale.setScalar(3 / 160);
  root.position.set(0, -7, 3);
  root.updateMatrixWorld(true);
  return root;
};

test("a region's extent comes back in the model's units, not the preview's", () => {
  const mesh = part();
  const out = bounds(
    {
      type: "region",
      coverage: "source-v2",
      faces: { "mesh-0": [0] },
      surfacePatches: [],
    },
    fitted(mesh),
    [["mesh-0", mesh]],
  );
  assert.equal(out.space, "model");
  assert.deepEqual(out.min, [-80, 0, 0]);
  assert.deepEqual(out.max, [80, 40, 0]);
  assert.equal(out.area, 3200);
  // The preview's answer for the same stroke, which is what it used to be.
  assert.notEqual(out.area, 3200 * (3 / 160) ** 2);
});

test("the preview's own placement does not move the extent", () => {
  const mesh = part();
  const one = bounds(
    { type: "region", faces: { "mesh-0": [0] }, surfacePatches: [] },
    fitted(mesh),
    [["mesh-0", mesh]],
  );
  const other = part();
  const root = new THREE.Object3D();
  root.add(other);
  // A different model, so a different fit: same part, same answer.
  root.scale.setScalar(3 / 900);
  root.position.set(41, 0, -2);
  root.updateMatrixWorld(true);
  assert.deepEqual(
    bounds(
      { type: "region", faces: { "mesh-0": [0] }, surfacePatches: [] },
      root,
      [["mesh-0", other]],
    ),
    one,
  );
});

test("a pin is not given an extent", () => {
  const mesh = part();
  assert.equal(
    bounds({ type: "pin", meshId: "mesh-0" }, fitted(mesh), [["mesh-0", mesh]]),
    null,
  );
});
