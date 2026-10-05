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
