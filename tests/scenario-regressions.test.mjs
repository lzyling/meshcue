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
