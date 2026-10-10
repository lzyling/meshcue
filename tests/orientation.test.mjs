import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import {
  previewRotation,
  canonicalBounds,
  sectionMatrix,
} from "../src/orientation.js";
import { sectionPlane, retainedPoint } from "../src/section.js";
import { startReview } from "./helpers/review-server.mjs";
import { parseArgs } from "../cli/meshcue.mjs";
import { TOOL } from "../mcp/server.mjs";
import { toolSchema } from "../integration/contract.mjs";
import { ModelViewer } from "../src/viewer.js";
const V = THREE.Vector3;
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-10);

test("all-format Z-up and optional Y-up preview transforms preserve file-space marks", () => {
  // Exercise the real serializers before (GLB identity) and after root standing.
  const mesh = new THREE.Object3D();
  mesh.userData.fillTopology = {
    vertices: [
      [
        [2, 3, 4],
        [6, 3, 4],
        [2, 8, 4],
      ],
    ],
  };
  const root = new THREE.Object3D();
  root.add(mesh);
  root.scale.setScalar(0.15);
  root.position.set(1, -2, 3);
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    root,
    meshMap: new Map([["mesh-0", mesh]]),
  });
  const pin = {
    type: "pin",
    position: [2, 3, 4],
    meshId: "mesh-0",
    faceIndex: 0,
  };
  const region = {
    type: "region",
    coverage: "source-v2",
    faces: { "mesh-0": [0] },
    surfacePatches: [],
  };
  root.updateMatrixWorld(true);
  const beforePin = viewer.serializeAnnotations([pin]);
  const beforeRegion = viewer.annotationBounds(region);
  for (const up of ["z", "y"]) {
    root.rotation.x = previewRotation(up);
    root.updateMatrixWorld(true);
    assert.deepEqual(viewer.serializeAnnotations([pin]), beforePin);
    assert.deepEqual(viewer.annotationBounds(region), beforeRegion);
    assert.equal(viewer.annotationBounds(region).space, "model");
  }
  for (const format of ["glb", "stl", "step", "stp", "gltf"]) {
    for (const up of [undefined, "z", "y"]) {
      const root = new THREE.Object3D();
      root.rotation.x = previewRotation(up);
      root.scale.setScalar(0.15);
      root.position.set(1, -2, 3);
      root.updateMatrixWorld();
      const filePoint = new V(2, 3, 4);
      const before = filePoint.clone(); // old marking frame stops short of root
      const displayed = filePoint.clone().applyMatrix4(root.matrixWorld);
      close(
        displayed.clone().applyMatrix4(root.matrixWorld.clone().invert()),
        before,
      );
      const region = filePoint
        .clone()
        .applyMatrix4(new THREE.Matrix4().makeTranslation(5, 6, 7));
      close(
        region
          .clone()
          .applyMatrix4(root.matrixWorld)
          .applyMatrix4(root.matrixWorld.clone().invert()),
        region,
      );
      const screenUp = new V(0, 1, 0).transformDirection(
        root.matrixWorld.clone().invert(),
      );
      close(screenUp, up === "y" ? new V(0, 1, 0) : new V(0, 0, 1));
      const plane = sectionPlane(
        { axis: "z", offset: 0 },
        sectionMatrix(root.matrixWorld, up),
      );
      close(plane.normal, new V(0, -1, 0));
      assert.equal(
        retainedPoint(new V(0, 1, 0).applyMatrix4(root.matrixWorld), plane),
        up !== "y",
      );
      assert.ok(format);
    }
  }
  const yBox = new THREE.Box3(new V(-1, -2, -3), new V(1, 2, 3));
  const canonical = canonicalBounds(yBox, "y");
  close(canonical.min, new V(-1, -3, -2));
  close(canonical.max, new V(1, 3, 2));
});

test("publish rejects invalid up, persists y for every format and separates identical bytes by up", async (t) => {
  const f = await startReview(t);
  for (const up of ["x", "Y", null, 1]) {
    const r = await f.ipc("/publish", {
      file: "tmp/samples/parametric-bracket.glb",
      up,
    });
    assert.equal(r.status, 400);
  }
  const stlFile = `${f.dir}/up.stl`;
  fs.writeFileSync(
    stlFile,
    "solid up\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 0 3 0\nendloop\nendfacet\nendsolid up\n",
  );
  for (const file of [
    stlFile,
    "tmp/samples/parametric-bracket.glb",
    "tests/fixtures/plate.step",
  ]) {
    const z = await f.ipc("/publish", { file });
    const y = await f.ipc("/publish", { file, up: "y" });
    assert.equal(z.status, 200);
    assert.equal(y.status, 200);
    assert.notEqual(y.body.model.id, z.body.model.id);
    assert.equal(y.body.model.sha256, z.body.model.sha256);
    assert.equal(z.body.model.up, undefined);
    assert.equal(y.body.model.up, "y");
    const again = await f.ipc("/publish", { file, up: "y" });
    assert.equal(again.body.model.id, y.body.model.id);
    assert.ok(again.body.notices.some((n) => n.code === "SAME_CONTENT_REUSED"));
    const status = (await f.ipc("/status")).body;
    assert.equal(status.active.up, "y");
    assert.equal(status.versions.find((v) => v.id === y.body.model.id).up, "y");
    assert.equal(
      status.versions.find((v) => v.id === z.body.model.id).up,
      undefined,
    );
  }
  await f.restart();
  assert.equal((await f.ipc("/status")).body.active.up, "y");

  for (const [format, file] of [
    ["GLB", "tmp/samples/parametric-bracket.glb"],
    ["STEP", "tests/fixtures/plate.step"],
  ]) {
    await t.test(
      `${format} z/y versions count shared stored files once in storage.bytes`,
      async (t) => {
        const f = await startReview(t);
        const z = await f.ipc("/publish", { file });
        const y = await f.ipc("/publish", { file, up: "y" });
        assert.equal(z.status, 200);
        assert.equal(y.status, 200);
        assert.notEqual(z.body.model.id, y.body.model.id);
        const model = z.body.model;
        assert.equal(model.filename, y.body.model.filename);
        assert.equal(model.stored, y.body.model.stored);
        const files = [model];
        if (format === "STEP") {
          assert.ok(model.mesh);
          assert.equal(model.mesh.filename, y.body.model.mesh.filename);
          assert.equal(model.mesh.stored, y.body.model.mesh.stored);
          assert.notEqual(model.filename, model.mesh.filename);
          files.push(model.mesh);
        }
        const actualBytes = files.reduce((sum, stored) => {
          const size = fs.statSync(`${f.dir}/models/${stored.filename}`).size;
          assert.equal(size, stored.bytes);
          return sum + size;
        }, 0);
        assert.ok(actualBytes > 0);
        const storage = (await f.ipc("/status")).body.storage;
        assert.equal(storage.models, 2, "models counts versions, not files");
        assert.equal(
          storage.bytes,
          actualBytes,
          "each stored file counts once",
        );
      },
    );
  }
});

test("CLI, MCP and OpenClaw expose the same optional up axis", () => {
  assert.equal(
    parseArgs(["open", "--file", "model.glb", "--up", "y"]).input.up,
    "y",
  );
  assert.deepEqual(TOOL.inputSchema.properties.up.enum, ["z", "y"]);
  const adapter = fs.readFileSync("adapters/openclaw/index.mjs", "utf8");
  assert.match(adapter, /parameters = toolSchema\("openclaw"\)/);
  assert.deepEqual(
    toolSchema("openclaw").properties.up,
    TOOL.inputSchema.properties.up,
  );
});
