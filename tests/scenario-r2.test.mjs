import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { importModel } from "../server/models.mjs";
import { precheckModel } from "../integration/precheck.mjs";

test("R2 bug 7: invalid STL is a format error without simplification advice", async (t) => {
  const workspace = fs.mkdtempSync(path.resolve("tmp/r2-stl-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(workspace, "invalid.stl"),
    "This is an ordinary text file, not a 3D model.\n",
  );
  const ctx = {
    workspaceDir: workspace,
    agentId: "fixture",
    sessionKey: "fixture",
    sessionId: "one",
    fsPolicy: { workspaceOnly: true },
  };
  const invalid = (e) =>
    e.code === "MODEL_FORMAT" && /STL/.test(e.message) && !e.simplify;
  await assert.rejects(
    importModel(
      { file: "invalid.stl" },
      { workspace, mediaDir: path.join(workspace, "models") },
    ),
    invalid,
  );
  assert.throws(() => precheckModel(ctx, "invalid.stl"), invalid);
});

import { startReview } from "./helpers/review-server.mjs";
import { InstanceManager } from "../integration/manager.mjs";
import crypto from "node:crypto";

test("R2 bug 9: publication names the label field and unchanged 24-character limit", async (t) => {
  const f = await startReview(t, { managed: true });
  const first = await f.publish();
  const input = {
    file: "tmp/samples/parametric-bracket.glb",
    name: "Label limit",
    version: "v2",
  };
  const accepted = await f.ipc("/publish", { ...input, label: "a".repeat(24) });
  assert.equal(accepted.status, 200);
  const refused = await f.ipc("/publish", { ...input, label: "a".repeat(25) });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /label.*24.*characters/i);
  assert.equal(refused.body.code, "ERROR");
  assert.equal((await f.ipc("/status")).body.active.id, first.id);
});

test("R2 bug 10: first summary and geometry reads return the receipt's updated batch", async (t) => {
  const origin = { harness: "codex", sessionKey: "r2", sessionId: "one" };
  const instance = {
    schema: 1,
    id: crypto.randomUUID(),
    projectId: crypto.randomBytes(16).toString("hex"),
  };
  const f = await startReview(t, { managed: true, origin, instance });
  const model = await f.publish();
  const manager = new InstanceManager(
    {
      workspaceDir: f.dir,
      agentId: "fixture",
      sessionKey: "r2",
      sessionId: "one",
    },
    { resolveOrigin: () => origin, installRoot: process.cwd() },
  );
  // Bind the real manager to this test's already-owned isolated server.
  manager.project = () => ({
    runtime: f.dir,
    project: "projects/fixture",
    id: instance.projectId,
  });
  const owner = { versionId: model.id, clientId: "r2-reader" };
  const mesh = {
    id: "mesh-0",
    name: "fixture",
    triangles: 1,
    sourceTriangles: 1,
    surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
    matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
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
  let revision = 0;
  for (const geometry of [false, true]) {
    const saved = await f.api("draft", {
      method: "PUT",
      body: {
        ...owner,
        revision,
        camera: null,
        annotations: [
          {
            id: "pin",
            type: "pin",
            label: "A",
            note: String(geometry),
            color: "#e76d5c",
            meshId: "mesh-0",
            faceIndex: 0,
            sourceFaceIndex: 0,
            position: [0, 0, 0],
            normal: [0, 1, 0],
            barycentric: [1, 0, 0],
          },
        ],
      },
    });
    assert.equal(saved.status, 200);
    revision = saved.body.revision;
    const sent = await f.api("feedback", {
      method: "POST",
      body: { ...owner, revision, submissionId: `r2-read-${geometry}` },
    });
    assert.equal(sent.status, 200);
    const input = {
      action: "read",
      project: "projects/fixture",
      submissionId: sent.body.id,
      geometry,
    };
    const result = await manager.execute(input);
    assert.equal(result.receipt.status, "read");
    assert.equal(result.submission.status, "read");
    assert.equal(result.submission.readAt, result.receipt.readAt);
    const status = await manager.execute({
      action: "status",
      project: "projects/fixture",
    });
    const batch = status.submissions.find((s) => s.id === sent.body.id);
    assert.equal(batch.readAt, result.receipt.readAt);
    assert.equal(batch.status, "read");
    assert.equal(status.outbox.pending, 0);
    assert.equal(
      (await manager.execute(input)).submission.readAt,
      result.receipt.readAt,
    );
  }
});
