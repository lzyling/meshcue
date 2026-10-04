import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { claimLock, readLock, processAlive } from "../server/lockfile.mjs";

export const browserLockPath = path.join(
  os.tmpdir(),
  "meshcue-browser-tests.lock",
);

/* A second exclusive lock serializes stale-owner removal. Every reaper reads
   the owner again while holding it, so a delayed waiter cannot unlink a newer
   run. Reaper locks use the same recovery rule: killing a process between
   claiming the reaper and removing a stale owner must not wedge the machine. */
function reapDead(file, expected) {
  const guard = `${file}.reaper`,
    token = crypto.randomUUID();
  try {
    claimLock(guard, { token, startedAt: new Date().toISOString() });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const reaper = readLock(guard);
    if (reaper && !processAlive(reaper.pid)) reapDead(guard, reaper);
    return false;
  }
  try {
    if (JSON.stringify(readLock(file)) !== JSON.stringify(expected))
      return true;
    fs.rmSync(file, { force: true });
    return true;
  } finally {
    if (readLock(guard)?.token === token) fs.rmSync(guard, { force: true });
  }
}

export async function acquireBrowserLock({
  file = browserLockPath,
  ci = process.env.CI,
  signal,
  waitMs = 1000,
  log = console.log,
} = {}) {
  if (ci) return () => {};
  const token = crypto.randomUUID();
  let lastReport = 0;
  while (true) {
    signal?.throwIfAborted();
    try {
      claimLock(file, {
        token,
        startedAt: new Date().toISOString(),
        cwd: process.cwd(),
      });
      return () => {
        if (readLock(file)?.token === token) fs.rmSync(file, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const owner = readLock(file);
    if (owner && !processAlive(owner.pid) && reapDead(file, owner)) continue;
    if (Date.now() - lastReport >= 5000) {
      log(
        `Waiting for browser tests: pid ${owner?.pid ?? "unknown"}, started ${owner?.startedAt ?? "unknown"}, checkout ${owner?.cwd ?? "unknown"} (${file})`,
      );
      lastReport = Date.now();
    }
    await delay(waitMs, undefined, { signal });
  }
}
