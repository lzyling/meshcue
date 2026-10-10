#!/usr/bin/env node
// The base every harness stands on. The OpenClaw adapter reaches the same
// InstanceManager through the plugin SDK; everything else — a person at a
// prompt, an MCP server, a script — reaches it through here. There is one
// implementation underneath, so a path that works in one harness is not a
// separate path that has to be kept working in the others.
//
// Output is JSON on stdout, one object, always. Failures are JSON too, with the
// same `code` the tool layer reports, and a non-zero exit. A caller should
// never have to read prose to find out what happened.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  InstanceManager,
  inspectInstall,
  docPaths,
} from "../integration/manager.mjs";
import { precheckModel, stepMeshFor } from "../integration/precheck.mjs";
import { normalizeOrigin } from "../server/origin.mjs";
import { IntegrationError, scopedPath } from "../integration/context.mjs";
import { PART_GROUP_LIMITS } from "../integration/part-groups.mjs";

import {
  ACTIONS as CONTRACT_ACTIONS,
  FIELDS,
  cliFlags,
  cliSwitches,
  toolSchema,
  validateToolInput,
} from "../integration/contract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALL_ROOT = path.resolve(HERE, "..");

export const ACTIONS = CONTRACT_ACTIONS;
export const FLAGS = cliFlags();
const BOOLEANS = cliSwitches();
const NUMBERS = new Set(
  Object.entries(FLAGS)
    .filter(([, field]) =>
      [FIELDS[field]?.schema.type].flat().includes("integer"),
    )
    .map(([flag]) => flag),
);

// An MCP client is handed the operating instructions during `initialize`. A
// caller reaching this binary gets no such handshake, so the only chance to say
// where the documentation lives is the answer to the question everybody asks
// first. Absolute paths, because the reader is an agent that has to open them.
export function help(installRoot = INSTALL_ROOT) {
  return {
    usage: `meshcue <${ACTIONS.join("|")}> [--option value]…`,
    actions: ACTIONS,
    inputSchema: toolSchema("cli"),
    flags: Object.fromEntries(
      Object.entries(FLAGS).map(([flag, field]) => [
        `--${flag} <value>`,
        field === "partGroupsFile" ? "partGroups" : field,
      ]),
    ),
    switches: Object.fromEntries(
      Object.entries(BOOLEANS).map(([flag, field]) => [
        `--${flag}`,
        `${field}: ${flag !== "no-activate"}`,
      ]),
    ),
    fields: Object.fromEntries(
      Object.entries(FIELDS)
        .filter(([, f]) => f.cli)
        .map(([key, f]) => [
          key,
          {
            description: f.schema.description,
            actions: f.actions,
            defaultBehavior: f.defaultBehavior,
          },
        ]),
    ),
    help: "Use meshcue help or meshcue --help; per-action --help is not supported.",
    partGroups:
      "open --part-groups <workspace-relative JSON file>: optional array; 256 KiB maximum. Membership is resolved in the reviewer browser, not confirmed by publication.",
    up: "open --up <z|y>: file up axis for every format; defaults to z. Use file* or file-tagged fields; source* for registered sources; batch camera is preview only.",
    limits:
      "CLI read returns summaries; full geometry and region echoes require MCP or the host tool.",
    network:
      'New CLI/MCP reviews default to 127.0.0.1; opt into LAN with --host lan (MCP host: "lan") or a verified private IPv4. OpenClaw defaults to automatic private LAN selection with admission. Existing reviews keep their stored host.',
    start:
      "Read AGENT-INTERFACE.md before the first call: it states what each answer does and does not mean, and how to check an install. SKILL.md is the procedure for running a review.",
    docs: docPaths(installRoot),
  };
}

export function parseArgs(argv) {
  const [action, ...rest] = argv;
  const input = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--"))
      throw new IntegrationError("BAD_USAGE", `Unexpected argument: ${token}`);
    const flag = token.slice(2);
    if (flag in BOOLEANS) {
      input[BOOLEANS[flag]] = flag !== "no-activate";
      continue;
    }
    if (!(flag in FLAGS))
      throw new IntegrationError("BAD_USAGE", `Unknown option: --${flag}`);
    const value = rest[++i];
    if (value === undefined || value.startsWith("--"))
      throw new IntegrationError("BAD_USAGE", `--${flag} needs a value.`);
    // Argv is strings all the way down, so a flag whose meaning is a number
    // has to say so here — otherwise "3" reaches a caller expecting 3 and is
    // refused for being the wrong type, which reads as the value being wrong.
    if (NUMBERS.has(flag)) {
      if (!/^\d+$/.test(value))
        throw new IntegrationError(
          "BAD_USAGE",
          `--${flag} takes a whole number.`,
        );
      input[FLAGS[flag]] = Number(value);
      continue;
    }
    input[FLAGS[flag]] = value;
  }
  return { action, input };
}

