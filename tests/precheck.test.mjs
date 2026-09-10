import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { precheckModel } from "../integration/precheck.mjs";
import {
  inspectModel,
  MAX_TRIANGLES,
  MAX_BYTES,
  DEGRADE_TRIANGLES,
} from "../server/models.mjs";

const repo = process.cwd();
// Binary STL: the reader trusts the header count only when it matches the file
// length exactly, so a fixture of N triangles has to be N triangles on disk.
function binaryStl(count) {
  const buffer = Buffer.alloc(84 + count * 50);
  buffer.writeUInt32LE(count, 80);
  return buffer;
}
function setup(t) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const workspace = fs.mkdtempSync(path.join(repo, "tmp", "precheck-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const ctx = {
    workspaceDir: workspace,
    fsPolicy: { workspaceOnly: true },
    agentId: "fixture",
    sessionKey: "fixture",
    sessionId: "generation-one",
  };
  const write = (name, buffer) => {
    fs.writeFileSync(path.join(workspace, name), buffer);
    return name;
  };
  return { workspace, ctx, write };
}

test("a model with subdivision headroom passes with nothing to do", (t) => {
  const { ctx, write } = setup(t);
  const result = precheckModel(ctx, write("small.stl", binaryStl(1000)));
  assert.equal(result.verdict, "ok");
  assert.equal(result.triangles, 1000);
  assert.equal(result.simplify, null);
  assert.equal(result.limits.maxTriangles, MAX_TRIANGLES);
  assert.equal(result.limits.degradeAboveTriangles, DEGRADE_TRIANGLES);
});

test("a model past the degrade threshold still publishes but says so", (t) => {
  const { ctx, write } = setup(t);
  const count = DEGRADE_TRIANGLES + 100000;
  const result = precheckModel(ctx, write("dense.stl", binaryStl(count)));
  // Nothing rejects this model, which is the whole reason the verdict exists.
  assert.doesNotThrow(() => inspectModel(binaryStl(count), "stl"));
  assert.equal(result.verdict, "degraded");
  assert.equal(result.triangles, count);
  assert.equal(result.simplify.requiredRatio, null);
  assert.ok(result.simplify.recommendedRatio < 1);
  assert.ok(
    count * result.simplify.recommendedRatio <= DEGRADE_TRIANGLES,
    "the recommended ratio must actually land under the degrade threshold",
  );
});

test("an over-cap model reports both ratios and each one lands", (t) => {
  const { ctx, write } = setup(t);
  const count = MAX_TRIANGLES + 200000;
  const result = precheckModel(ctx, write("huge.stl", binaryStl(count)));
  assert.equal(result.verdict, "reject");
  assert.equal(result.triangles, count);
  assert.match(result.reason, new RegExp(String(count)));
  // The ratios are the entire point of measuring: applying either one has to
  // produce a model the publish path accepts, or the caller is still guessing.
  assert.ok(
    count * result.simplify.requiredRatio <= MAX_TRIANGLES,
    "requiredRatio must land inside the hard cap",
  );
  assert.ok(
    count * result.simplify.recommendedRatio <= DEGRADE_TRIANGLES,
    "recommendedRatio must land inside the degrade threshold",
  );
  assert.ok(result.simplify.recommendedRatio < result.simplify.requiredRatio);
});

test("an oversized file is judged without being read", (t) => {
  const { ctx, workspace, write } = setup(t);
  write("fat.stl", Buffer.alloc(0));
  // Sparse: precheck must decide from the stat, never by loading 80 MB.
  fs.truncateSync(path.join(workspace, "fat.stl"), MAX_BYTES + 1024);
  const result = precheckModel(ctx, "fat.stl");
  assert.equal(result.verdict, "reject");
  assert.equal(result.triangles, null);
  assert.equal(result.bytes, MAX_BYTES + 1024);
});

test("precheck refuses paths outside the workspace and writes nothing", (t) => {
  const { ctx, workspace, write } = setup(t);
  write("small.stl", binaryStl(10));
  const before = fs.readdirSync(workspace).sort();
  assert.throws(
    () => precheckModel(ctx, "../escape.stl"),
    (error) => error.code === "PATH_SCOPE",
  );
  assert.throws(
    () => precheckModel(ctx, "/etc/hosts"),
    (error) => error.code === "PATH_SCOPE",
  );
  precheckModel(ctx, "small.stl");
  // No instance, no runtime directory, no imported copy of the model.
  assert.deepEqual(fs.readdirSync(workspace).sort(), before);
});

test("a malformed model surfaces as itself, not as a sizing verdict", (t) => {
  const { ctx, write } = setup(t);
  assert.throws(
    () => precheckModel(ctx, write("broken.glb", Buffer.from("not a glb"))),
    (error) => error.code === "MODEL_FORMAT",
  );
});

test("limit errors carry the measured value, not just the cap", () => {
  assert.throws(
    () => inspectModel(binaryStl(MAX_TRIANGLES + 1), "stl"),
    (error) =>
      error.code === "MODEL_LIMIT" &&
      error.measured.triangles === MAX_TRIANGLES + 1 &&
      error.message.includes(String(MAX_TRIANGLES + 1)),
  );
});
