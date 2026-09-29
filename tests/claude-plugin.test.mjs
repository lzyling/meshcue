import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHandler, resolveWorkspace } from "../mcp/server.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stl =
  "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";

function scratch(t, prefix) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* Claude Code starts a plugin's MCP server with `${CLAUDE_PROJECT_DIR}` put
   into MESHCUE_WORKSPACE. What the server must never do is fall back to its
   working directory when that value is unusable: for a plugin the working
   directory is not promised to be the project, and the one place it could be
   instead is the installed package, which the host deletes on update. */
test("the workspace is the one the host names, and a bad name is refused, not guessed", (t) => {
  const dir = scratch(t, "cc-workspace-");
  const file = path.join(dir, "file.txt");
  fs.writeFileSync(file, "");
  assert.deepEqual(resolveWorkspace({}, "/cwd"), { workspace: "/cwd" });
  assert.deepEqual(resolveWorkspace({ MESHCUE_WORKSPACE: "" }, "/cwd"), {
    workspace: "/cwd",
  });
  assert.deepEqual(resolveWorkspace({ MESHCUE_WORKSPACE: dir }, "/cwd"), {
    workspace: dir,
  });
  for (const given of [
    "${CLAUDE_PROJECT_DIR}",
    "relative/dir",
    path.join(dir, "missing"),
    file,
  ])
    assert.equal(
      resolveWorkspace({ MESHCUE_WORKSPACE: given }, "/cwd").error?.code,
      "WORKSPACE_INVALID",
      given,
    );
});

test("a server told an unusable workspace still answers the handshake, then refuses every call", async () => {
  const handle = createHandler({
    environment: { MESHCUE_WORKSPACE: "${CLAUDE_PROJECT_DIR}" },
  });
  const hello = await handle({
    id: 1,
    method: "initialize",
    params: { clientInfo: { name: "claude-code" } },
  });
  assert.equal(hello.result.serverInfo.name, "meshcue");
  const inspected = await handle({
    id: 2,
    method: "tools/call",
    params: { name: "meshcue", arguments: { action: "inspect" } },
  });
  assert.equal(inspected.result.isError, true);
  const refusal = JSON.parse(inspected.result.content[0].text);
  assert.equal(refusal.code, "WORKSPACE_INVALID");
  assert.match(refusal.message, /CLAUDE_PROJECT_DIR/);
});

/* The marketplace lives at the repository root and the plugin is the release
   asset, so the two have to agree on a name, and the entry has to name the
   asset the release workflow attaches for this version. On dev the asset is
   the one this version will be released with; on main, which is what
   `claude plugin marketplace add lzyling/meshcue` reads, it is the one that
   exists. Adding the catalog at a tag therefore pins the package as well. */
test("the marketplace names the release asset of this version, which the release attaches", () => {
  const { version } = read(path.join(repo, "package.json"));
  const [released] = version.split("-");
  const market = read(path.join(repo, ".claude-plugin/marketplace.json"));
  const template = read(path.join(repo, "adapters/claude-code/plugin.json"));
  assert.equal(market.plugins.length, 1);
  const [entry] = market.plugins;
  assert.equal(entry.name, template.name, "entry and manifest must agree");
  assert.equal(entry.version, undefined, "the manifest carries the version");
  assert.deepEqual(entry.source, {
    source: "archive",
    url: `https://github.com/lzyling/meshcue/releases/download/v${released}/meshcue-${released}.zip`,
  });
  const workflow = fs.readFileSync(
    path.join(repo, ".github/workflows/release.yml"),
    "utf8",
  );
  assert.match(workflow, /zip -r -X -q "\.\.\/meshcue-\$version\.zip" \./);
  assert.match(workflow, /"\$RUNNER_TEMP\/package\/meshcue-\$\{tag#v\}\.zip"/);
  // The root is a marketplace and nothing else. A plugin manifest or an
  // .mcp.json here would load MeshCue into the session of anyone working on
  // this repository.
  assert.equal(fs.existsSync(path.join(repo, ".mcp.json")), false);
  assert.equal(
    fs.existsSync(path.join(repo, ".claude-plugin/plugin.json")),
    false,
  );
});

