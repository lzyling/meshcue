import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";
import {
  agentSocketPath,
  prepareSocketDirectory,
} from "../server/instance.mjs";

test("an isolated review answers from a data directory beyond the Unix socket limit", async (t) => {
  const root = fs.mkdtempSync(path.resolve("tmp/deep-socket-"));
  const dataRoot = path.join(root, "nested-checkout-".repeat(10));
  fs.mkdirSync(dataRoot);
  // Register removal after the helper's shutdown hook; node:test runs after
  // hooks in registration order, so the runtime must survive until it exits.
  let f;
  try {
    f = await startReview(t, { dataRoot });
  } finally {
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  }
  assert.ok(Buffer.byteLength(path.join(f.dir, "agent.sock")) > 104);
  assert.equal((await f.api("health")).status, 200);
  assert.equal((await f.ipc("/status")).status, 200);
  const socket = agentSocketPath(f.dir);
  assert.ok(Buffer.byteLength(socket) < 104);
  assert.equal(fs.statSync(socket).mode & 0o777, 0o600);
  const directory = fs.statSync(path.dirname(socket));
  assert.equal(directory.mode & 0o777, 0o700);
  assert.equal(directory.uid, process.getuid());
  await f.restart();
  assert.equal((await f.ipc("/status")).status, 200);
});

test("socket paths retain short legacy locations and bound even a deep OS temp directory", (t) => {
  const runtime = fs.mkdtempSync(path.resolve("tmp/socket-path-"));
  t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
  const short = fs.mkdtempSync(path.join(os.tmpdir(), "mc-"));
  t.after(() => fs.rmSync(short, { recursive: true, force: true }));
  assert.equal(agentSocketPath(short), path.join(short, "agent.sock"));
  t.mock.method(os, "tmpdir", () =>
    path.join(runtime, "deep-temp-".repeat(20)),
  );
  const socket = agentSocketPath(runtime, { id: "fixture" });
  assert.ok(Buffer.byteLength(socket) < 104);
  prepareSocketDirectory(socket, { id: "fixture" });
  assert.equal(fs.statSync(path.dirname(socket)).mode & 0o777, 0o700);
});
