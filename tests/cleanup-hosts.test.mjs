import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli/meshcue.mjs";
import { createHandler, TOOL } from "../mcp/server.mjs";
import { InstanceManager } from "../integration/manager.mjs";
import { listenerConfig } from "../server/network.mjs";

process.env.REVIEW_UPDATE_CHECK = "off";
const repo = process.cwd();
function fixture(t) {
  fs.mkdirSync("tmp", { recursive: true });
  const workspace = fs.mkdtempSync(path.join(repo, "tmp/cleanup-host-"));
  fs.mkdirSync(path.join(workspace, "web"));
  fs.writeFileSync(path.join(workspace, "web/index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(workspace, "package.json"), '{"name":"meshcue"}');
  fs.writeFileSync(
    path.join(workspace, "part.stl"),
    "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n",
  );
  const options = {
    installRoot: workspace,
    serverEntry: path.join(repo, "server/index.mjs"),
    distRoot: path.join(workspace, "web"),
    environment: { REVIEW_BRIDGE: "off" },
  };
  const mine = ["--owner", "fixture", "--project", "projects/fixture"];
  const cli = (action, extra = []) =>
    run([action, ...mine, ...extra], { cwd: workspace, ...options });
  const handle = createHandler({ workspace, managerOptions: options });
  const mcp = async (action, extra = {}) => {
    const answer = await handle({
      id: 1,
      method: "tools/call",
      params: {
        name: "meshcue",
        arguments: { action, project: "projects/fixture", ...extra },
      },
    });
    if (answer.result.isError)
      throw Object.assign(new Error(answer.result.content[0].text), {
        code: "MCP_ERROR",
      });
    return answer.result.structuredContent;
  };
  // Removal must follow shutdown even when the assertion about the URL fails.
  t.after(async () => {
    for (const entry of [cli, mcp]) {
      try {
        await entry("stop");
      } catch (error) {
        if (
          !/NOT_FOUND|MODEL_REQUIRED|RESUME_REQUIRED/.test(
            error.code + error.message,
          )
        )
          throw error;
      }
    }
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  return { workspace, options, cli, mcp };
}

test("CLI open without a host binds loopback", async (t) => {
  const f = fixture(t);
  const opened = await f.cli("open", ["--file", "part.stl"]);
  assert.equal(new URL(opened.url).hostname, "127.0.0.1");
});

test("MCP open without a host binds loopback and advertises host opt-in", async (t) => {
  const f = fixture(t);
  const opened = await f.mcp("open", { file: "part.stl" });
  assert.equal(new URL(opened.url).hostname, "127.0.0.1");
  assert.equal(TOOL.inputSchema.properties.host.type, "string");
});

test("CLI and MCP explicit LAN selection and stored hosts survive entry-point defaults", async (t) => {
  const f = fixture(t);
  t.mock.method(os, "networkInterfaces", () => ({
    en0: [{ address: "192.168.50.7", family: "IPv4", internal: false }],
  }));
  const seen = [];
  // Stop at the launch boundary: address selection stays real but this fixture
  // never needs to bind an invented interface on the test machine.
  t.mock.method(
    InstanceManager.prototype,
    "ensure",
    async function (p, config) {
      seen.push(listenerConfig(config.host));
      fs.writeFileSync(
        path.join(p.runtime, "config.json"),
        JSON.stringify({ ...config, host: seen.at(-1).host }),
      );
      throw new Error("selected fixture address");
    },
  );
  for (const entry of ["cli", "mcp"]) {
    const open = (host) =>
      entry === "cli"
        ? f.cli("open", [
            "--file",
            "part.stl",
            ...(host ? ["--host", host] : []),
          ])
        : f.mcp("open", { file: "part.stl", ...(host ? { host } : {}) });
    for (const host of ["lan", undefined, "127.0.0.1"])
      await assert.rejects(open(host), /selected fixture address/);
    assert.deepEqual(
      seen.splice(0),
      Array(3).fill({ host: "192.168.50.7", lan: true }),
    );
    fs.rmSync(path.join(f.workspace, "projects"), {
      recursive: true,
      force: true,
    });
  }
});

test("OpenClaw's unspecified listener still constructs a LAN-default manager", (t) => {
  const f = fixture(t);
  const config = {};
  const manager = new InstanceManager(
    { workspaceDir: f.workspace, agentId: "fixture" },
    {
      ...f.options,
      listenHost: config.listenHost,
    },
  );
  assert.equal(manager.listenHost, "lan");
  assert.match(
    fs.readFileSync("adapters/openclaw/index.mjs", "utf8"),
    /listenHost: config\.listenHost/,
  );
});
