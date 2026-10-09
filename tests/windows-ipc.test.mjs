import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { limitInitialPipeRequest } from "../server/ipc-timeout.mjs";
import crypto from "node:crypto";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

test("a truncated IPC proof rejects promptly without keeping the child alive for its authentication timeout", async (t) => {
  const runtime = fixture(t);
  const socketPath = path.join(runtime, "truncated.sock");
  const moduleURL = new URL("../integration/ipc-auth.mjs", import.meta.url)
    .href;
  const script = `
    import net from "node:net";
    import { once } from "node:events";
    import { authenticatedPipeAgent } from ${JSON.stringify(moduleURL)};
    const server = net.createServer(socket => {
      socket.once("data", () => {
        socket.write("HTTP/1.1 200 OK\\r\\nContent-Length: 64\\r\\n\\r\\nabc");
        setTimeout(() => socket.destroy(), 25);
      });
    });
    server.listen(${JSON.stringify(socketPath)});
    await once(server, "listening");
    try {
      await authenticatedPipeAgent({ path: ${JSON.stringify(socketPath)}, key: "a".repeat(64) }, 10000);
      throw new Error("Truncated proof unexpectedly succeeded");
    } catch (error) {
      if (!/aborted/i.test(error.message)) throw error;
      console.log("rejected: " + error.message);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  `;
  const start = Date.now();
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { timeout: 2500 },
  );
  assert.match(stdout, /rejected: .*aborted/i);
  assert.ok(
    Date.now() - start < 2500,
    "child must exit well before 10s timeout",
  );
});

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
    assert.match(script, /\$item\.SetAccessControl\(\$acl\)/);
    assert.match(script, /SetSecurityDescriptorSddlForm\("D:P.*Access\)/);
    assert.doesNotMatch(script, /Set-Acl|Get-Acl|O:\$|::Audit|SetOwner/);
    assert.match(script, /\$before.GetOwner/);
    assert.match(script, /\$actual.GetOwner/);
    assert.match(script, /Select-Object -Unique/);
    assert.match(script, /PropagationFlags/);
  });
  assert.equal(calls, 1);
  assert.throws(
    () =>
      preparePrivateRuntime(runtime, "win32", () => {
        throw new Error("ACL denied");
      }),
    /Windows directory permission setup failed: ACL denied/,
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

test("Windows initial-request deadline closes silent and incomplete-header connections", async (t) => {
  const endpoint = await pipeServer(t, () =>
    assert.fail("no complete request"),
  );
  limitInitialPipeRequest(endpoint.server, { platform: "win32", timeout: 60 });
  for (const header of ["", "GET /ipc-auth HTTP/1.1\r\nHost: ipc\r\n"]) {
    const socket = net.createConnection(endpoint.path);
    t.after(() => socket.destroy());
    const closed = once(socket, "close");
    await once(socket, "connect");
    if (header) socket.write(header);
    await Promise.race([
      closed,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("idle pipe not closed")),
          1000,
        );
        timer.unref();
        closed.then(() => clearTimeout(timer));
      }),
    ]);
    assert.equal(socket.destroyed, true);
  }
});

test("Windows authenticated long publish survives the initial-request deadline", async (t) => {
  const key = "a".repeat(64);
  let proofSocket;
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
      req.resume();
      setTimeout(() => res.end("published"), 150);
    }
  });
  limitInitialPipeRequest(endpoint.server, { platform: "win32", timeout: 40 });
  const agent = await authenticatedPipeAgent({ ...endpoint, key });
  t.after(() => agent.destroy());
  // Also cross the deadline while the authenticated connection is idle before
  // starting a handler that lasts several times longer than the deadline.
  await new Promise((resolve) => setTimeout(resolve, 80));
  await action(endpoint, agent, "model payload");
});

test("POSIX initial-request behavior is unchanged", async (t) => {
  const endpoint = await pipeServer(t, (_req, res) => res.end("ok"));
  const listeners = endpoint.server.listenerCount("connection");
  limitInitialPipeRequest(endpoint.server, { platform: "darwin", timeout: 20 });
  assert.equal(endpoint.server.listenerCount("connection"), listeners);
  const socket = net.createConnection(endpoint.path);
  t.after(() => socket.destroy());
  await once(socket, "connect");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(socket.destroyed, false);
  const data = once(socket, "data");
  socket.write("GET / HTTP/1.1\r\nHost: ipc\r\nConnection: close\r\n\r\n");
  assert.match(String((await data)[0]), /200 OK/);
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
