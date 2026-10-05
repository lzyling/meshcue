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
