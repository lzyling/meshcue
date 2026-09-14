import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { runtimesThatCannotReclaim } from "../integration/manager.mjs";
import {
  agentSocketPath,
  prepareSocketDirectory,
} from "../server/instance.mjs";

const INSTALL_ROOT = "/fixture/install/meshcue";

function registered(t, projects) {
  const workspace = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-registry-")),
  );
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspace, "projects/meshcue-state"), {
    recursive: true,
  });
  const entries = {};
  for (const [name, status] of Object.entries(projects)) {
    const id = `0000000000000000000000000000000${Object.keys(entries).length}`;
    const instance = {
      id: `0000000${Object.keys(entries).length}-0000-4000-8000-000000000000`,
      projectId: id,
      schema: 1,
    };
    const runtime = path.join(workspace, "projects", name, ".meshcue", id);
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(
      path.join(runtime, "config.json"),
      JSON.stringify({ instance, managed: true }),
    );
    entries[id] = {
      project: `projects/${name}`,
      runtime: path.relative(workspace, runtime),
      instanceId: instance.id,
      agentId: "main",
      installRoot: INSTALL_ROOT,
    };
    if (!status) continue;
    const socket = agentSocketPath(runtime, instance);
    prepareSocketDirectory(socket, instance);
    fs.rmSync(socket, { force: true });
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(status));
    });
    server.listen(socket);
    t.after(() => new Promise((done) => server.close(done)));
  }
  fs.writeFileSync(
    path.join(workspace, "projects/meshcue-state/registry.json"),
    JSON.stringify({ schema: 1, projects: entries }),
  );
  return workspace;
}

test("opening one project names the others whose runtime is too old to reclaim itself", async (t) => {
  const workspace = registered(t, {
    // Published before reclaiming existed: it will run until something stops
    // it, and nothing else in the system is counting it.
    "printed-and-forgotten": { version: "0.6.1" },
    // Reclaims itself, so there is nothing to say about it.
    "still-iterating": { version: "0.11.0", idle: { forMs: 60, limitMs: 1 } },
    // Reclaiming switched off is a decision somebody made, not a gap. A limit
    // of zero must not read the same as no limit at all.
    "deliberately-kept": { version: "0.11.0", idle: { forMs: 0, limitMs: 0 } },
    // Not running: there is nothing here to report either way.
    "never-started": null,
  });

  const stale = await runtimesThatCannotReclaim(workspace, INSTALL_ROOT, null);
  assert.deepEqual(stale, [
    { project: "projects/printed-and-forgotten", version: "0.6.1" },
  ]);
});

test("the project being opened is not reported to itself, and a foreign install is never touched", async (t) => {
  const workspace = registered(t, {
    "the-one-being-opened": { version: "0.6.1" },
  });
  assert.deepEqual(
    await runtimesThatCannotReclaim(
      workspace,
      INSTALL_ROOT,
      "projects/the-one-being-opened",
    ),
    [],
  );
  assert.deepEqual(
    await runtimesThatCannotReclaim(workspace, "/some/other/install", null),
    [],
  );
});

test("a missing or unreadable registry reports nothing rather than failing an open", async (t) => {
  const empty = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-registry-none-")),
  );
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  assert.deepEqual(
    await runtimesThatCannotReclaim(empty, INSTALL_ROOT, null),
    [],
  );

  fs.mkdirSync(path.join(empty, "projects/meshcue-state"), { recursive: true });
  fs.writeFileSync(
    path.join(empty, "projects/meshcue-state/registry.json"),
    "{ not json",
  );
  assert.deepEqual(
    await runtimesThatCannotReclaim(empty, INSTALL_ROOT, null),
    [],
  );
});
