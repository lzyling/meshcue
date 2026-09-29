#!/usr/bin/env node
// MeshCue over the Model Context Protocol, for every harness that speaks it.
//
// It stands on the same InstanceManager the CLI and the OpenClaw adapter use,
// so there is one implementation of a review and not three that have to be kept
// agreeing. What differs between harnesses is only what they can offer back:
// this one cannot be pushed to at all, so a submitted batch waits to be read
// rather than being announced. `status.notifier` says so outright.
//
// Written against the wire rather than a client library: the protocol used here
// is three methods over newline-delimited JSON-RPC on stdio, and a dependency
// would be larger than the thing it replaced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { InstanceManager, inspectInstall } from "../integration/manager.mjs";
import { precheckModel, stepMeshFor } from "../integration/precheck.mjs";
import { normalizeOrigin } from "../server/origin.mjs";
import { MAX_AGENT_NAME } from "../server/agent-name.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
export const PROTOCOL_VERSION = "2025-06-18";

// The operating instructions travel with the server, and they are the same
// bytes the bundled Skill carries. A second copy written for this surface would
// start agreeing with the first and end up describing a different product.
export function instructions(root = ROOT) {
  const file = path.join(root, "skills/meshcue-review/SKILL.md");
  if (!fs.existsSync(file)) return "";
  return fs
    .readFileSync(file, "utf8")
    .replace(/^---\n[\s\S]*?\n---\n+/, "")
    .trim();
}

// MCP offers no session identity — initialize names the client, not the
// conversation — so the finest owner this protocol can honestly describe is the
// workspace being worked in. MESHCUE_OWNER overrides it for a host that does
// know which session is asking, which is the only way to make it finer without
// inventing it.
export function mcpOwner(workspace, environment = process.env) {
  if (environment.MESHCUE_OWNER) return environment.MESHCUE_OWNER;
  const digest = crypto
    .createHash("sha256")
    .update(`${os.hostname()}\0${workspace}`)
    .digest("hex")
    .slice(0, 16);
  return `mcp:${digest}`;
}

/* What the review page calls an agent that did not say its name: the client it
   runs in, recognised from the name that client gives in `initialize`. Only
   handshakes that were actually read are listed. A client missing here costs
   nothing but the page's own word for an agent; a guessed entry that is wrong
   would put a name on the page that is not the reviewer's tool at all.
   - claude-code: read from Claude Code 2.1.284 on 2026-09-29
     (`{"name":"claude-code","title":"Claude Code",…}`).
   - codex-mcp-client: openai/codex `codex-rs/codex-mcp/src/rmcp_client.rs`
     at fe50d01 (2026-09-28), `Implementation::new("codex-mcp-client", …)
     .with_title("Codex")`; read from source, not from a running Codex. */
export const KNOWN_CLIENTS = Object.freeze({
  "claude-code": "Claude Code",
  "codex-mcp-client": "Codex",
});
export function clientToolName(clientInfo) {
  const name = clientInfo?.name;
  return typeof name === "string" && Object.hasOwn(KNOWN_CLIENTS, name)
    ? KNOWN_CLIENTS[name]
    : undefined;
}

export const TOOL = {
  name: "meshcue",
  description:
    "Browser-based 3D model review. Publish a GLB, STL or STEP for a person to mark on, read the marks they submit, and publish the next version. STEP and STL are drawn +Z up, GLB +Y up; rotate a model built otherwise before publishing. precheck a GLB or STL before every open; open measures a STEP itself. This host cannot be pushed to: a submitted batch waits to be read, so call read when the reviewer says they are done rather than waiting to be told.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "inspect",
          "precheck",
          "open",
          "status",
          "activate",
          "retain",
          "read",
          "echo",
          "finish",
          "unlock",
          "stop",
        ],
      },
      project: { type: "string" },
      file: { type: "string" },
      name: { type: "string" },
      version: { type: "string" },
      label: { type: "string" },
      units: { type: "string" },
      versionId: { type: "string" },
      keep: { type: "integer", minimum: 0 },
      submissionId: { type: "string" },
      geometry: { type: "boolean" },
      summary: { type: "string" },
      annotations: { type: "array", items: { type: "object" } },
      activate: { type: "boolean" },
      resume: { type: "boolean" },
      confirmedClientAddress: { type: "string" },
      agentName: {
        type: "string",
        maxLength: MAX_AGENT_NAME,
        description:
          "open: what the review page calls you, e.g. “Send to Ada”. The name your user gave you; if they gave none, the name of the tool you run in. Plain text, at most 24 characters. Send it on every open; left out, the page keeps the name you gave before.",
      },
    },
    required: ["action"],
  },
};

