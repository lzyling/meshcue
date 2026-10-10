import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  InstanceManager,
  ipc,
  pauseRegistered,
  resumeRegistered,
} from "../integration/manager.mjs";
import {
  HOST_CONTEXT,
  contextSummary,
  trustedOrigin,
  workspaceContext,
} from "../integration/context.mjs";
import { ReviewStore } from "../server/store.mjs";
import { OpenClawBridge } from "../server/bridge.mjs";

// The manager hands its own environment to the service it starts, so this
// reaches every instance these cases open: no suite talks to the internet.
process.env.REVIEW_UPDATE_CHECK = "off";

const repo = process.cwd();
const stl =
  "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";
const origin = {
  harness: "openclaw",
  sessionKey: "fixture",
  sessionId: "generation-one",
  channel: "webchat",
};
test("future data schema fails closed without rewriting state", (t) => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "future-state-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const text = JSON.stringify({
    schemaVersion: 900,
    untouched: "future payload",
  });
  fs.writeFileSync(path.join(dir, "state.json"), text);
  assert.throws(
    () => new ReviewStore(dir),
    (error) => error.code === "STATE_VERSION",
  );
  assert.equal(fs.readFileSync(path.join(dir, "state.json"), "utf8"), text);
});
function setup(t) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const workspace = fs.mkdtempSync(
    path.join(repo, "tmp", "managed workspace "),
  );
  fs.mkdirSync(path.join(workspace, "web"));
  fs.writeFileSync(
    path.join(workspace, "web/index.html"),
    "<!doctype html><title>fixture</title>",
  );
  fs.writeFileSync(path.join(workspace, "part.stl"), stl);
  fs.writeFileSync(
    path.join(workspace, "openclaw.plugin.json"),
    JSON.stringify({ id: "meshcue" }),
  );
  // Every real install has one, and it is what says the install is still there.
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "meshcue" }),
  );
  const ctx = {
    workspaceDir: workspace,
    fsPolicy: { workspaceOnly: true },
    agentId: "fixture",
    sessionKey: origin.sessionKey,
    sessionId: origin.sessionId,
    messageChannel: "webchat",
  };
  const options = {
    installRoot: workspace,
    serverEntry: path.join(repo, "server/index.mjs"),
    distRoot: path.join(workspace, "web"),
    environment: { REVIEW_BRIDGE: "off" },
  };
  const manager = new InstanceManager(ctx, options);
  const projects = [];
  t.after(async () => {
    for (const project of projects) {
      try {
        const p = manager.project(project);
        const lock = JSON.parse(
          fs.readFileSync(path.join(p.runtime, "instance.lock"), "utf8"),
        );
        process.kill(lock.pid, "SIGTERM");
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 120));
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  async function open(project, args = {}) {
    projects.push(project);
    return manager.execute({
      action: "open",
      project,
      file: "part.stl",
      host: "127.0.0.1",
      confirmedClientAddress: "127.0.0.1",
      ...args,
    });
  }
  return { workspace, ctx, manager, options, open };
}

test("trusted Telegram context normalizes encoded destinations and refuses missing or mismatched routes", () => {
  const ctx = {
    sessionKey: "agent:fixture:telegram:group:-100000001:topic:41",
    sessionId: "generation-one",
    deliveryContext: {
      channel: "telegram",
      to: "telegram:-100000001:topic:41",
      accountId: "test",
      threadId: 41,
    },
  };
  assert.deepEqual(trustedOrigin(ctx), {
    harness: "openclaw",
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
    route: {
      channel: "telegram",
      target: "-100000001",
      accountId: "test",
      threadId: "41",
    },
  });
  assert.throws(
    () => trustedOrigin({ ...ctx, sessionId: undefined }),
    /session generation/,
  );
  assert.throws(
    () =>
      trustedOrigin({
        ...ctx,
        deliveryContext: { ...ctx.deliveryContext, threadId: 42 },
      }),
    /inconsistent/,
  );
});

test("a host supplying only the required context runs a full round, and each missing requirement is named alone", async (t) => {
  const f = setup(t);
  // The policy object is built alongside the host's own file tools, so a host
  // that builds none supplies none. That is the claude-cli shape.
  const { fsPolicy: _unsupplied, ...lean } = f.ctx;
  assert.equal(contextSummary(lean).fsPolicy, false);
  fs.mkdirSync(path.join(f.workspace, "projects"), { recursive: true });
  const manager = new InstanceManager(lean, f.options);
  // The identity a review is filed under cannot depend on the optional field,
  // or relaxing it would strand every existing review behind a new id.
  assert.equal(
    manager.project("projects/lean", true).id,
    f.manager.project("projects/lean").id,
  );
  const opened = await manager.execute({
    action: "open",
    project: "projects/lean",
    file: "part.stl",
    host: "127.0.0.1",
    confirmedClientAddress: "127.0.0.1",
  });
  try {
    assert.ok(opened.url);
    assert.equal(
      (await manager.execute({ action: "status", project: "projects/lean" }))
        .project,
      "projects/lean",
    );
    // Containment does not widen with the policy gone: the workspace root stands.
    const outside = fs.mkdtempSync(path.join(repo, "tmp", "lean-outside-"));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.symlinkSync(outside, path.join(f.workspace, "projects/lean-escape"));
    await assert.rejects(
      manager.execute({
        action: "open",
        project: "projects/lean-escape",
        file: "part.stl",
        host: "127.0.0.1",
        confirmedClientAddress: "127.0.0.1",
      }),
      /symlink/,
    );
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    await manager.execute({ action: "stop", project: "projects/lean" });
  }
  // A field the table calls required must be refused on its own terms and named
  // on its own; a requirement added there without a case here fails here first.
  const withoutField = {
    workspace: (ctx) => ({ ...ctx, workspaceDir: undefined }),
    agent: (ctx) => ({ ...ctx, agentId: undefined }),
    sessionKey: (ctx) => ({ ...ctx, sessionKey: undefined }),
    sessionGeneration: (ctx) => ({ ...ctx, sessionId: undefined }),
  };
  const guarded = HOST_CONTEXT.filter((field) =>
    ["workspace", "owner"].includes(field.need),
  );
  assert.deepEqual(
    guarded.map((field) => field.key).sort(),
    Object.keys(withoutField).sort(),
  );
  for (const field of guarded) {
    const workspaceGuard = field.need === "workspace";
    assert.throws(
      () =>
        (workspaceGuard ? workspaceContext : trustedOrigin)(
          withoutField[field.key](lean),
        ),
      (error) => {
        assert.equal(
          error.code,
          workspaceGuard ? "MISSING_CONTEXT" : "MISSING_ORIGIN",
        );
        assert.match(error.message, new RegExp(field.key));
        for (const other of guarded)
          if (other !== field)
            assert.doesNotMatch(error.message, new RegExp(other.key));
        return true;
      },
    );
  }
});

test("concurrent prepare is idempotent; independent projects persist identity and do not move occupied ports", async (t) => {
  const f = setup(t);
  const [a, same, b] = await Promise.all([
    f.open("projects/a"),
    f.open("projects/a"),
    f.open("projects/b"),
  ]);
  assert.equal(a.url, same.url);
  assert.equal(a.instanceId, same.instanceId);
  assert.notEqual(a.url, b.url);
  assert.notEqual(a.instanceId, b.instanceId);
  assert.equal(
    (await f.manager.execute({ action: "stop", project: "projects/a" }))
      .stopped,
    true,
  );
  const hijack = http.createServer((_req, res) => res.end("not MeshCue"));
  await new Promise((r) =>
    hijack.listen(Number(new URL(a.url).port), "127.0.0.1", r),
  );
  t.after(() => hijack.close());
  await assert.rejects(
    f.open("projects/a"),
    (error) => error.code === "START_FAILED",
  );
  assert.equal(hijack.listening, true);
  await new Promise((r) => hijack.close(r));
  const resumed = await f.open("projects/a");
  assert.equal(resumed.url, a.url);
  assert.equal(resumed.instanceId, a.instanceId);
  assert.equal(
    (await f.manager.execute({ action: "status", project: "projects/b" }))
      .active.id,
    b.active.id,
  );
});

test("/new requires explicit continuation and retains locked draft plus browser scope; another topic cannot take a busy review", async (t) => {
  const f = setup(t);
  await f.open("projects/a");
  const p = f.manager.project("projects/a");
  const config = JSON.parse(
    fs.readFileSync(path.join(p.runtime, "config.json"), "utf8"),
  );
  const state = await f.manager.execute({
    action: "status",
    project: "projects/a",
  });
  const browserScope = state.access.scope;
  const next = new InstanceManager(
    { ...f.ctx, sessionId: "generation-two" },
    f.options,
  );
  await assert.rejects(
    next.execute({ action: "open", project: "projects/a" }),
    (e) => e.code === "RESUME_REQUIRED",
  );
  await next.execute({ action: "open", project: "projects/a", resume: true });
  const after = await next.execute({ action: "status", project: "projects/a" });
  assert.equal(after.origin.sessionId, "generation-two");
  assert.equal(after.access.scope, browserScope);
  assert.equal(after.reviewId, state.reviewId);
  assert.equal(
    (await ipc(p.runtime, config.instance, "/status")).origin.sessionId,
    "generation-two",
  );
  // ReviewStore covers a busy explicit continuation without letting another
  // topic take the project: continuing the same conversation keeps the marking
  // in place, while a different one must wait for it to be handed over.
  const storeDir = path.join(f.workspace, "store-fixture");
  const store = new ReviewStore(storeDir, { legacyOrigin: origin });
  const model = { id: "busy-model", version: "v1", sha256: "c".repeat(64) };
  store.publish(model);
  store.acquire(model.id, "owner");
  store.updateDraft({
    versionId: model.id,
    clientId: "owner",
    revision: 0,
    annotations: [{ type: "pin", id: "p", label: "A" }],
    camera: null,
  });
  const before = structuredClone(store.state.drafts[model.id]);
  store.bindOrigin(
    { ...origin, sessionId: "generation-two" },
    { resumeGeneration: true },
  );
  assert.deepEqual(store.state.drafts[model.id], before);
  assert.equal(store.state.presence[model.id].clientId, "owner");
  assert.throws(
    () =>
      store.bindOrigin(
        { ...origin, sessionKey: "other-topic" },
        { resumeGeneration: true },
      ),
    /marking/,
  );
});

test("maintenance fences new writes; marking right now blocks shutdown but an unfinished round does not", async (t) => {
  const f = setup(t);
  const opened = await f.open("projects/a");
  const p = f.manager.project("projects/a");
  const config = JSON.parse(
    fs.readFileSync(path.join(p.runtime, "config.json"), "utf8"),
  );
  // Someone marking at this moment is worth interrupting for.
  await assert.rejects(
    f.manager.stopOwned(p, config, { locked: true }),
    (e) => e.code === "REVIEW_BUSY",
  );
  // An unfinished round is not: the draft is durable and keyed by version, so
  // a restart costs a reload. Refusing here is what made an unfinishable round
  // block the upgrade that would have fixed it.
  await assert.rejects(
    f.manager.stopOwned(p, config, {
      locked: false,
      draft: { annotations: [], submittedRevision: 1, revision: 2 },
    }),
    (e) => e.code !== "REVIEW_BUSY",
  );
  assert.equal(
    (await f.manager.execute({ action: "status", project: "projects/a" }))
      .active.id,
    opened.active.id,
  );
  await ipc(p.runtime, config.instance, "/maintenance", {
    instanceId: config.instance.id,
  });
  assert.equal(
    (await fetch(`${opened.url}api/draft`, { method: "PUT" })).status,
    503,
  );
  await ipc(p.runtime, config.instance, "/maintenance", {
    instanceId: config.instance.id,
    release: true,
  });
  assert.notEqual(
    (await fetch(`${opened.url}api/draft`, { method: "PUT" })).status,
    503,
  );
});

test("fresh-process disable skips a stale registration and still pauses other projects", async (t) => {
  const f = setup(t);
  await f.open("projects/a");
  const b = await f.open("projects/b");
  const file = path.join(f.workspace, "projects/meshcue-state/registry.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  const a = Object.values(registry.projects).find(
    (p) => p.project === "projects/a",
  );
  fs.writeFileSync(
    path.join(f.workspace, a.runtime, "config.json"),
    JSON.stringify({ instance: { id: "someone-else" } }),
  );
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), [
    "projects/a",
  ]);
  assert.equal(
    (await fetch(`${b.url}api/draft`, { method: "PUT" })).status,
    503,
  );
});