// A CLI has no conversation to be woken in, so it states an owner and no route.
// The owner has to outlive the process — every invocation is a new one — which
// is why it is given rather than generated: whoever wraps this knows which
// session is asking, and inventing an id here would hand the project to a
// stranger on every call.
export function cliOrigin(owner) {
  if (!owner)
    throw new IntegrationError(
      "MISSING_OWNER",
      "Name the session that owns this review with --owner; one is never invented for you.",
    );
  return normalizeOrigin({
    harness: "cli",
    sessionKey: owner,
    sessionId: owner,
  });
}

export async function run(
  argv,
  {
    cwd = process.cwd(),
    installRoot = INSTALL_ROOT,
    serverEntry = path.join(INSTALL_ROOT, "server/index.mjs"),
    distRoot = path.join(INSTALL_ROOT, "dist"),
    environment,
  } = {},
) {
  if (!argv.length || ["help", "--help", "-h"].includes(argv[0]))
    return help(installRoot);
  const { action, input } = parseArgs(argv);
  if (!action || !ACTIONS.includes(action))
    throw new IntegrationError(
      "BAD_USAGE",
      `Usage: meshcue <${ACTIONS.join("|")}> [--option value]… — run "meshcue help" for the documentation paths.`,
    );
  const workspace = fs.realpathSync(input.workspace || cwd);
  if (input.sourceTransform !== undefined) {
    try {
      input.sourceTransform = JSON.parse(input.sourceTransform);
    } catch {
      throw new IntegrationError(
        "INVALID_INPUT",
        "--source-transform requires a JSON object.",
      );
    }
  }
  if (input.partGroupsFile !== undefined) {
    if (action !== "open" || !input.file)
      throw new IntegrationError(
        "BAD_USAGE",
        "--part-groups is valid only for open with --file.",
      );
    const file = scopedPath(workspace, input.partGroupsFile);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > PART_GROUP_LIMITS.bytes)
      throw new IntegrationError(
        "BAD_USAGE",
        "--part-groups needs a JSON file of at most 256 KiB.",
      );
    try {
      input.partGroups = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw new IntegrationError(
        "BAD_USAGE",
        "--part-groups contains malformed JSON.",
      );
    }
    delete input.partGroupsFile;
  }
  const { workspace: _workspace, owner: _owner, ...toolInput } = input;
  validateToolInput({ ...toolInput, action }, "cli");
  // Orientation comes before ownership: an agent calls this to find out where it
  // is, and demanding --owner first would make the answer conditional on
  // knowing it.
  if (action === "inspect")
    return inspectInstall(
      { workspaceDir: workspace, agentId: "cli" },
      installRoot,
    );
  // Measuring a file needs no instance, no owner and no project.
  if (action === "precheck") {
    if (!input.file)
      throw new IntegrationError("BAD_USAGE", "precheck needs --file.");
    const context = { workspaceDir: workspace, agentId: "cli" };
    return precheckModel(context, input.file, {
      derived: await stepMeshFor(context, input.file),
    });
  }
  const manager = new InstanceManager(
    { workspaceDir: workspace, agentId: "cli" },
    {
      installRoot,
      serverEntry,
      distRoot,
      ...(environment ? { environment } : {}),
      listenHost: "127.0.0.1",
      clientAddress: input.confirmedClientAddress,
      resolveOrigin: () => cliOrigin(input.owner),
    },
  );
  const { workspace: _w, owner: _o, ...rest } = input;
  return manager.execute({ ...rest, action });
}

const invoked =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(HERE + "/meshcue.mjs");
if (invoked) {
  try {
    const result = await run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stdout.write(
      JSON.stringify(
        {
          error: {
            code: error.code || "FAILED",
            message: String(error.message || error),
            ...(error.precheck
              ? { precheck: error.precheck, remediation: error.remediation }
              : {}),
          },
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 1;
  }
}
