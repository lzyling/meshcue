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
  // The machine-wide default admits two runs at once (owner, 2026-10-06):
  // about 14 of 18 cores under SwiftShader. Slot 0 keeps the old file name so
  // an older checkout still waiting on it can never make a third. An explicit
  // `file` stays exclusive unless slots are asked for.
  slots = file === browserLockPath
    ? Math.max(1, Number(process.env.MESHCUE_BROWSER_SLOTS) || 2)
    : 1,
} = {}) {
  if (ci) return () => {};
  const token = crypto.randomUUID();
  const files = Array.from({ length: slots }, (_, i) =>
    i ? `${file}.${i + 1}` : file,
  );
  let lastReport = 0;
  while (true) {
    signal?.throwIfAborted();
    let reaped = false;
    for (const slot of files) {
      try {
        claimLock(slot, {
          token,
          startedAt: new Date().toISOString(),
          cwd: process.cwd(),
        });
        return () => {
          if (readLock(slot)?.token === token) fs.rmSync(slot, { force: true });
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      const owner = readLock(slot);
      if (owner && !processAlive(owner.pid) && reapDead(slot, owner))
        reaped = true;
    }
    if (reaped) continue;
    if (Date.now() - lastReport >= 5000) {
      const owner = readLock(file);
      log(
        `Waiting for browser tests: pid ${owner?.pid ?? "unknown"}, started ${owner?.startedAt ?? "unknown"}, checkout ${owner?.cwd ?? "unknown"} (${file})`,
      );
      lastReport = Date.now();
    }
    await delay(waitMs, undefined, { signal });
  }
}
