import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { i18nBundlePlugin } from "../scripts/i18n-bundle.mjs";

test("Bug 0: plugin dependency graph contains no top-level await", async () => {
  // esbuild checks every reachable module, including dependencies. Disabling
  // TLA models the host's script loader without executing host integrations.
  await build({
    entryPoints: ["adapters/openclaw/index.mjs"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    supported: { "top-level-await": false },
    external: ["openclaw/*"],
    plugins: [i18nBundlePlugin],
    logLevel: "silent",
  });
});

import fs from "node:fs";
import path from "node:path";
import { importModel } from "../server/models.mjs";
import { precheckModel } from "../integration/precheck.mjs";

test("Bug 5: empty GLB publication and precheck both report an invalid empty model", async (t) => {
  const workspace = fs.mkdtempSync(path.resolve("tmp/empty-model-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workspace, "empty.glb"), "");
  const ctx = {
    workspaceDir: workspace,
    fsPolicy: { workspaceOnly: true },
    agentId: "fixture",
    sessionKey: "fixture",
    sessionId: "one",
  };
  const invalidEmpty = (error) =>
    error.code === "MODEL_FORMAT" &&
    /empty|no model/i.test(error.message) &&
    !/under.*MB/i.test(error.message);
  await assert.rejects(
    importModel(
      { file: "empty.glb" },
      { workspace, mediaDir: path.join(workspace, "models") },
    ),
    invalidEmpty,
  );
  assert.throws(() => precheckModel(ctx, "empty.glb"), invalidEmpty);
});

import { startReview } from "./helpers/review-server.mjs";
import { ReviewStore } from "../server/store.mjs";

test("Bug 7: reading batches on both versions confirms the outbox through finish and restart", async (t) => {
  const f = await startReview(t, {
    managed: true,
    origin: { harness: "codex", sessionKey: "read-regression" },
  });
  const models = [
    await f.publish(),
    await f.publish("v2", "bunny-figurine.glb"),
  ];
  const mesh = {
    id: "mesh-0",
    name: "fixture",
    triangles: 1,
    sourceTriangles: 1,
    surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
    matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  for (const [i, model] of models.entries()) {
    const owner = { versionId: model.id, clientId: "read-client" };
    assert.equal(
      (
        await f.api("ready", {
          method: "POST",
          body: { ...owner, sha256: model.sha256, meshes: [mesh] },
        })
      ).status,
      200,
    );
    await f.api("review/begin", { method: "POST", body: owner });
    const draft = await f.api("draft", {
      method: "PUT",
      body: {
        ...owner,
        revision: 0,
        annotations: [
          {
            id: `pin-${i}`,
            type: "pin",
            label: "A",
            color: "#e76d5c",
            meshId: "mesh-0",
            faceIndex: 0,
            sourceFaceIndex: 0,
            position: [0, 0, 0],
            normal: [0, 1, 0],
            barycentric: [1, 0, 0],
          },
        ],
        camera: null,
      },
    });
    assert.equal(draft.status, 200);
    const sent = await f.api("feedback", {
      method: "POST",
      body: {
        ...owner,
        revision: draft.body.revision,
        submissionId: `read-batch-${i}`,
      },
    });
    assert.equal(sent.body.status, "waiting");
  }
  assert.equal((await f.ipc("/status")).body.outbox.pending, 2);
  for (const [i, model] of models.entries()) {
    const input = { submissionId: `read-batch-${i}`, versionId: model.id };
    const read = await f.ipc("/read", input);
    assert.equal(read.body.status, "read");
    assert.ok(read.body.readAt);
    assert.equal(
      read.body.deliveredAt,
      undefined,
      "reading must not invent conversation delivery",
    );
    assert.equal((await f.ipc("/read", input)).body.readAt, read.body.readAt);
    assert.equal((await f.ipc("/status")).body.outbox.pending, 1 - i);
    await f.ipc("/finish", { versionId: model.id });
  }
  await f.restart();
  assert.equal((await f.ipc("/status")).body.outbox.pending, 0);
  // Wait through two automatic drain ticks: read batches must not be retried.
  await new Promise((resolve) => setTimeout(resolve, 2200));
  for (const i of [0, 1]) {
    const item = (await f.ipc(`/submissions/read-batch-${i}`)).body;
    assert.equal(item.status, "read");
    assert.ok(!item.attempts);
  }
});

test("Bug 7: late delivery results and legacy waiting receipts cannot undo a read", (t) => {
  const dir = fs.mkdtempSync(path.resolve("tmp/read-race-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ReviewStore(dir);
  store.state.submissions.push({
    id: "batch",
    versionId: "version",
    status: "waiting",
    annotations: [],
  });
  const read = store.acknowledgeRead("batch", "version");
  assert.equal(read.status, "read");
  store.submissionStatus("batch", "stalled", {
    lastError: { message: "late failure" },
    nextAttemptAt: Date.now() + 10000,
  });
  assert.equal(read.status, "read");
  assert.equal(read.lastError, null);
  assert.equal(read.nextAttemptAt, null);
  read.status = "waiting";
  store.save();
  const reopened = new ReviewStore(dir);
  assert.equal(reopened.state.submissions[0].status, "read");
});