/* Where the models are. A client that starts this server in the project it is
   working on needs to say nothing: the working directory is the workspace. A
   host that starts it somewhere else says so in MESHCUE_WORKSPACE -- Claude
   Code starts a plugin's server in the plugin's own directory, so the plugin
   passes `${CLAUDE_PROJECT_DIR}` here. Given, it has to be an absolute path to
   a directory that exists. A placeholder the host left unexpanded, or a path
   that is not there, is refused rather than quietly replaced by the working
   directory, which for a plugin is the installed package: reviews and models
   written there would vanish with the next update. */
export function resolveWorkspace(
  environment = process.env,
  cwd = process.cwd(),
) {
  const given = environment.MESHCUE_WORKSPACE;
  if (given === undefined || given === "") return { workspace: cwd };
  if (
    path.isAbsolute(given) &&
    fs.existsSync(given) &&
    fs.statSync(given).isDirectory()
  )
    return { workspace: given };
  return {
    error: {
      code: "WORKSPACE_INVALID",
      message: `MESHCUE_WORKSPACE must be an absolute path to an existing directory; it is ${JSON.stringify(given)}. Nothing was read or written.`,
    },
  };
}

/* In a built package the server and the page travel bundled, as runtime/ and
   web/, and the manager launches a verified copy of them per project, so a
   review keeps running when the host replaces the package it came from. From
   a clone they are the sources and the vite build beside them. */
const PACKAGED =
  typeof __MESHCUE_PACKAGED__ === "boolean" && __MESHCUE_PACKAGED__;

export function createHandler({
  workspace,
  root = ROOT,
  environment = process.env,
  managerOptions = {},
  packaged = PACKAGED,
} = {}) {
  let refusal;
  if (workspace === undefined) {
    const resolved = resolveWorkspace(environment);
    workspace = resolved.workspace;
    refusal = resolved.error;
  }
  const owner = refusal ? null : mcpOwner(workspace, environment);
  const context = { workspaceDir: workspace, agentId: "mcp" };
  // Said once, at the handshake, and true for the life of this connection.
  let toolName;
  const manager = () =>
    new InstanceManager(context, {
      installRoot: root,
      ...(packaged
        ? {}
        : {
            serverEntry: path.join(root, "server/index.mjs"),
            distRoot: path.join(root, "dist"),
          }),
      resolveOrigin: () =>
        normalizeOrigin({
          harness: "mcp",
          sessionKey: owner,
          sessionId: owner,
        }),
      toolName,
      ...managerOptions,
    });
  return async function handle(message) {
    const { id, method, params } = message;
    // A notification carries no id and takes no reply; answering one is how a
    // client ends up waiting for a response to something it never asked.
    const reply = (result) => (id === undefined ? null : { id, result });
    if (method === "initialize") {
      toolName = clientToolName(params?.clientInfo);
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: "meshcue",
          version: JSON.parse(
            fs.readFileSync(path.join(root, "package.json"), "utf8"),
          ).version,
        },
        instructions: instructions(root),
      });
    }
    if (method === "tools/list") return reply({ tools: [TOOL] });
    if (method === "tools/call") {
      const input = params?.arguments || {};
      if (params?.name !== TOOL.name)
        return reply({
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${params?.name}` }],
        });
      if (refusal)
        return reply({
          isError: true,
          content: [{ type: "text", text: JSON.stringify(refusal) }],
        });
      try {
        const result =
          input.action === "inspect"
            ? inspectInstall(context, root)
            : input.action === "precheck"
              ? precheckModel(context, input.file, {
                  derived: await stepMeshFor(context, input.file),
                })
              : await manager().execute(input);
        return reply({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (error) {
        // A refusal is a tool result, not a protocol error: the model has to
        // read it and decide, and a JSON-RPC error would be reported to the
        // user as a broken server instead.
        return reply({
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: error.code || "FAILED",
                message: String(error.message || error),
              }),
            },
          ],
        });
      }
    }
    if (id === undefined) return null;
    return {
      id,
      error: { code: -32601, message: `Unsupported method: ${method}` },
    };
  };
}

export function serve(input, output, options) {
  const handle = createHandler(options);
  let buffer = "";
  input.on("data", async (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "The message is not valid JSON." },
          }) + "\n",
        );
        continue;
      }
      const answer = await handle(message);
      if (answer)
        output.write(JSON.stringify({ jsonrpc: "2.0", ...answer }) + "\n");
    }
  });
}

const invoked =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(path.join(HERE, "server.mjs"));
if (invoked) {
  process.stdin.setEncoding("utf8");
  serve(process.stdin, process.stdout);
}