/* Nothing ever removed an entry, so a project folder deleted by hand stayed
   registered for good: every Gateway start and stop warned about it by name and
   counted it as unavailable. Gone is not unavailable -- there is nothing left
   to pause -- and the next open drops it. */
test("a registered project whose folder is gone is passed over, then dropped", async (t) => {
  const f = setup(t);
  await f.open("projects/a");
  const b = await f.open("projects/b");
  const file = path.join(f.workspace, "projects/meshcue-state/registry.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.values(registry.projects).find(
    (p) => p.project === "projects/a",
  ).runtime = "projects/removed/.meshcue";
  const foreign = {
    project: "projects/elsewhere",
    runtime: "projects/also-removed/.meshcue",
    instanceId: "x",
    agentId: "main",
    installRoot: "/somewhere/else/meshcue",
  };
  registry.projects.foreign = foreign;
  fs.writeFileSync(file, JSON.stringify(registry));
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), []);
  assert.equal(
    (await fetch(`${b.url}api/draft`, { method: "PUT" })).status,
    503,
  );
  assert.deepEqual(resumeRegistered(f.workspace, f.options.installRoot), []);

  await f.open("projects/c");
  const after = JSON.parse(fs.readFileSync(file, "utf8")).projects;
  assert.deepEqual(
    Object.values(after)
      .map((p) => p.project)
      .sort(),
    ["projects/b", "projects/c", "projects/elsewhere"],
  );
  // Another install's entry is left for that install, gone or not.
  assert.deepEqual(after.foreign, foreign);
});

