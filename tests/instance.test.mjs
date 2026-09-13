import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { startReview } from "./helpers/review-server.mjs";
import {
  instanceCookieName,
  readInstance,
  INTEGRATION_API,
} from "../server/instance.mjs";
import { instanceVerdict } from "../integration/manager.mjs";

const origin = {
  harness: "openclaw",
  channel: "webchat",
  sessionKey: "instance-fixture",
};
const identity = () => ({
  schema: 1,
  id: crypto.randomUUID(),
  projectId: crypto.randomBytes(16).toString("hex"),
});

async function claim(f, cookie) {
  const admission = await f.ipc("/access/admit", { address: "127.0.0.1" });
  assert.equal(admission.status, 200);
  const result = await f.api("access/claim", {
    method: "POST",
    body: {},
    cookie,
  });
  assert.equal(result.status, 200);
  return result.headers.get("set-cookie").split(";")[0];
}

test("managed instances share a host without overwriting browser cookie namespaces or accepting another project's browser", async (t) => {
  const first = identity(),
    second = identity();
  const a = await startReview(t, {
    origin,
    instance: first,
    protectedAccess: true,
  });
  const b = await startReview(t, {
    origin,
    instance: second,
    protectedAccess: true,
  });
  await a.publish();
  await b.publish();
  const ac = await claim(a),
    bc = await claim(b);
  assert.equal(ac.startsWith(`${instanceCookieName(first)}=`), true);
  assert.equal(bc.startsWith(`${instanceCookieName(second)}=`), true);
  // A browser sends both host cookies to both ports. Each instance must select its own.
  const cookie = `${ac}; ${bc}`;
  assert.equal((await a.api("state", { cookie })).status, 200);
  assert.equal((await b.api("state", { cookie })).status, 200);
  assert.equal((await a.api("state", { cookie: bc })).status, 401);
  const forged = `${instanceCookieName(first)}=${bc.slice(bc.indexOf("=") + 1)}`;
  assert.equal((await a.api("state", { cookie: forged })).status, 401);
  await a.restart();
  assert.equal((await a.api("state", { cookie })).status, 200);
  assert.deepEqual((await a.api("health")).body.instance, first);
  assert.equal((await b.api("state", { cookie })).status, 200);
});

test("legacy browser migration is explicit, instance-local, and preserves verifiers across a process restart", async (t) => {
  const f = await startReview(t, { origin, protectedAccess: true });
  await f.publish();
  const legacy = await claim(f);
  const meta = (await f.ipc("/access/browsers")).body.browsers;
  const instance = identity();
  const config = path.join(f.dir, "config.json");
  fs.writeFileSync(config, JSON.stringify({ origin, instance }));
  await f.restart();
  assert.equal((await f.api("state", { cookie: legacy })).status, 401);
  fs.writeFileSync(
    config,
    JSON.stringify({ origin, instance, legacyCookieMigration: true }),
  );
  await f.restart();
  const result = await f.api("access/claim", {
    method: "POST",
    body: {},
    cookie: legacy,
  });
  assert.equal(result.status, 200);
  const scoped = result.headers.get("set-cookie").split(";")[0];
  assert.equal(scoped.startsWith(`${instanceCookieName(instance)}=`), true);
  const after = (await f.ipc("/access/browsers")).body.browsers;
  assert.equal(after.length, 1);
  assert.equal(after[0].id, meta[0].id);
  assert.equal(
    (await f.api("state", { cookie: `${scoped}; ${scoped}; ${legacy}` }))
      .status,
    401,
  );
});

test("explicit workspace decouples installation layout without allowing model import through escaping symlinks", async (t) => {
  const workspace = fs.mkdtempSync(
    path.join(process.cwd(), "tmp", "portable workspace "),
  );
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const f = await startReview(t, { origin, workspace, instance: identity() });
  const stl =
    "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle\n";
  fs.writeFileSync(path.join(workspace, "sample.stl"), stl);
  assert.equal(
    (
      await f.ipc("/publish", {
        file: "sample.stl",
        name: "Portable",
        version: "v1",
      })
    ).status,
    200,
  );
  const outside = path.join(f.dir, "outside.stl");
  fs.writeFileSync(outside, stl);
  fs.symlinkSync(outside, path.join(workspace, "escape.stl"));
  assert.notEqual(
    (await f.ipc("/publish", { file: "escape.stl" })).status,
    200,
  );
  assert.throws(() => readInstance({ instance: { ...identity(), schema: 2 } }));
});

test("an instance running the old contract is replaceable, not untouchable", () => {
  const mine = { id: "instance-one", projectId: "project-one" };
  const answering = (extra) => ({
    instance: { ...mine },
    integrationApi: INTEGRATION_API,
    ...extra,
  });
  assert.equal(instanceVerdict(answering(), mine, "project-one"), "ok");

  // Someone else's process, or ours pointed at another project: never read,
  // never replaced, never stopped.
  assert.equal(
    instanceVerdict(
      { instance: { id: "other", projectId: "project-one" } },
      mine,
      "project-one",
    ),
    "foreign",
  );
  assert.equal(
    instanceVerdict(answering(), mine, "another-project"),
    "foreign",
  );
  assert.equal(instanceVerdict(undefined, mine, "project-one"), "foreign");

  // Ours, answering, just older than this code can talk to. Reopening the
  // project is the documented way to swap a running server, so this must not
  // arrive wearing the verdict that forbids touching it — that combination
  // leaves a live process nothing can read, replace or stop.
  assert.equal(
    instanceVerdict(
      answering({ integrationApi: INTEGRATION_API - 1 }),
      mine,
      "project-one",
    ),
    "outdated",
  );
});
