import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SECONDS = 1 / 3600;

test("a tab that only polls is reclaimed, is told first, and leaves the round on disk", async (t) => {
  const f = await startReview(t, {
    managed: true,
    idleHours: 3 * SECONDS,
    idleTickMs: 150,
  });
  const model = await f.publish();
  const state = path.join(f.dir, "state.json");
  const before = fs.readFileSync(state, "utf8");

  // Exactly what a forgotten tab does, at the real cadence relative to the
  // window: nothing but state polls. If polling counted, this loop would keep
  // the service alive forever and the assertion below would time out.
  let announced = null;
  for (let i = 0; i < 60 && !announced; i++) {
    const r = await f.api("state?clientId=idle-tab");
    if (r.status === 200 && r.body.closing) announced = r.body.closing;
    await delay(100);
  }
  assert.ok(announced, "the service never announced a reclaim while polling");
  assert.equal(announced.reason, "idle");

  assert.equal(
    await f.waitExit(3000),
    true,
    "the service announced a reclaim and then stayed up",
  );

  // The point of reclaiming is that it costs nothing but the URL.
  assert.equal(fs.readFileSync(state, "utf8"), before);
  assert.ok(JSON.parse(before).models[model.id]);
});

test("a reviewer who is still there is never even warned", async (t) => {
  const f = await startReview(t, {
    managed: true,
    idleHours: 2 * SECONDS,
    idleTickMs: 100,
  });
  await f.publish();

  // Four seconds spent inside a two-second window, with one gesture a second.
  for (let i = 0; i < 4; i++) {
    const r = await f.api("access/activity", {
      method: "POST",
      body: { clientId: "present-tab" },
    });
    assert.equal(r.status, 200);
    await delay(1000);
    const state = await f.api("state?clientId=present-tab");
    assert.equal(state.body.closing, undefined, `warned at second ${i + 1}`);
  }
  assert.equal(f.alive(), true);
});

test("an agent that keeps publishing keeps the round; an agent that only asks status does not", async (t) => {
  const working = await startReview(t, {
    managed: true,
    idleHours: 2 * SECONDS,
    idleTickMs: 100,
  });
  // The reviewer is asleep. Every version here is a different file, because a
  // version is its bytes — republishing the same sample would not be a new one.
  for (const [version, file] of [
    ["v1", "parametric-bracket.glb"],
    ["v2", "occlusion-check.glb"],
    ["v3", "bunny-figurine.glb"],
  ]) {
    await working.publish(version, file);
    await delay(1000);
  }
  assert.equal(working.alive(), true);
  assert.equal(
    (await working.api("state?clientId=asleep")).body.closing,
    undefined,
  );

  const watching = await startReview(t, {
    managed: true,
    idleHours: 2 * SECONDS,
    idleTickMs: 100,
  });
  await watching.publish();
  // Status is the agent looking, not the agent working. Tooling and the manager
  // both poll it; if it renewed anything, one watcher would be enough to make a
  // project immortal.
  for (let i = 0; i < 3 && watching.alive(); i++) {
    await delay(700);
    if (watching.alive())
      await watching.ipc("/status").catch(() => {
        /* reclaimed mid-poll, which is the point */
      });
  }
  assert.equal(await watching.waitExit(3000), true);
});

test("a reopen has to say so, because the reads it makes on a warm instance are not use", async (t) => {
  const f = await startReview(t, {
    managed: true,
    idleHours: 3 * SECONDS,
    idleTickMs: 150,
  });
  await f.publish();

  // Exactly what reopening an already-running project touches: ensure() probes
  // health, then asks for status. Both are reads, and neither may renew a life.
  let closing = null;
  for (let i = 0; i < 60 && !closing && f.alive(); i++) {
    await f.api("health");
    await f.ipc("/status");
    await delay(100);
    closing = (await f.api("state?clientId=warm")).body.closing || null;
  }
  assert.ok(
    closing,
    "probing health and status renewed a clock they only read",
  );
});

test("being handed to a person calls off a reclaim that was already announced", async (t) => {
  const f = await startReview(t, {
    managed: true,
    idleHours: 2 * SECONDS,
    // A window wide enough to catch the announcement and act inside it, which
    // is the race a reopen would otherwise lose: the manager can hand out an
    // address seconds before the instance behind it exits.
    idleTickMs: 1500,
  });
  await f.publish();

  let closing = null;
  for (let i = 0; i < 80 && !closing && f.alive(); i++) {
    closing = (await f.api("state?clientId=handed-over")).body.closing || null;
    if (!closing) await delay(100);
  }
  assert.ok(closing, "expected the announcement first");

  assert.equal((await f.ipc("/opened", {})).status, 200);
  const after = await f.api("state?clientId=handed-over");
  assert.equal(after.body.closing, undefined);
  assert.ok(after.body.idle.forMs < 1000, "the clock did not go back to zero");

  await delay(1600);
  assert.equal(f.alive(), true, "it closed anyway after being reopened");
});

test("reclaiming can be turned off, but only by saying zero", async (t) => {
  const f = await startReview(t, {
    managed: true,
    idleHours: 0,
    idleTickMs: 100,
  });
  await f.publish();
  await delay(1500);
  assert.equal(f.alive(), true);
  assert.equal((await f.api("state?clientId=kept")).body.closing, undefined);
});