// The host reports a Gateway shutdown as a disable, so every restart paused the
// live review and left lifting it to an Agent action the reviewer had to ask
// for. Coming back is itself the proof that the extension is enabled.
test("a registration after a shutdown-shaped disable resumes the paused projects", async (t) => {
  const f = setup(t);
  const opened = await f.open("projects/a");
  const other = await f.open("projects/b");
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), []);
  assert.equal(
    (await fetch(`${opened.url}api/draft`, { method: "PUT" })).status,
    503,
  );
  assert.deepEqual(resumeRegistered(f.workspace, f.options.installRoot), []);
  for (const instance of [opened, other])
    assert.notEqual(
      (await fetch(`${instance.url}api/draft`, { method: "PUT" })).status,
      503,
    );
  for (const project of ["projects/a", "projects/b"])
    assert.equal(
      fs.existsSync(
        path.join(f.manager.project(project).runtime, "disabled.json"),
      ),
      false,
    );
});

// Resuming is scoped exactly like pausing: another MeshCue install's projects
// are not this install's to un-pause, however stale their marker looks.
test("resume leaves projects registered to another install root paused", async (t) => {
  const f = setup(t);
  const opened = await f.open("projects/a");
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), []);
  const file = path.join(f.workspace, "projects/meshcue-state/registry.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const item of Object.values(registry.projects))
    item.installRoot = "/somewhere/else/meshcue";
  fs.writeFileSync(file, JSON.stringify(registry));
  assert.deepEqual(resumeRegistered(f.workspace, f.options.installRoot), []);
  assert.equal(
    (await fetch(`${opened.url}api/draft`, { method: "PUT" })).status,
    503,
  );
});

