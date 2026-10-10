import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ACTIONS,
  FIELDS,
  ENTRY_DIFFERENCES,
  toolSchema,
  cliFlags,
  validateToolInput,
  validateUnknownFields,
} from "../integration/contract.mjs";
import { TOOL, createHandler } from "../mcp/server.mjs";
import {
  ACTIONS as CLI_ACTIONS,
  FLAGS,
  help,
  parseArgs,
  run,
} from "../cli/meshcue.mjs";
import { INPUT_LIMITS, ID_PATTERN } from "../server/input-limits.mjs";
import { syncContractDocs } from "../scripts/sync-contract-docs.mjs";
import {
  MAX_BYTES,
  MAX_TRIANGLES,
  MAX_TEXTURE_BYTES,
  MAX_TEXTURE_EDGE,
} from "../server/models.mjs";
import { MAX_AGENT_NAME } from "../server/agent-name.mjs";
import { PART_GROUP_LIMITS } from "../integration/part-groups.mjs";
import { DEFAULT_SESSION_DAYS } from "../server/access.mjs";
import { IDLE_HOURS } from "../server/idle.mjs";
const read = (file) =>
  fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("three entry action sets and every field schema come from the contract", () => {
  assert.deepEqual(TOOL.inputSchema, toolSchema("mcp"));
  assert.deepEqual(CLI_ACTIONS, ACTIONS);
  assert.deepEqual(help().inputSchema, toolSchema("cli"));
  assert.deepEqual(FLAGS, cliFlags());
  // Native adapter cannot import the host SDK outside OpenClaw; verify the
  // production wiring, then compare its generated profile field by field.
  assert.match(
    read("adapters/openclaw/index.mjs"),
    /parameters = toolSchema\("openclaw"\)/,
  );
  for (const entry of ["mcp", "openclaw", "cli"]) {
    const schema = toolSchema(entry);
    assert.deepEqual(schema.properties.action.enum, ACTIONS);
    assert.equal(schema.additionalProperties, false);
    for (const [key, f] of Object.entries(FIELDS)) {
      if (!schema.properties[key]) assert.ok(ENTRY_DIFFERENCES[entry][key]);
      else assert.deepEqual(schema.properties[key], f.schema);
    }
  }
});

test("each contract action has a manager dispatch or explicit read-only entry handler", () => {
  const manager = read("integration/manager.mjs");
  for (const action of ACTIONS) {
    if (["inspect", "precheck"].includes(action)) {
      for (const file of [
        "cli/meshcue.mjs",
        "mcp/server.mjs",
        "adapters/openclaw/index.mjs",
      ])
        assert.match(read(file), new RegExp(`action === "${action}"`));
    } else assert.match(manager, new RegExp(`action === "${action}"`));
  }
});

