import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { once } from "node:events";
import {
  pipeIdentity,
  pipePath,
  pipeProof,
  readPipeEndpoint,
  agentSocketPath,
  prepareSocketDirectory,
  preparePrivateRuntime,
  readInstance,
} from "../server/instance.mjs";
import { authenticatedPipeAgent } from "../integration/ipc-auth.mjs";
import { ipc } from "../integration/manager.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ipc-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("Windows IPC uses unpredictable per-start names and optional private lock fields", (t) => {
  const runtime = fixture(t);
  const first = pipeIdentity("win32"),
    second = pipeIdentity("win32");
  assert.notEqual(first.ipcNonce, second.ipcNonce);
  assert.notEqual(first.ipcKey, second.ipcKey);
  assert.match(
    pipePath(first.ipcNonce),
    /^\\\\\.\\pipe\\meshcue-[a-f0-9]{64}$/,
  );
  assert.throws(() => pipePath("../arbitrary"));
  assert.deepEqual(pipeIdentity("darwin"), {});
  const lock = path.join(runtime, "instance.lock");
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, ...first }));
  const endpoint = readPipeEndpoint(runtime);
  assert.equal(endpoint.path, pipePath(first.ipcNonce));
  assert.equal(agentSocketPath(runtime, null, "win32"), endpoint.path);
  assert.equal(endpoint.key, first.ipcKey);
  assert.throws(() => readPipeEndpoint(runtime, () => false), /not running/);
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  assert.throws(() => readPipeEndpoint(runtime), { code: "IPC_LEGACY" });
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, ...second }));
  assert.equal(readPipeEndpoint(runtime).path, pipePath(second.ipcNonce));
  const identity = {
    schema: 1,
    id: crypto.randomUUID(),
    projectId: "a".repeat(32),
  };
  assert.deepEqual(readInstance({ instance: identity, ...first }), identity);
});

test("Windows private state fails closed when ACL setup fails; POSIX paths and checks are unchanged", (t) => {
  const runtime = fixture(t);
  let calls = 0;
  preparePrivateRuntime(runtime, "win32", (exe, args, options) => {
    calls++;
    assert.match(exe, /WindowsPowerShell\\v1\.0\\powershell\.exe$/);
    assert.equal(options.env.MESHCUE_PRIVATE_RUNTIME, runtime);
    assert.ok(args.includes("-NonInteractive"));
    const script = args.at(-1);
    assert.match(script, /WindowsIdentity/);
    assert.match(script, /D:P/);
    assert.match(script, /FA;;;SY/);
    assert.match(script, /FA;;;BA/);
    assert.match(script, /ReparsePoint/);
    assert.match(script, /AreAccessRulesProtected/);
  });
  assert.equal(calls, 1);
  assert.throws(
    () =>
      preparePrivateRuntime(runtime, "win32", () => {
        throw new Error("ACL denied");
      }),
    /ACL denied/,
  );
  preparePrivateRuntime("nonexistent", "darwin", () =>
    assert.fail("POSIX must not run PowerShell"),
  );
  prepareSocketDirectory(pipePath("a".repeat(64)), {}, "win32");
  assert.equal(
    agentSocketPath(runtime, null, "darwin"),
    path.join(runtime, "agent.sock"),
  );
  const hash = crypto
    .createHash("sha256")
    .update(fs.realpathSync(runtime))
    .digest("hex")
    .slice(0, 24);
  const expected = path.join(
    os.tmpdir(),
    `meshcue-${process.getuid?.() ?? "user"}`,
    `${hash}.sock`,
  );
  assert.equal(agentSocketPath(runtime, {}, "darwin"), expected);
  // Use a fixture path rather than modifying the actual shared per-user dir.
  const privateDirectory = path.join(runtime, "private");
  fs.mkdirSync(privateDirectory, { mode: 0o700 });
  const socket = path.join(privateDirectory, "agent.sock");
  prepareSocketDirectory(socket, {}, "darwin");
  fs.chmodSync(privateDirectory, 0o755);
  assert.throws(
    () => prepareSocketDirectory(socket, {}, "darwin"),
    /not private/,
  );
});

async function pipeServer(t, handler) {
  const runtime = fixture(t);
  const socketPath = path.join(runtime, "proof.sock");
  const server = http.createServer(handler);
  server.listen(socketPath);
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { path: socketPath, server };
}
function action(endpoint, agent, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: endpoint.path, agent, path: "/publish", method: "POST" },
      (res) => {
        res.resume();
        res.on("end", resolve);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

test("a Windows proof authenticates the same connection before an action is sent", async (t) => {
  const key = "a".repeat(64);
  let proofSocket,
    actions = 0;
  const endpoint = await pipeServer(t, (req, res) => {
    if (req.url.startsWith("/ipc-auth?")) {
      proofSocket = req.socket;
      res.end(
        pipeProof(
          key,
          new URL(req.url, "http://ipc").searchParams.get("challenge"),
        ),
      );
    } else {
      assert.equal(req.socket, proofSocket);
      actions++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "published" }));
    }
  });
  const result = await ipc(
    "unused",
    null,
    "/publish",
    { file: "private model payload" },
    3000,
    {
      platform: "win32",
      readEndpoint: () => ({ ...endpoint, key }),
    },
  );
  assert.deepEqual(result, { status: "published" });
  assert.equal(actions, 1);
});

test("an impersonating server receives only a fresh challenge, never the action or key", async (t) => {
  const requests = [];
  const endpoint = await pipeServer(t, (req, res) => {
    requests.push(req.url);
    res.end("b".repeat(64));
  });
  await assert.rejects(
    ipc("unused", null, "/publish", { file: "secret" }, 3000, {
      platform: "win32",
      readEndpoint: () => ({ ...endpoint, key: "a".repeat(64) }),
    }),
    /authentication failed/,
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^\/ipc-auth\?challenge=[a-f0-9]{64}$/);
  assert.equal(requests[0].includes("a".repeat(64)), false);
});

test("an authenticated pipe cannot silently reconnect after losing its connection", async (t) => {
  const key = "a".repeat(64);
  let connection,
    requests = 0;
  const endpoint = await pipeServer(t, (req, res) => {
    requests++;
    connection = req.socket;
    res.end(
      pipeProof(
        key,
        new URL(req.url, "http://ipc").searchParams.get("challenge"),
      ),
    );
  });
  const agent = await authenticatedPipeAgent({ ...endpoint, key });
  t.after(() => agent.destroy());
  const closed = once(connection, "close");
  connection.destroy();
  await closed;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(
    action(endpoint, agent, "secret body"),
    /connection was lost/,
  );
  assert.equal(requests, 1);
});