// A pause plus an unfinished round used to be inescapable: the paused instance
// refused the submit that would end the round, and the unended round refused the
// upgrade that would lift the pause.
test("a refused upgrade still lifts the pause, so the blocking review can be finished", async (t) => {
  const f = setup(t);
  const opened = await f.open("projects/a");
  const p = f.manager.project("projects/a");
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), []);
  assert.equal(fs.existsSync(path.join(p.runtime, "disabled.json")), true);
  assert.equal(
    (await fetch(`${opened.url}api/draft`, { method: "PUT" })).status,
    503,
  );
  // Report the exact shape the deadlock needs: a release this instance is not
  // running, plus a round the user has not submitted. stopOwned refuses on the
  // busy check before it touches the process.
  f.manager.status = async () => ({
    releaseId: "a-release-this-instance-does-not-run",
    locked: true,
    draft: {
      annotations: [{ type: "pin" }],
      submittedRevision: null,
      revision: 3,
    },
  });
  await assert.rejects(
    f.manager.execute({ action: "open", project: "projects/a" }),
    (e) => e.code === "REVIEW_BUSY",
  );
  assert.equal(fs.existsSync(path.join(p.runtime, "disabled.json")), false);
  assert.notEqual(
    (await fetch(`${opened.url}api/draft`, { method: "PUT" })).status,
    503,
  );
});