test("unknown parameters are rejected before all three entry handlers and manager", async () => {
  for (const entry of ["mcp", "openclaw", "cli"])
    assert.throws(
      () => validateToolInput({ action: "inspect", typo: true }, entry),
      { code: "BAD_USAGE" },
    );
  assert.throws(() => validateUnknownFields({ action: "status", typo: true }), {
    code: "BAD_USAGE",
  });
  assert.throws(
    () => validateToolInput({ action: "open", host: "lan" }, "openclaw"),
    { code: "BAD_USAGE" },
  );
  for (const file of [
    "cli/meshcue.mjs",
    "mcp/server.mjs",
    "adapters/openclaw/index.mjs",
  ])
    assert.match(read(file), /validateToolInput\(/);
  assert.match(
    read("integration/manager.mjs"),
    /validateUnknownFields\(input\)/,
  );
  await assert.rejects(run(["inspect", "--geometry", "true"]), {
    code: "BAD_USAGE",
  });
  const handle = createHandler({ workspace: process.cwd() });
  const result = await handle({
    id: 1,
    method: "tools/call",
    params: { name: "meshcue", arguments: { action: "inspect", typo: true } },
  });
  assert.equal(result.result.isError, true);
  assert.equal(JSON.parse(result.result.content[0].text).code, "BAD_USAGE");
});

test("input limits, null keep, trimming and historical batch version binding", () => {
  for (const key of [
    "name",
    "version",
    "units",
    "label",
    "summary",
    "submissionId",
    "versionId",
  ]) {
    const max = FIELDS[key].schema.maxLength;
    const value = "a".repeat(max);
    validateToolInput(
      { action: key === "summary" ? "echo" : "open", [key]: value },
      "mcp",
    );
    assert.throws(() =>
      validateToolInput({ action: "open", [key]: value + "a" }, "mcp"),
    );
  }
  for (const keep of [undefined, null, 0, INPUT_LIMITS.keep])
    validateToolInput(
      { action: "retain", ...(keep === undefined ? {} : { keep }) },
      "mcp",
    );
  for (const keep of [-1, 1.5, INPUT_LIMITS.keep + 1])
    assert.throws(() => validateToolInput({ action: "retain", keep }, "mcp"), {
      code: "KEEP_REQUIRED",
    });
  assert.equal(
    parseArgs(["retain", "--keep", String(INPUT_LIMITS.keep)]).input.keep,
    INPUT_LIMITS.keep,
  );
  validateToolInput({ action: "open", agentName: "  Ada  " }, "mcp");
  assert.throws(
    () => validateToolInput({ action: "open", agentName: " " }, "mcp"),
    { code: "BAD_AGENT_NAME" },
  );
  assert.throws(
    () => validateToolInput({ action: "open", agentName: "a\u202e" }, "mcp"),
    { code: "BAD_AGENT_NAME" },
  );
  assert.throws(() =>
    validateToolInput({ action: "echo", summary: "" }, "mcp"),
  );
  assert.throws(() =>
    validateToolInput(
      {
        action: "echo",
        annotations: Array(INPUT_LIMITS.annotations + 1).fill({}),
      },
      "mcp",
    ),
  );
  for (const action of ["read", "echo"])
    validateToolInput({ action, versionId: "ignored id!" }, "mcp");
  assert.equal(FIELDS.submissionId.schema.pattern, ID_PATTERN);
});

test("AGENT action and field blocks are exactly generated from the contract", () => {
  const doc = read("AGENT-INTERFACE.md");
  assert.equal(syncContractDocs(doc), doc);
});

test("non-generated model and publication facts remain tied to constants", () => {
  for (const file of [
    "README.md",
    "AGENT-INTERFACE.md",
    "skills/meshcue-review/SKILL.md",
    "adapters/openclaw/index.mjs",
  ]) {
    const doc = read(file);
    assert.ok(
      doc.includes(String(MAX_TRIANGLES)) ||
        doc.includes(MAX_TRIANGLES.toLocaleString("en-US")),
      `${file}: triangles`,
    );
    assert.ok(doc.includes(`${MAX_BYTES / 1024 / 1024} MiB`), `${file}: bytes`);
    for (const format of ["GLB", "glTF", "STL", "STEP"])
      assert.ok(doc.includes(format), `${file}: ${format}`);
  }
  for (const file of ["README.md", "AGENT-INTERFACE.md"]) {
    assert.ok(read(file).includes(`${MAX_TEXTURE_EDGE}×${MAX_TEXTURE_EDGE}`));
    assert.ok(read(file).includes(`${MAX_TEXTURE_BYTES / 1024 / 1024} MiB`));
  }
  for (const file of ["AGENT-INTERFACE.md", "skills/meshcue-review/SKILL.md"]) {
    const doc = read(file);
    assert.match(
      doc,
      new RegExp(`label[\\s\\S]{0,180}${INPUT_LIMITS.label} characters`),
    );
    assert.ok(doc.includes(`1–${MAX_AGENT_NAME} UTF-16 code units`));
    if (file === "AGENT-INTERFACE.md") {
      assert.ok(doc.includes(String(PART_GROUP_LIMITS.groups)));
      assert.ok(doc.includes(String(PART_GROUP_LIMITS.depth)));
      assert.ok(doc.includes(`${PART_GROUP_LIMITS.bytes / 1024} KiB`));
      assert.ok(
        doc.includes(String(PART_GROUP_LIMITS.members)) ||
          doc.includes(PART_GROUP_LIMITS.members.toLocaleString("en-US")),
      );
    }
  }
  assert.match(
    read("skills/meshcue-review/SKILL.md"),
    new RegExp(`expires after ${DEFAULT_SESSION_DAYS}\\s+unused days`),
  );
  assert.equal(
    IDLE_HOURS,
    24,
    "Update one-day idle policy text in manager and SKILL when the default changes",
  );
  // F05/F06/F12/F13/F14 are semantics, not independent numeric facts:
  // shared field descriptions preserve orientation, coordinate frame, host,
  // readonly precheck and grouping omission/clear rules in the generated block.
  assert.match(FIELDS.up.schema.description, /published file coordinates/);
  assert.match(
    FIELDS.partGroups.schema.description,
    /Omit to keep.*\[\] clears/,
  );
});
