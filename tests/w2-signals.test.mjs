import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";
import { primitiveGlb } from "./fixtures/primitive-glb.mjs";

test("W2 HTTP status handles no active model and STEP's viewer mesh SHA", async (t) => {
  const f = await startReview(t);
  assert.equal((await f.ipc("/status")).body.viewer, null);
  assert.equal((await f.ipc("/status")).body.openedAt, null);
  const model = await f.publish(
    "step-v1",
    "plate.step",
    undefined,
    "tests/fixtures/plate.step",
  );
  assert.notEqual(model.mesh.sha256, model.sha256);
  await f.ipc("/opened", {});
  let state = (await f.ipc("/status")).body;
  assert.equal(state.viewer.expectedSha256, model.mesh.sha256);
  assert.equal(state.viewer.loadedSinceOpen, false);
  const ready = await f.api("ready", {
    method: "POST",
    body: {
      versionId: model.id,
      clientId: "w2-step",
      sha256: model.mesh.sha256,
      meshes: [
        {
          id: "mesh-0",
          name: "step",
          triangles: model.triangles,
          sourceTriangles: model.triangles,
          surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
          matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
    },
  });
  assert.equal(ready.status, 200);
  state = (await f.ipc("/status")).body;
  assert.equal(state.viewer.loadedSinceOpen, true);
  assert.equal(state.viewer.clients, 1);
  assert.ok(
    Date.parse(state.viewer.lastLoadedAt) >= Date.parse(state.openedAt),
  );
});

test("W2 HTTP publish limit error carries precheck and changes no files or state", async (t) => {
  const f = await startReview(t);
  const file = path.join(f.dir, "lines.glb");
  fs.writeFileSync(file, primitiveGlb([{ mode: 1, count: 2 }]));
  const state = fs.readFileSync(path.join(f.dir, "state.json"), "utf8");
  const result = await f.ipc("/publish", {
    file: path.relative(process.cwd(), file),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "MODEL_LIMIT");
  assert.equal(result.body.precheck.verdict, "reject");
  assert.equal(result.body.remediation.kind, "reexport-geometry");
  assert.equal(fs.readFileSync(path.join(f.dir, "state.json"), "utf8"), state);
  assert.equal(fs.existsSync(path.join(f.dir, "models")), false);
});
