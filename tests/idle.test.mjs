import test from "node:test";
import assert from "node:assert/strict";
import {
  IdleWatch,
  viewerUse,
  agentUse,
  idleMsFrom,
  IDLE_HOURS,
} from "../server/idle.mjs";

const HOUR = 3_600_000;

test("a day of polling and heartbeats does not keep a forgotten tab alive", () => {
  let time = 0;
  const watch = new IdleWatch({ idleMs: 24 * HOUR, now: () => time });
  // What an open tab that nobody is looking at actually sends: state every
  // 2.2s, the lock heartbeat every 10s. If either counted as use, the tab this
  // mechanism exists to collect would be the one tab it could never collect.
  for (const request of [
    ["GET", "/api/state"],
    ["POST", "/api/review/heartbeat"],
    ["GET", "/api/health"],
  ])
    assert.equal(viewerUse(...request), false, request.join(" "));

  for (time = 0; time < 24 * HOUR; time += 2200)
    if (viewerUse("GET", "/api/state")) watch.use();
  assert.equal(watch.tick(), "closing");
});

test("the page is told before the door closes, and a gesture inside that window keeps the round", () => {
  let time = 0;
  const watch = new IdleWatch({ idleMs: 24 * HOUR, now: () => time });

  time = 24 * HOUR - 1;
  assert.equal(watch.tick(), "active");
  assert.equal(watch.notice(), null);

  time = 24 * HOUR;
  assert.equal(watch.tick(), "closing");
  assert.deepEqual(watch.notice(), {
    reason: "idle",
    idleSince: 0,
    since: 24 * HOUR,
  });

  // The reviewer comes back while the banner is up. A warning that cannot be
  // called off is not a warning, it is a countdown with extra steps.
  assert.equal(viewerUse("POST", "/api/access/activity"), true);
  watch.use();
  assert.equal(watch.notice(), null);
  assert.equal(watch.tick(), "active");

  time += 24 * HOUR;
  assert.equal(watch.tick(), "closing");
  time += 60_000;
  assert.equal(watch.tick(), "expired");
});

test("the viewer route that looks like a person arriving is the service healing itself", () => {
  // readState() re-issues /api/ready by itself once access has to be reclaimed.
  // Counting it would let a tab that recovers in the background renew a life
  // nobody asked to renew — the exact failure this whole table exists to avoid.
  assert.equal(viewerUse("POST", "/api/ready"), false);
  // But a person opening the link is real use, and excluding /api/ready alone
  // would have lost it. The model fetch is what tells the two apart: a real
  // load asks for the bytes, the recovery path reuses the receipt it holds.
  assert.equal(
    viewerUse("GET", "/api/models/" + "a".repeat(64) + ".glb"),
    true,
  );
  assert.equal(viewerUse("GET", "/api/state"), false);

  for (const request of [
    ["POST", "/api/access/activity"],
    ["PUT", "/api/draft"],
    ["POST", "/api/feedback"],
    ["POST", "/api/review/begin"],
    ["POST", "/api/review/resume"],
    ["POST", "/api/review/finish"],
    ["POST", "/api/access/claim"],
    ["POST", "/api/access/exchange"],
  ])
    assert.equal(viewerUse(...request), true, request.join(" "));
});

test("an agent that only looks does not keep a project running", () => {
  assert.equal(agentUse("GET", "/status"), false);
  assert.equal(agentUse("GET", "/submissions"), false);
  assert.equal(agentUse("GET", "/submissions/abc"), false);
  assert.equal(agentUse("GET", "/access/browsers"), false);
  // The manager's own stop request is a write, and the one write that must not
  // read as a reason to stay.
  assert.equal(agentUse("POST", "/maintenance"), false);

  for (const route of [
    "/publish",
    "/activate",
    "/read",
    "/echo",
    "/finish",
    "/unlock",
    "/origin",
    "/access/issue",
    "/access/admit",
    "/access/revoke",
  ])
    assert.equal(agentUse("POST", route), true, route);
});

test("a day-long gap in both directions is what idle means; either side alone resets it", () => {
  let time = 0;
  const watch = new IdleWatch({ idleMs: 24 * HOUR, now: () => time });

  // The reviewer sleeps; the agent publishes the next version overnight.
  time = 23 * HOUR;
  watch.use();
  time = 46 * HOUR;
  assert.equal(watch.tick(), "active");

  // The agent goes quiet; the reviewer marks in the morning.
  time = 47 * HOUR;
  watch.use();
  time = 70 * HOUR;
  assert.equal(watch.tick(), "active");
  time = 71 * HOUR;
  assert.equal(watch.tick(), "closing");
});

test("the countdown is published continuously, so a tab that missed the warning can still tell", () => {
  let time = 0;
  const watch = new IdleWatch({ idleMs: 24 * HOUR, now: () => time });
  time = 23 * HOUR;
  assert.deepEqual(watch.report(time, 60_000), {
    forMs: 23 * HOUR,
    limitMs: 24 * HOUR,
    graceMs: 60_000,
  });
  // Reading it never moves it — a countdown its own observer resets would only
  // ever show the same number.
  assert.equal(watch.tick(time), "active");
  watch.use(time);
  assert.equal(watch.report(time).forMs, 0);
});

test("an unreadable idle setting falls back to the default, never to never", () => {
  assert.equal(idleMsFrom(undefined), IDLE_HOURS * HOUR);
  assert.equal(idleMsFrom(""), IDLE_HOURS * HOUR);
  assert.equal(idleMsFrom("nonsense"), IDLE_HOURS * HOUR);
  assert.equal(idleMsFrom(-5), IDLE_HOURS * HOUR);
  assert.equal(idleMsFrom("2"), 2 * HOUR);
  // Only an explicit zero turns it off — the one value that restores the
  // behaviour this replaced, so it has to be asked for in as many words.
  assert.equal(idleMsFrom(0), 0);
});