test("filesystem boundary rejects escaping symlinks and narrow-scope creation before writing", async (t) => {
  const f = setup(t);
  fs.mkdirSync(path.join(f.workspace, "projects"));
  const outside = fs.mkdtempSync(path.join(repo, "tmp", "outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(f.workspace, "projects/escape"));
  await assert.rejects(f.open("projects/escape"), /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.mkdirSync(path.join(f.workspace, "projects/allowed"));
  const narrow = new InstanceManager(
    {
      ...f.ctx,
      fsPolicy: {
        workspaceOnly: true,
        root: path.join(f.workspace, "projects/allowed"),
      },
    },
    f.options,
  );
  await assert.rejects(
    narrow.execute({
      action: "open",
      project: "projects/disallowed",
      file: "part.stl",
    }),
    /permission/,
  );
  assert.equal(
    fs.existsSync(path.join(f.workspace, "projects/disallowed")),
    false,
  );
});

test("async bridge fences admission to the frozen generation and rejects unavailable host CAS", async () => {
  const bridge = new OpenClawBridge(origin);
  const calls = [];
  bridge.call = async (method, params) => {
    calls.push({ method, params });
    return method === "chat.history"
      ? {
          sessionId: origin.sessionId,
          sessionInfo: { activeLeafEntryId: "leaf-42" },
        }
      : { runId: "accepted" };
  };
  await bridge.send("test", "batch-1");
  assert.deepEqual(calls[1].params, {
    sessionKey: origin.sessionKey,
    deliver: false,
    sessionId: origin.sessionId,
    expectedLeafEntryId: "leaf-42",
    queueMode: "collect",
    message: "test",
    idempotencyKey: "batch-1",
  });
  bridge.call = async (method) => {
    assert.equal(method, "chat.history");
    return {
      sessionId: "replacement",
      sessionInfo: { activeLeafEntryId: "leaf-43" },
    };
  };
  await assert.rejects(bridge.send("test", "batch-1"), /originating session/);
  bridge.call = async (method) => {
    assert.equal(method, "chat.history");
    return { sessionId: origin.sessionId };
  };
  await assert.rejects(bridge.send("test", "batch-1"), /host could not verify/);
});

// Choosing what the reviewer is looking at is presentation, and presentation is
// the Agent's job. Before this it had no action that could do it at all: the
// only way to change versions was a button in a browser it does not control.
test("the Agent can publish without taking the screen, then switch, finish and clear a stale tab", async (t) => {
  const f = setup(t);
  const first = await f.open("projects/a");
  fs.writeFileSync(
    path.join(f.workspace, "part-two.stl"),
    stl.replace("vertex 1 0 0", "vertex 2 0 0"),
  );
  const quiet = await f.manager.execute({
    action: "open",
    project: "projects/a",
    file: "part-two.stl",
    version: "v2",
    label: "v2",
    activate: false,
  });
  assert.equal(quiet.publication, "published");
  assert.equal(quiet.active.id, first.active.id, "the screen must not move");
  assert.equal(quiet.versions.length, 2);

  const second = quiet.versions.find((v) => v.id !== first.active.id);
  const switched = await f.manager.execute({
    action: "activate",
    project: "projects/a",
    versionId: second.id,
  });
  assert.equal(switched.active.id, second.id);
  // Naming the version string works too, so the Agent need not track ids.
  const back = await f.manager.execute({
    action: "activate",
    project: "projects/a",
    version: first.active.version,
  });
  assert.equal(back.active.id, first.active.id);

  // A tab that stopped reporting must never keep the Agent or anyone else out.
  const cleared = await f.manager.execute({
    action: "unlock",
    project: "projects/a",
    versionId: first.active.id,
  });
  assert.deepEqual(cleared.cleared, [first.active.id]);
  const p = f.manager.project("projects/a");
  const config = JSON.parse(
    fs.readFileSync(path.join(p.runtime, "config.json"), "utf8"),
  );
  const live = JSON.parse(
    fs.readFileSync(path.join(p.runtime, "state.json"), "utf8"),
  );
  assert.equal(live.presence[first.active.id], undefined);

  const finished = await f.manager.execute({
    action: "finish",
    project: "projects/a",
  });
  assert.equal(finished.versionId, first.active.id);
  assert.equal(finished.sealed, null, "nothing was marked, so nothing sealed");
  const status = await f.manager.execute({
    action: "status",
    project: "projects/a",
  });
  assert.equal(status.versions.length, 2);
  assert.equal(status.locked, false);
});

/* Installing a build does not replace a server that is already running, so the
 * moment 0.13.0 landed, every live 0.11.1 instance answered `retain` with the
 * framework's HTML 404. `ipc` handed the JSON.parse failure straight back, and
 * what reached the agent was `Unexpected token '<', "<!DOCTYPE "...` — a string
 * that reads like a corrupt response and says nothing about the one thing that
 * would fix it. Hit on the first call after the 0.13.0 restart, 2026-09-15.
 */
test("a route the running build predates says so, instead of leaking a parse error", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-ipc-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // What Express answers for an unregistered route.
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(
      "<!DOCTYPE html>\n<html><head><title>Error</title></head><body><pre>Cannot POST /retain</pre></body></html>",
    );
  });
  await new Promise((r) => server.listen(path.join(dir, "agent.sock"), r));
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  assert.deepEqual(await ipc(dir, null, "/status"), { ok: true });

  const error = await ipc(dir, null, "/retain", { keep: 3 }).then(
    () => null,
    (e) => e,
  );
  assert.equal(error?.code, "OLD_RUNTIME");
  assert.match(error.message, /open the project again/);
  assert.doesNotMatch(error.message, /JSON|token|DOCTYPE/);
});

/* One budget covered every route for as long as every route answered from
 * memory. Publishing a STEP tessellates first, so the 73k-triangle assembly
 * that 1.3.0-dev was built for spent nine seconds inside a three-second budget:
 * the server finished and stored the model, the agent was told UNAVAILABLE.
 * A retry only looked harmless because the derived mesh is content-addressed.
 * Hit on the first real publish after the 1.3.0-dev restart, 2026-09-21.
 */
test("a route that does real work gets its own budget, and silence still fails fast", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-budget-"));
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "published" }));
    }, 200);
  });
  await new Promise((r) => server.listen(path.join(dir, "agent.sock"), r));
  t.after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const hurried = await ipc(dir, null, "/publish", {}, 50).then(
    () => null,
    (e) => e,
  );
  assert.match(
    hurried?.message ?? "",
    /timed out/,
    "a budget the work outlasts is still enforced, or nothing bounds a wedged instance",
  );
  assert.deepEqual(await ipc(dir, null, "/publish", {}, 5000), {
    status: "published",
  });
});

test("workspace-relative serialization uses native separators without changing POSIX bytes", async () => {
  const { workspaceRelative } =
    await import("../integration/relative-path.mjs");
  assert.equal(
    workspaceRelative(
      "C:\\workspace",
      "C:\\workspace\\projects\\a",
      path.win32,
    ),
    "projects/a",
  );
  assert.equal(
    workspaceRelative("/workspace", "/workspace/projects/a\\b", path.posix),
    path.posix.relative("/workspace", "/workspace/projects/a\\b"),
  );
});

