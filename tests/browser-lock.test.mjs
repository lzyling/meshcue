import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { acquireBrowserLock } from "../scripts/browser-lock.mjs";

const fixture = (t) => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "meshcue-browser-lock-test-"),
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "lock");
};
function worker(t, file) {
  const child = fork(
    new URL("./helpers/browser-lock-worker.mjs", import.meta.url),
    [file],
    { stdio: ["ignore", "ignore", "inherit", "ipc"] },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  const messages = [];
  child.on("message", (message) => messages.push(message));
  const wait = async (key) => {
    while (!messages.some((message) => message[key]))
      await once(child, "message");
    return messages.find((message) => message[key])[key];
  };
  return { child, messages, wait };
}

test(
  "browser lock waits across processes, reports its owner and releases cleanly",
  { timeout: 10000 },
  async (t) => {
    const file = fixture(t),
      first = worker(t, file);
    await first.wait("acquired");
    const second = worker(t, file);
    assert.match(
      await second.wait("waiting"),
      new RegExp(`pid ${first.child.pid}`),
    );
    assert.equal(
      second.messages.some((m) => m.acquired),
      false,
    );
    const exited = once(first.child, "exit");
    first.child.send("release");
    await exited;
    await second.wait("acquired");
    const done = once(second.child, "exit");
    second.child.send("release");
    await done;
    assert.equal(fs.existsSync(file), false);
  },
);

test(
  "competing waiters take over a dead browser lock without overlapping",
  { timeout: 10000 },
  async (t) => {
    const file = fixture(t),
      first = worker(t, file);
    await first.wait("acquired");
    const b = worker(t, file),
      c = worker(t, file);
    await Promise.all([b.wait("waiting"), c.wait("waiting")]);
    const exited = once(first.child, "exit");
    first.child.kill("SIGKILL");
    await exited;
    const winner = await Promise.race([
      b.wait("acquired").then(() => b),
      c.wait("acquired").then(() => c),
    ]);
    const loser = winner === b ? c : b;
    assert.equal(
      loser.messages.some((m) => m.acquired),
      false,
    );
    const done = once(winner.child, "exit");
    winner.child.send("release");
    await done;
    await loser.wait("acquired");
    const final = once(loser.child, "exit");
    loser.child.send("release");
    await final;
  },
);

test("CI skips the browser lock and waiting can be cancelled", async (t) => {
  const file = fixture(t);
  const release = await acquireBrowserLock({ file, ci: "1" });
  release();
  assert.equal(fs.existsSync(file), false);
  const held = await acquireBrowserLock({ file, ci: false });
  const abort = new AbortController();
  const waiting = acquireBrowserLock({
    file,
    ci: false,
    signal: abort.signal,
    log() {},
  });
  abort.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  held();
  const dead = worker(t, file);
  await dead.wait("acquired");
  const exited = once(dead.child, "exit");
  dead.child.kill("SIGKILL");
  await exited;
  fs.writeFileSync(
    `${file}.reaper`,
    JSON.stringify({ pid: dead.child.pid, token: "dead-reaper" }),
  );
  const recovered = await acquireBrowserLock({
    file,
    ci: false,
    waitMs: 1,
    log() {},
  });
  recovered();
  assert.equal(fs.existsSync(`${file}.reaper`), false);
});

test(
  "browser lock admits as many runs as it has slots and queues the next",
  { timeout: 10000 },
  async (t) => {
    const file = fixture(t),
      abort = new AbortController(),
      quiet = { file, slots: 2, ci: false, waitMs: 10, log: () => {} };
    const first = await acquireBrowserLock(quiet),
      second = await acquireBrowserLock(quiet);
    assert.equal(fs.existsSync(file), true);
    assert.equal(fs.existsSync(`${file}.2`), true);
    let third = null;
    const waiting = acquireBrowserLock({ ...quiet, signal: abort.signal }).then(
      (release) => (third = release),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      third,
      null,
      "a third run must wait while both slots are held",
    );
    first();
    await waiting;
    assert.equal(typeof third, "function");
    second();
    third();
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(`${file}.2`), false);
  },
);
