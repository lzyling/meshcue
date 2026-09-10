import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-http-topic-41",
  target: "-100000001",
  accountId: "test",
  threadId: "41",
};
const nextOrigin = {
  ...origin,
  sessionKey: "test-http-topic-42",
  threadId: "42",
};
const mesh = {
  id: "mesh-0",
  name: "isolated",
  triangles: 1,
  sourceTriangles: 1,
  surfaceAlgorithm: "midpoint-v1-edge0.07",
  matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const annotations = [
  {
    id: "pin-http",
    type: "pin",
    label: "A",
    color: "#e76d5c",
    meshId: "mesh-0",
    faceIndex: 0,
    sourceFaceIndex: 0,
    position: [0, 0, 0],
    normal: [0, 1, 0],
    barycentric: [1, 0, 0],
  },
];

test("managed outbox survives Gateway outage and service restart, and cannot redirect a later batch across /new", async (t) => {
  const frozen = { ...origin, sessionId: "fixture-generation" };
  const f = await startReview(t, { origin: frozen, managed: true });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "outbox-owner" };
  assert.equal(
    (
      await f.api("ready", {
        method: "POST",
        body: { ...owner, sha256: model.sha256, meshes: [mesh] },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.api("review/begin", { method: "POST", body: owner })).status,
    200,
  );
  const draft = await f.api("draft", {
    method: "PUT",
    body: { ...owner, revision: 0, annotations, camera: null },
  });
  const log = path.join(f.dir, "fake-gateway.json");
  fs.writeFileSync(
    log,
    JSON.stringify({ calls: [], messages: [], offline: true }),
  );
  const submitted = {
    ...owner,
    revision: draft.body.revision,
    submissionId: "outbox-batch-one",
  };
  assert.equal(
    (await f.api("feedback", { method: "POST", body: submitted })).status,
    502,
  );
  assert.equal(
    (await f.ipc("/submissions/outbox-batch-one")).body.status,
    "unconfirmed",
  );
  const payload = (item) =>
    Object.fromEntries(
      [
        "id",
        "versionId",
        "revision",
        "createdAt",
        "reviewId",
        "bindingId",
        "origin",
        "model",
        "annotations",
        "camera",
        "meshManifest",
      ].map((key) => [key, item[key]]),
    );
  const immutable = payload(
    JSON.parse(
      fs.readFileSync(
        path.join(f.dir, "submissions/outbox-batch-one.json"),
        "utf8",
      ),
    ),
  );
  await f.restart();
  const gateway = JSON.parse(fs.readFileSync(log, "utf8"));
  gateway.offline = false;
  fs.writeFileSync(log, JSON.stringify(gateway));
  let batch;
  for (let i = 0; i < 40; i++) {
    batch = (await f.ipc("/submissions/outbox-batch-one")).body;
    if (batch.status === "accepted") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(batch.status, "accepted");
  assert.deepEqual(
    payload(
      JSON.parse(
        fs.readFileSync(
          path.join(f.dir, "submissions/outbox-batch-one.json"),
          "utf8",
        ),
      ),
    ),
    immutable,
  );
  assert.equal(
    (await f.api("feedback", { method: "POST", body: submitted })).status,
    200,
  );
  let state = JSON.parse(fs.readFileSync(log, "utf8"));
  assert.equal(state.calls.filter((c) => c.method === "chat.send").length, 1);
  const send = state.calls.find((c) => c.method === "chat.send").params;
  assert.equal(send.sessionId, "fixture-generation");
  assert.equal(send.originatingThreadId, "41");
  assert.equal(send.queueMode, "collect");
  state.sessions = { [frozen.sessionKey]: "unrelated-new-task" };
  fs.writeFileSync(log, JSON.stringify(state));
  const changed = await f.api("draft", {
    method: "PUT",
    body: {
      ...owner,
      revision: draft.body.revision,
      annotations,
      camera: null,
    },
  });
  assert.equal(
    (
      await f.api("feedback", {
        method: "POST",
        body: {
          ...owner,
          revision: changed.body.revision,
          submissionId: "outbox-batch-two",
        },
      })
    ).status,
    502,
  );
  assert.equal(
    (await f.ipc("/submissions/outbox-batch-two")).body.origin.sessionId,
    "fixture-generation",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(log, "utf8")).calls.filter(
      (c) => c.method === "chat.send",
    ).length,
    1,
  );
  fs.writeFileSync(path.join(f.dir, "disabled.json"), "{}");
  assert.equal((await f.api("draft", { method: "PUT", body: {} })).status, 503);
});

test(
  "explicit real LAN listener requires authorization even when the test-only access override is off",
  { skip: !process.env.REVIEW_TEST_LAN_HOST },
  async (t) => {
    const f = await startReview(t, {
      origin,
      host: process.env.REVIEW_TEST_LAN_HOST,
    });
    const model = await f.publish();
    const status = (await f.ipc("/status")).body;
    assert.equal(status.network.lan, true);
    assert.equal(status.access.required, true);
    assert.equal((await f.api("health")).body.version, "0.4.0");
    assert.equal((await f.api(`models/${model.filename}`)).status, 401);
    const cookie = await grant(f);
    assert.equal(
      (await f.api(`models/${model.filename}`, { cookie })).status,
      200,
    );
    await createFeedback(f, model, "lan-owner", cookie);
  },
);

async function grant(f) {
  const issued = await f.ipc("/access/issue", {});
  assert.equal(issued.status, 200);
  const redeemed = await f.api("access/exchange", {
    method: "POST",
    body: { grant: issued.body.value },
  });
  assert.equal(redeemed.status, 200);
  const cookie = redeemed.headers.get("set-cookie").split(";")[0];
  assert.equal(redeemed.headers.get("set-cookie").includes("HttpOnly"), true);
  return cookie;
}

test("host-admitted TCP peer collects one HttpOnly session without URL or body credentials; spoofed peers and cross-origin claims fail", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  assert.equal(
    (await f.ipc("/access/admit", { address: "127.0.0.1" })).status,
    409,
  );
  const model = await f.publish();
  assert.equal(
    (await f.ipc("/access/admit", { address: "8.8.8.8" })).status,
    400,
  );
  assert.equal(
    (
      await f.api("access/admit", {
        method: "POST",
        body: { address: "127.0.0.1" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await f.ipc("/access/admit", { address: "192.168.1.22" })).status,
    200,
  );
  assert.equal(
    (
      await f.api("access/claim", {
        method: "POST",
        body: {},
        headers: {
          "X-Forwarded-For": "192.168.1.22",
          "X-Real-IP": "192.168.1.22",
          Forwarded: "for=192.168.1.22",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.api("access/claim", {
        method: "POST",
        body: { address: "192.168.1.22" },
      })
    ).status,
    400,
  );
  const issued = await f.ipc("/access/admit", { address: "127.0.0.1" });
  assert.equal(issued.status, 200);
  assert.deepEqual(Object.keys(issued.body).sort(), [
    "address",
    "expiresAt",
    "singleUse",
  ]);
  for (const headers of [
    { Origin: "http://evil.invalid" },
    { "Sec-Fetch-Site": "cross-site" },
    { "X-Review-Client": "" },
  ])
    assert.equal(
      (await f.api("access/claim", { method: "POST", body: {}, headers }))
        .status,
      403,
    );
  for (const route of ["access/claim/", "ACCESS/claim"])
    assert.equal(
      (await f.api(route, { method: "POST", body: {} })).status,
      401,
    );
  assert.equal((await f.api("access/claim")).status, 401);
  const claimed = await f.api("access/claim", {
    method: "POST",
    body: {},
    headers: { Origin: f.url },
  });
  assert.equal(claimed.status, 200);
  assert.deepEqual(Object.keys(claimed.body).sort(), [
    "authorized",
    "expiresAt",
  ]);
  assert.equal(claimed.headers.get("cache-control"), "no-store");
  const header = claimed.headers.get("set-cookie");
  assert.equal(
    header.includes("HttpOnly") && header.includes("SameSite=Strict"),
    true,
  );
  const cookie = header.split(";")[0];
  assert.equal(
    (await f.api("access/claim", { method: "POST", body: {} })).status,
    401,
  );
  const retained = await f.api("access/claim", {
    method: "POST",
    body: {},
    cookie,
  });
  assert.equal(retained.status, 200);
  assert.equal(retained.body.expiresAt, claimed.body.expiresAt);
  assert.equal(
    retained.headers.get("set-cookie").split(";")[0] === cookie,
    true,
  );
  assert.equal((await f.api(`models/${model.filename}`)).status, 401);
  assert.equal(
    (await f.api(`models/${model.filename}`, { cookie })).status,
    200,
  );
  assert.equal((await f.ipc("/status")).body.access.sessions, 1);
  await createFeedback(f, model, "address-owner", cookie);
  const calls = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls;
  const message = calls.find((call) => call.method === "chat.send").params
    .message;
  assert.equal(message.includes(`REVIEW_DATA_DIR='${f.dir}'`), true);
});
async function createFeedback(f, model, clientId, cookie) {
  const owner = { versionId: model.id, clientId };
  assert.equal(
    (
      await f.api("ready", {
        method: "POST",
        cookie,
        body: { ...owner, sha256: model.sha256, meshes: [mesh] },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.api("review/begin", { method: "POST", cookie, body: owner }))
      .status,
    200,
  );
  const saved = await f.api("draft", {
    method: "PUT",
    cookie,
    body: { ...owner, revision: 0, annotations, camera: null },
  });
  assert.equal(saved.status, 200);
  const body = {
    ...owner,
    revision: saved.body.revision,
    submissionId: "http-submission",
  };
  const result = await f.api("feedback", { method: "POST", cookie, body });
  assert.equal(result.status, 200);
  return { body, result };
}

test("remembered browser survives a real process restart; only activity renews it and targeted revocation preserves another browser", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  const model = await f.publish();
  const cookie = await grant(f);
  await createFeedback(f, model, "persisted-owner", cookie);
  const before = (await f.ipc("/status")).body;
  const original = before.access.browsers[0];
  const poll = await f.api("state?clientId=persisted-owner", { cookie });
  assert.equal(poll.status, 200);
  assert.equal(poll.headers.has("set-cookie"), false);
  await f.api("review/heartbeat", {
    method: "POST",
    cookie,
    body: { clientId: "persisted-owner" },
  });
  assert.equal(
    (await f.ipc("/status")).body.access.browsers[0].lastUsedAt,
    original.lastUsedAt,
  );
  const activity = await f.api("access/activity", {
    method: "POST",
    cookie,
    body: { clientId: "persisted-owner" },
  });
  assert.equal(activity.status, 200);
  const maxAge = Number(
    activity.headers.get("set-cookie").match(/Max-Age=(\d+)/)[1],
  );
  assert.ok(maxAge >= 30 * 86400 - 5 && maxAge <= 30 * 86400);
  const active = (await f.ipc("/status")).body.access.browsers[0];
  assert.ok(active.lastUsedAt > original.lastUsedAt);
  assert.equal(active.expiresAt - active.lastUsedAt, 30 * 86_400_000);
  await f.ipc("/access/admit", { address: "192.168.1.23" });
  await f.restart();
  const restored = await f.api("state?clientId=persisted-owner", { cookie });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.owned, true);
  assert.equal(restored.body.locked, true);
  assert.equal(restored.body.reviewId, before.reviewId);
  assert.equal(restored.body.draft.revision, before.draft.revision);
  const status = (await f.ipc("/status")).body;
  assert.deepEqual(status.access.browsers[0], active);
  assert.equal(status.access.grantActive, false);
  const secondCookie = await grant(f);
  assert.equal(
    (await f.ipc("/access/revoke", { browserId: active.id })).status,
    200,
  );
  assert.equal((await f.api("state", { cookie })).status, 401);
  assert.equal((await f.api("state", { cookie: secondCookie })).status, 200);
  await f.restart();
  assert.equal((await f.api("state", { cookie })).status, 401);
  assert.equal((await f.api("state", { cookie: secondCookie })).status, 200);
  assert.equal((await f.ipc("/status")).body.locked, true);
});

test("real HTTP submission preserves explicit topic route and does not route old retries to a newly bound topic", async (t) => {
  const f = await startReview(t, { origin });
  const model = await f.publish();
  const { body, result } = await createFeedback(f, model, "client-http");
  assert.equal(result.body.status, "accepted");
  assert.equal(!!result.body.deliveredAt, true);
  assert.equal(result.body.readAt, undefined);
  const log = () =>
    JSON.parse(fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"));
  const send = log().calls.find((c) => c.method === "chat.send").params;
  assert.equal(send.deliver, true);
  assert.equal(send.originatingThreadId, "41");
  assert.equal(send.originatingTo, origin.target);
  assert.equal(send.originatingAccountId, "test");
  assert.equal(send.message.includes("不要發 Telegram"), false);
  assert.equal((await f.ipc("/origin", { origin: nextOrigin })).status, 423);
  assert.equal(
    (
      await f.api("review/finish", {
        method: "POST",
        body: { versionId: model.id, clientId: body.clientId },
      })
    ).status,
    200,
  );
  assert.equal((await f.ipc("/origin", { origin: nextOrigin })).status, 200);
  assert.equal((await f.api("feedback", { method: "POST", body })).status, 200);
  assert.equal(log().calls.filter((c) => c.method === "chat.send").length, 1);
  const old = await f.ipc(`/submissions/${body.submissionId}`);
  assert.equal(old.body.origin.threadId, "41");
});

test("HTTP authorization protects models and writes, enforces client ownership, and expires on origin change", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  const model = await f.publish();
  for (const route of [
    "state?full=1",
    `models/${model.filename}`,
    `download/${model.filename}`,
    "submissions/missing",
  ])
    assert.equal((await f.api(route)).status, 401);
  assert.equal((await f.api("draft", { method: "PUT", body: {} })).status, 401);
  assert.equal((await f.api("health")).status, 200);
  // Express must not match a different casing/slash form behind path guards.
  for (const route of ["State?full=1", "../API/state?full=1"])
    assert.equal((await f.api(route)).body?.active, undefined);
  const cookie = await grant(f);
  const data = await f.api(`models/${model.filename}`, { cookie });
  assert.equal(data.status, 200);
  assert.equal(data.headers.get("cache-control"), "private, no-store");
  assert.equal(
    (await f.api("state", { cookie, headers: { Host: "untrusted.test" } }))
      .status,
    421,
  );
  assert.equal(
    (
      await f.api("review/heartbeat", {
        cookie,
        method: "POST",
        body: { clientId: "test-client" },
        headers: { Origin: "http://untrusted.test" },
      })
    ).status,
    403,
  );
  const { body } = await createFeedback(f, model, "client-owner", cookie);
  const otherCookie = await grant(f);
  assert.equal(
    (
      await f.api("review/heartbeat", {
        cookie: otherCookie,
        method: "POST",
        body: { clientId: body.clientId },
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.api(`state?clientId=${body.clientId}`, { cookie: otherCookie }))
      .body.owned,
    false,
  );
  assert.equal(
    (
      await f.api("review/heartbeat", {
        cookie,
        method: "POST",
        body: { clientId: body.clientId },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.api("review/finish", {
        cookie,
        method: "POST",
        body: { versionId: model.id, clientId: body.clientId },
      })
    ).status,
    200,
  );
  assert.equal((await f.ipc("/origin", { origin: nextOrigin })).status, 200);
  assert.equal((await f.api("state", { cookie })).status, 401);
  const newCookie = await grant(f);
  assert.equal(
    (await f.api(`submissions/${body.submissionId}`, { cookie: newCookie }))
      .status,
    404,
  );
  assert.equal(
    (await f.api("feedback", { cookie: newCookie, method: "POST", body }))
      .status,
    403,
  );
  for (const route of ["feedback/", "Feedback"])
    assert.equal(
      (await f.api(route, { cookie: newCookie, method: "POST", body })).status,
      404,
    );
  for (const route of [
    `Submissions/${body.submissionId}`,
    `submissions/${body.submissionId}/`,
  ])
    assert.equal(
      (await f.api(route, { cookie: newCookie })).body?.annotations,
      undefined,
    );
  assert.equal(
    (
      await f.ipc("/read", {
        submissionId: body.submissionId,
        versionId: model.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.ipc("/echo", {
        submissionId: body.submissionId,
        versionId: model.id,
        summary: "stale prior-topic echo",
        annotations: [],
      })
    ).status,
    404,
  );
  assert.equal(
    (await f.api("state?full=1", { cookie: newCookie })).body.draft.annotations
      .length,
    0,
  );
  assert.equal(
    (await f.api("state?full=1", { cookie: newCookie })).body.draft
      .submittedRevision,
    null,
  );
});

test("a crash-truncated instance lock does not permanently block startup, and a live one still does", async (t) => {
  const f = await startReview(t);
  const model = await f.publish();
  const lock = path.join(f.dir, "instance.lock");
  const live = JSON.parse(fs.readFileSync(lock, "utf8"));
  assert.equal(live.pid > 0, true);

  // A second process must still refuse while the first one is running.
  assert.throws(
    () => fs.writeFileSync(lock, "{}", { flag: "wx" }),
    { code: "EEXIST" },
    "the live lock is not exclusive",
  );

  // Crashing between creating and filling the lock used to leave a zero-byte
  // file that made every later start throw before any handler could run.
  await f.restart(() => fs.writeFileSync(lock, ""));
  const health = (await f.api("health")).body;
  assert.equal(health.ok, true);
  assert.equal(health.pid !== live.pid, true);
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).pid, health.pid);
  // Recovery must not have disturbed the review the service was holding.
  assert.equal((await f.api("state")).body.active.id, model.id);
});