test("Windows-serialized project round-trips through open, status and stop", async (t) => {
  const f = setup(t);
  const manager = new InstanceManager(f.ctx, {
    ...f.options,
    relativePaths: path.win32,
  });
  const args = {
    action: "open",
    project: "projects/a",
    file: "part.stl",
    host: "127.0.0.1",
    confirmedClientAddress: "127.0.0.1",
  };
  // Track the process in the fixture's cleanup, even if an assertion fails.
  await f.open(args.project);
  const opened = await manager.execute(args);
  assert.equal(opened.project, "projects/a");
  const again = await manager.execute({ ...args, project: opened.project });
  assert.equal(again.project, opened.project);
  assert.equal(again.url, opened.url);
  const status = await manager.execute({
    action: "status",
    project: opened.project,
  });
  assert.equal(status.project, opened.project);
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(f.workspace, "projects/meshcue-state/registry.json"),
      "utf8",
    ),
  );
  const p = manager.project(opened.project);
  assert.deepEqual(Object.keys(registry.projects), [p.id]);
  assert.equal(registry.projects[p.id].project, "projects/a");
  assert.equal(registry.projects[p.id].runtime, `projects/a/.meshcue/${p.id}`);
  assert.equal(
    (await manager.execute({ action: "stop", project: opened.project }))
      .project,
    opened.project,
  );
});

test("legacy backslash registry paths resume, pause and rewrite without duplicate registration", async (t) => {
  const f = setup(t);
  const opened = await f.open("projects/a");
  const p = f.manager.project(opened.project);
  const file = path.join(f.workspace, "projects/meshcue-state/registry.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  const item = registry.projects[p.id];
  item.project = item.project.replaceAll("/", "\\");
  item.runtime = item.runtime.replaceAll("/", "\\");
  fs.writeFileSync(file, JSON.stringify(registry));
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), []);
  assert.equal(fs.existsSync(path.join(p.runtime, "disabled.json")), true);
  assert.deepEqual(resumeRegistered(f.workspace, f.options.installRoot), []);
  assert.equal(fs.existsSync(path.join(p.runtime, "disabled.json")), false);
  // Diagnostics must also use the portable project when identity is stale.
  const configFile = path.join(p.runtime, "config.json");
  const config = fs.readFileSync(configFile, "utf8");
  fs.writeFileSync(configFile, JSON.stringify({ instance: { id: "foreign" } }));
  assert.deepEqual(pauseRegistered(f.workspace, f.options.installRoot), [
    "projects/a",
  ]);
  fs.writeFileSync(configFile, config);
  await f.open(opened.project);
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(Object.keys(after.projects), [p.id]);
  assert.equal(after.projects[p.id].project, "projects/a");
  assert.equal(after.projects[p.id].runtime, `projects/a/.meshcue/${p.id}`);
});

test("W2 open limit preflight refuses before creating or changing a project", async (t) => {
  const f = setup(t);
  const { MAX_TRIANGLES, MAX_BYTES } = await import("../server/models.mjs");
  const { primitiveGlb } = await import("./fixtures/primitive-glb.mjs");
  const big = Buffer.alloc(84 + (MAX_TRIANGLES + 1) * 50);
  big.writeUInt32LE(MAX_TRIANGLES + 1, 80);
  const cases = [
    ["large.stl", big, "decimate", "MODEL_LIMIT"],
    [
      "texture.glb",
      primitiveGlb([{ mode: 4, count: 3 }], [[8193, 1]]),
      "reduce-textures",
      "TEXTURE_LIMIT",
    ],
    [
      "lines.glb",
      primitiveGlb([{ mode: 1, count: 2 }]),
      "reexport-geometry",
      "MODEL_LIMIT",
    ],
    ["bytes.stl", null, "reexport-smaller", "MODEL_LIMIT"],
  ];
  for (const [file, data, kind, code] of cases) {
    const target = path.join(f.workspace, file);
    if (data) fs.writeFileSync(target, data);
    else {
      const fd = fs.openSync(target, "w");
      fs.ftruncateSync(fd, MAX_BYTES + 1);
      fs.closeSync(fd);
    }
    const before = fs.readdirSync(f.workspace).sort();
    await assert.rejects(
      f.manager.execute({ action: "open", project: "projects/refused", file }),
      (e) => {
        assert.equal(e.code, code);
        assert.equal(e.precheck.verdict, "reject");
        assert.equal(e.remediation.kind, kind);
        assert.match(
          e.remediation.next,
          /explain the proposed change in the originating conversation and wait for confirmation/,
        );
        assert.match(
          e.remediation.next,
          /with a submission batch also send same-batch echo/,
        );
        assert.match(
          e.remediation.next,
          /without one do not call echo or invent a submissionId/,
        );
        assert.match(e.remediation.next, /precheck again/);
        if (kind === "decimate")
          assert.equal(e.remediation.ratio, e.precheck.simplify.requiredRatio);
        return true;
      },
    );
    assert.deepEqual(fs.readdirSync(f.workspace).sort(), before);
  }
  const opened = await f.open("projects/existing");
  const p = f.manager.project("projects/existing");
  const state = fs.readFileSync(path.join(p.runtime, "state.json"), "utf8");
  await assert.rejects(f.open("projects/existing", { file: "large.stl" }), {
    code: "MODEL_LIMIT",
  });
  assert.equal(
    fs.readFileSync(path.join(p.runtime, "state.json"), "utf8"),
    state,
  );
  assert.equal(
    (
      await f.manager.execute({
        action: "status",
        project: "projects/existing",
      })
    ).active.id,
    opened.active.id,
  );
});