/* The package is started the way Claude Code starts it: `node` on the bundled
   server, from a directory that is not the project, with no node_modules
   anywhere near it, the workspace named in the environment and the client
   saying it is Claude Code. */
test("the packaged plugin serves a review from the project it is told, and writes nothing into itself", async (t) => {
  const out = path.join("tmp", `cc-plugin-${process.pid}-${Date.now()}`);
  t.after(() =>
    fs.rmSync(path.join(repo, out), { recursive: true, force: true }),
  );
  execFileSync(process.execPath, ["scripts/build-integration.mjs", out], {
    cwd: repo,
    env: {
      PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
      HOME: os.homedir(),
      MESHCUE_SKIP_HOST_BUILD: "1",
    },
    encoding: "utf8",
  });
  const pkg = path.join(repo, out);
  const { version } = read(path.join(repo, "package.json"));
  const manifest = read(path.join(pkg, ".claude-plugin/plugin.json"));
  assert.equal(manifest.name, "meshcue");
  assert.equal(manifest.version, version);
  const server = manifest.mcpServers.meshcue;
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, ["${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs"]);
  assert.deepEqual(server.env, { MESHCUE_WORKSPACE: "${CLAUDE_PROJECT_DIR}" });

  const listing = (root) =>
    fs.readdirSync(root, { recursive: true }).sort().join("\n");
  const before = listing(pkg);
  const workspace = scratch(t, "cc-project-");
  fs.mkdirSync(path.join(workspace, "projects/lamp"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "projects/lamp/part.stl"), stl);

  const child = spawn(process.execPath, [path.join(pkg, "mcp/server.mjs")], {
    cwd: pkg,
    env: {
      PATH: process.env.PATH,
      HOME: os.homedir(),
      MESHCUE_WORKSPACE: workspace,
      MESHCUE_OWNER: "claude-plugin-test",
      REVIEW_UPDATE_CHECK: "off",
      REVIEW_BRIDGE: "off",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  t.after(() => child.kill());
  const answers = new Map();
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    if (waiting.has(message.id)) waiting.get(message.id)(message);
    else answers.set(message.id, message);
  });
  let next = 1;
  const ask = (method, params) =>
    new Promise((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  const call = async (args) =>
    (await ask("tools/call", { name: "meshcue", arguments: args })).result;

  const hello = await ask("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "claude-code", version: "2.1.284" },
  });
  assert.equal(hello.result.serverInfo.version, version);
  assert.ok(
    hello.result.instructions.length > 1000,
    "the Skill travels with it",
  );

  const inspected = (await call({ action: "inspect" })).structuredContent;
  assert.equal(inspected.integrationVersion, version);
  for (const file of Object.values(inspected.docs))
    assert.ok(file.startsWith(pkg + path.sep), `${file} is in the package`);

  const opened = await call({
    action: "open",
    project: "projects/lamp",
    file: "projects/lamp/part.stl",
    name: "lamp",
    version: "v1",
    host: "127.0.0.1",
    confirmedClientAddress: "127.0.0.1",
  });
  try {
    assert.ok(!opened.isError, opened.content?.[0]?.text);
    assert.ok(opened.structuredContent.url);
    assert.equal(opened.structuredContent.agentName, "Claude Code");
    const status = (await call({ action: "status", project: "projects/lamp" }))
      .structuredContent;
    assert.equal(status.origin.harness, "mcp");
    // Launched from the verified per-project copy, not from the package the
    // host will replace.
    const runtimes = fs.readdirSync(
      path.join(workspace, "projects/lamp/.meshcue"),
    );
    assert.equal(runtimes.length, 1);
    const releases = fs.readdirSync(
      path.join(workspace, "projects/lamp/.meshcue", runtimes[0], "releases"),
    );
    assert.equal(releases.length, 1);
    const page = await fetch(new URL("/", opened.structuredContent.url));
    assert.ok(page.status < 500);
  } finally {
    await call({ action: "stop", project: "projects/lamp" });
  }
  assert.equal(listing(pkg), before, "nothing was written into the package");
});
