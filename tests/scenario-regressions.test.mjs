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