test("W2 manager viewer freshness, gates, ignored versionId and stopped states", async (t) => {
  const f = setup(t);
  const project = "projects/signals";
  const opened = await f.open(project, { version: "v1" });
  assert.ok(!Number.isNaN(Date.parse(opened.openedAt)));
  const status = () => f.manager.execute({ action: "status", project });
  assert.equal((await status()).state, "running");
  assert.equal((await status()).viewer.loadedSinceOpen, false);
  const claim = await fetch(`${opened.url}api/access/claim`, {
    method: "POST",
    headers: {
      "X-Review-Client": "1",
      "Content-Type": "application/json",
      Origin: opened.url.slice(0, -1),
    },
    body: "{}",
  });
  assert.equal(claim.status, 200);
  const cookie = claim.headers.get("set-cookie").split(";")[0];
  const api = async (route, body, method = "POST") => {
    const r = await fetch(`${opened.url}api/${route}`, {
      method,
      headers: {
        "X-Review-Client": "1",
        "Content-Type": "application/json",
        Origin: opened.url.slice(0, -1),
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  const owner = { versionId: opened.active.id, clientId: "w2-tab" };
  const mesh = {
    id: "mesh-0",
    name: "part",
    triangles: 1,
    sourceTriangles: 1,
    surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
    matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  const ready = () =>
    api("ready", { ...owner, sha256: opened.active.sha256, meshes: [mesh] });
  await ready();
  assert.equal((await status()).viewer.loadedSinceOpen, true);
  assert.equal((await status()).viewer.clients, 1);
  await new Promise((r) => setTimeout(r, 5));
  await f.manager.execute({ action: "open", project });
  assert.equal((await status()).viewer.loadedSinceOpen, false);
  assert.ok((await status()).viewer.lastLoadedAt);
  await ready();
  const mark = {
    id: "w2-pin",
    type: "pin",
    label: "A",
    color: "#e76d5c",
    meshId: "mesh-0",
    faceIndex: 0,
    sourceFaceIndex: 0,
    position: [0, 0, 0],
    normal: [0, 0, 1],
    barycentric: [1, 0, 0],
  };
  await api("review/begin", owner);
  let draft = await api(
    "draft",
    { ...owner, revision: 0, annotations: [mark], camera: null },
    "PUT",
  );
  await api("feedback", {
    ...owner,
    revision: draft.revision,
    submissionId: "w2-batch",
  });
  const read = (geometry) =>
    f.manager.execute({
      action: "read",
      project,
      submissionId: "w2-batch",
      versionId: { ignored: true },
      geometry,
    });
  assert.deepEqual((await read()).gates, {
    sealed: false,
    olderVersion: null,
    hasNotes: false,
    mustConfirmBeforeChange: true,
    nextAction: "echo-then-wait",
  });
  assert.deepEqual((await read(true)).gates, (await read()).gates);
  await f.manager.execute({
    action: "echo",
    project,
    submissionId: "w2-batch",
    versionId: 999,
    summary: "Understood; waiting for confirmation.",
  });
  draft = await api(
    "draft",
    {
      ...owner,
      revision: draft.revision,
      annotations: [{ ...mark, note: "Make wider" }],
      camera: null,
    },
    "PUT",
  );
  await api("feedback", {
    ...owner,
    revision: draft.revision,
    submissionId: "w2-noted",
  });
  const noted = await f.manager.execute({
    action: "read",
    project,
    submissionId: "w2-noted",
  });
  assert.equal(noted.gates.hasNotes, true);
  assert.equal(noted.gates.nextAction, "echo-then-wait");
  fs.writeFileSync(
    path.join(f.workspace, "next.stl"),
    stl.replace("vertex 1 0 0", "vertex 2 0 0"),
  );
  await f.open(project, { file: "next.stl", version: "v2" });
  assert.deepEqual((await read()).gates.olderVersion, {
    markedOn: "v1",
    showing: "v2",
  });
  assert.equal((await read()).gates.nextAction, "ask-version");
  draft = await api(
    "draft",
    {
      ...owner,
      revision: draft.revision,
      annotations: [{ ...mark, note: "Make wider" }],
      camera: null,
    },
    "PUT",
  );
  const finished = await f.manager.execute({
    action: "finish",
    project,
    versionId: owner.versionId,
  });
  const sealed = await f.manager.execute({
    action: "read",
    project,
    submissionId: finished.sealed,
    geometry: true,
  });
  assert.equal(sealed.gates.sealed, true);
  assert.equal(sealed.gates.hasNotes, true);
  assert.equal(sealed.gates.nextAction, "ask-sealed");
  assert.deepEqual(sealed.gates.olderVersion, {
    markedOn: "v1",
    showing: "v2",
  });
  await api("review/finish", owner);
  await f.manager.execute({ action: "stop", project });
  assert.equal((await status()).state, "stopped");
  assert.equal((await status()).viewer, null);
  fs.writeFileSync(
    path.join(f.manager.project(project).runtime, "stopped.json"),
    JSON.stringify({ reason: "idle" }),
  );
  assert.equal(
    (await status()).state,
    "stopped",
    "an unverified marker must not imply idle reclaim",
  );
});

test("W2 manager stopped-idle requires an actual persisted reclaim and clears on reopen", async (t) => {
  const f = setup(t);
  const manager = new InstanceManager(f.ctx, {
    ...f.options,
    environment: {
      REVIEW_BRIDGE: "off",
      REVIEW_IDLE_HOURS: "0.0003",
      REVIEW_IDLE_TICK_MS: "100",
    },
  });
  const project = "projects/idle-signals";
  await manager.execute({
    action: "open",
    project,
    file: "part.stl",
    host: "127.0.0.1",
  });
  // Fixture lifetime owns this server even if an assertion fails before reclaim.
  t.after(async () => {
    try {
      await manager.execute({ action: "stop", project });
    } catch {}
  });
  await new Promise((r) => setTimeout(r, 3500));
  const stopped = await manager.execute({ action: "status", project });
  assert.equal(stopped.state, "stopped-idle");
  assert.equal(stopped.dataRetained, true);
  assert.ok(stopped.next.includes("open"));
  await manager.execute({ action: "open", project });
  assert.equal(
    (await manager.execute({ action: "status", project })).state,
    "running",
  );
  assert.equal(
    fs.existsSync(path.join(manager.project(project).runtime, "stopped.json")),
    false,
  );
  await manager.execute({ action: "stop", project });
});

test("W2 stale idle marker after failed cleanup cannot describe a newer non-idle stop", async (t) => {
  const f = setup(t);
  const manager = new InstanceManager(f.ctx, {
    ...f.options,
    environment: {
      REVIEW_BRIDGE: "off",
      REVIEW_IDLE_HOURS: "0.0003",
      REVIEW_IDLE_TICK_MS: "100",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${pathToFileURL(path.join(repo, "tests/helpers/stop-marker-cleanup-fault.mjs")).href}`,
    },
  });
  const project = "projects/stale-idle-signals";
  t.after(async () => {
    try {
      await manager.execute({ action: "stop", project });
    } catch {}
  });
  await manager.execute({
    action: "open",
    project,
    file: "part.stl",
    host: "127.0.0.1",
  });
  await new Promise((r) => setTimeout(r, 3500));
  assert.equal(
    (await manager.execute({ action: "status", project })).state,
    "stopped-idle",
  );
  const runtime = manager.project(project).runtime;
  const markerFile = path.join(runtime, "stopped.json");
  const oldMarker = fs.readFileSync(markerFile, "utf8");
  const oldRun = JSON.parse(oldMarker).serviceRunId;
  await manager.execute({ action: "open", project });
  assert.equal(
    (await manager.execute({ action: "status", project })).state,
    "running",
  );
  assert.equal(fs.readFileSync(markerFile, "utf8"), oldMarker);
  assert.notEqual(
    JSON.parse(fs.readFileSync(path.join(runtime, "state.json"), "utf8"))
      .serviceRunId,
    oldRun,
  );
  await manager.execute({ action: "stop", project });
  assert.equal(
    (await manager.execute({ action: "status", project })).state,
    "stopped",
  );
  // An unreadable/missing retained launch record cannot validate even a marker
  // that otherwise matches the latest run.
  const stateFile = path.join(runtime, "state.json");
  const state = fs.readFileSync(stateFile, "utf8");
  fs.writeFileSync(
    markerFile,
    JSON.stringify({
      ...JSON.parse(oldMarker),
      serviceRunId: JSON.parse(state).serviceRunId,
    }),
  );
  fs.writeFileSync(stateFile, "unreadable");
  assert.equal(
    (await manager.execute({ action: "status", project })).state,
    "stopped",
  );
  fs.writeFileSync(stateFile, state);
});

for (const [hours, expected] of [
  [undefined, 24],
  [3.5, 3.5],
  [0, 0],
]) {
  test(`open reviewLifetime reflects idle policy ${hours ?? "default"}`, async (t) => {
    const f = setup(t);
    if (hours !== undefined)
      f.manager.environment.REVIEW_IDLE_HOURS = String(hours);
    const opened = await f.open("projects/idle-policy");
    const state = await f.manager.execute({
      action: "status",
      project: "projects/idle-policy",
    });
    assert.equal(state.idle.limitMs, expected * 3600000);
    assert.equal(typeof opened.reviewLifetime, "string");
    assert.equal(
      opened.reviewLifetime,
      expected === 0
        ? "idle reclaim disabled; data retained"
        : `reclaimed after ${expected} hours with no use; reopen to resume`,
    );
  });
}
