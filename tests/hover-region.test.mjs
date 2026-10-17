import test from "node:test";
import assert from "node:assert/strict";
import { Vector3, PlaneGeometry, Matrix4 } from "three";
import {
  buildFillTopology,
  planarFaces,
  planarFacesSteps,
} from "../src/planar-fill.js";
import { faceRegion } from "../src/face-region.js";
import { NavigationMethods } from "../src/viewer/navigation.js";

function finish(walk) {
  let step,
    yields = 0;
  do {
    step = walk.next();
    if (!step.done) yields++;
  } while (!step.done);
  return { faces: step.value, yields };
}

test("incremental hover matches original flood triangle-for-triangle for every seed and spread", () => {
  // Curved, disconnected and non-manifold adjacency; deliberately not a
  // global connected-component cache: seed-relative normals change regions.
  const normals = Array.from(
    { length: 90 },
    (_, i) => new Vector3(Math.sin(i * 0.017), 0, Math.cos(i * 0.017)),
  );
  const adjacency = normals.map(() => new Set());
  for (let i = 0; i < 80; i++) {
    for (const j of [i + 1, i + 3, i + 7])
      if (j < 80) {
        adjacency[i].add(j);
        adjacency[j].add(i);
      }
  }
  const topology = { normals, adjacency };
  for (const tolerance of [-1, 0.1, 1, 6, 15, 30, 90]) {
    for (let seed = 0; seed < normals.length; seed++) {
      assert.deepEqual(
        finish(planarFacesSteps(topology, seed, tolerance)).faces,
        planarFaces(topology, seed, tolerance),
      );
    }
  }
});

test("large planar hover yields and preserves the original BFS order", () => {
  const geometry = new PlaneGeometry(10, 10, 100, 100);
  const topology = buildFillTopology(geometry, new Matrix4());
  for (const seed of [0, 10003, 19999]) {
    const result = finish(planarFacesSteps(topology, seed));
    assert.ok(result.yields > 100);
    assert.deepEqual(result.faces, planarFaces(topology, seed));
  }
  geometry.dispose();
});

test("authored STEP region retains its existing source-face fast path", () => {
  const topology = {
    normals: Array.from({ length: 8 }, () => new Vector3(0, 0, 1)),
    brep: {
      of: [0, 0, 0, 1, 1, 1, 1, 1],
      ranges: [
        [0, 2],
        [3, 7],
      ],
    },
  };
  assert.deepEqual(faceRegion(topology, 4), [3, 4, 5, 6, 7]);
});

test("clearing an unfinished hover cancels its job even before an overlay exists", () => {
  const viewer = Object.assign(new NavigationMethods(), {
    navigationHoverJob: {
      timer: setTimeout(() => assert.fail("cancelled timer ran"), 1000),
    },
    navigationHover: false,
  });
  viewer.clearNavigationHover();
  assert.equal(viewer.navigationHoverJob, null);
});

test("deferred hover publishes the exact source coordinates and shared material once", async () => {
  const { Mesh, BufferGeometry, Group, MeshBasicMaterial } =
    await import("three");
  const geometry = new PlaneGeometry(2, 2, 12, 12);
  const topology = buildFillTopology(geometry, new Matrix4());
  const mesh = new Mesh(geometry);
  mesh.userData = { fillTopology: topology, reviewId: "test" };
  const material = new MeshBasicMaterial();
  const viewer = Object.assign(new NavigationMethods(), {
    fillTolerance: 6,
    enabled: true,
    mode: "orbit",
    navigationPointer: [1, 1],
    navigationPointers: new Set(),
    meshMap: new Map([["test", mesh]]),
    previewOverlay: new Group(),
    addFaces(group, source, faces, hover) {
      assert.equal(source, mesh);
      assert.deepEqual(faces, []);
      assert.equal(hover, true);
      group.add(new Mesh(new BufferGeometry(), material));
    },
  });
  viewer.startNavigationHover(mesh, 25);
  assert.equal(viewer.previewOverlay.children.length, 0);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("hover did not finish")),
      3000,
    );
    viewer.invalidate = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const faces = planarFaces(topology, 25);
  const expected = new Float32Array(
    faces.flatMap((f) => topology.vertices[f].flat()),
  );
  const overlay = viewer.previewOverlay.children[0];
  assert.equal(viewer.previewOverlay.children.length, 1);
  assert.equal(overlay.material, material);
  assert.deepEqual(overlay.geometry.attributes.position.array, expected);
  assert.equal(viewer.navigationHoverFaces, faces.length);
  assert.equal(viewer.navigationHoverJob, null);
  overlay.geometry.dispose();
  material.dispose();
  geometry.dispose();
});

test("a dirty camera/pointer hit never publishes an obsolete deferred region", async () => {
  const geometry = new PlaneGeometry(2, 2, 8, 8);
  const mesh = {
    userData: {
      fillTopology: buildFillTopology(geometry, new Matrix4()),
      reviewId: "stale",
    },
  };
  const viewer = Object.assign(new NavigationMethods(), {
    enabled: true,
    mode: "orbit",
    navigationPointer: [1, 1],
    navigationPointers: new Set(),
    navigationHoverDirty: true,
    meshMap: new Map([["stale", mesh]]),
    addFaces() {
      assert.fail("stale hover must not be displayed");
    },
  });
  viewer.startNavigationHover(mesh, 0);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("stale job did not finish")),
      3000,
    );
    viewer.invalidate = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  assert.equal(viewer.navigationHoverJob, null);
  assert.equal(viewer.navigationHoverDirty, true);
  geometry.dispose();
});
