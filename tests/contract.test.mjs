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
  flatFieldSchema,
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
import {
  INPUT_LIMITS,
  ID_PATTERN,
  DEFAULT_STALL_AFTER,
} from "../server/input-limits.mjs";
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
      else {
        assert.deepEqual(schema.properties[key], flatFieldSchema(key));
      }
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
    const action =
      key === "summary" || key === "submissionId"
        ? "echo"
        : key === "versionId"
          ? "activate"
          : "open";
    validateToolInput(
      {
        action,
        file: "part.stl",
        submissionId: "batch",
        summary: "ok",
        [key]: value,
      },
      "mcp",
    );
    assert.throws(() =>
      validateToolInput(
        {
          action,
          file: "part.stl",
          submissionId: "batch",
          summary: "ok",
          [key]: value + "a",
        },
        "mcp",
      ),
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
    validateToolInput(
      {
        action,
        submissionId: "batch",
        summary: "ok",
        versionId: "ignored id!",
      },
      "mcp",
    );
  assert.equal(FIELDS.submissionId.schema.pattern, ID_PATTERN);
});

test("AGENT action and field blocks are exactly generated from the contract", () => {
  const doc = read("AGENT-INTERFACE.md");
  assert.equal(syncContractDocs(doc), doc);
});

// Remove every generated block first: a refreshed field table must never hide
// stale prose, including the independently generated reviewer-help block.
function prose(source) {
  return source.replace(/<!-- ([\w-]+):begin -->[\s\S]*?<!-- \1:end -->/g, "");
}
function section(source, heading) {
  const body = prose(source);
  const start = body.indexOf(heading);
  assert.notEqual(start, -1, heading);
  const next = body.slice(start + heading.length).search(/\n#{1,3} /);
  return body.slice(
    start,
    next < 0 ? undefined : start + heading.length + next,
  );
}
function assertFacts(file, source) {
  const doc = prose(source);
  const triangles = MAX_TRIANGLES.toLocaleString("en-US");
  const mib = MAX_BYTES / 1024 / 1024;
  if (["README.md", "AGENT-INTERFACE.md"].includes(file)) {
    for (const [row, value] of [
      ["Triangles", triangles],
      ["File size", `${mib} MiB`],
      [
        "Textures",
        `${MAX_TEXTURE_EDGE}×${MAX_TEXTURE_EDGE} each, ${MAX_TEXTURE_BYTES / 1024 / 1024} MiB estimated GPU memory`,
      ],
    ]) {
      const line = doc
        .split("\n")
        .find((line) => new RegExp(`^\\| ${row}\\s*\\|`).test(line));
      assert.ok(line, `${file}: budget row ${row}`);
      assert.equal(
        line
          .split("|")[2]
          .replaceAll("**", "")
          .trim()
          .replace(" (RGBA8 + mipmaps)", ""),
        value,
        `${file}: ${row}`,
      );
    }
  }
  if (file === "AGENT-INTERFACE.md") {
    assert.ok(
      doc.includes(
        `The publication \`label\` is optional and limited to ${INPUT_LIMITS.label} characters (UTF-16 code`,
      ),
    );
    assert.ok(
      doc.includes(
        `trimmed to 1–${MAX_AGENT_NAME} UTF-16 code units with control/bidi characters rejected`,
      ),
    );
    assert.ok(
      doc.includes(
        `Limits are ${PART_GROUP_LIMITS.groups} groups total, depth ${PART_GROUP_LIMITS.depth} (root = 1), ${PART_GROUP_LIMITS.members.toLocaleString("en-US")} members total,\nand ${PART_GROUP_LIMITS.bytes / 1024} KiB`,
      ),
    );
    assert.ok(doc.includes(`a ${PART_GROUP_LIMITS.bytes / 1024} KiB file\n`));
    assert.ok(
      doc.includes(
        `failure threshold (default ${DEFAULT_STALL_AFTER} attempts; REVIEW_STALL_AFTER can override it)`,
      ),
    );
    assert.ok(
      doc.includes(
        `summary is 1–${INPUT_LIMITS.summary} UTF-16 code units, with\nat most ${INPUT_LIMITS.annotations} regions.`,
      ),
    );
  }
  if (file === "skills/meshcue-review/SKILL.md") {
    const precheck = section(source, "## 3.");
    const publishing = section(source, "## 4.");
    assert.ok(
      precheck.includes(
        `The limits are ${MAX_TRIANGLES} triangles and ${mib} MiB`,
      ),
    );
    assert.ok(
      publishing.includes(
        `at most ${INPUT_LIMITS.label} characters (UTF-16 code units)`,
      ),
    );
    assert.ok(
      publishing.includes(`trimmed to 1–${MAX_AGENT_NAME} UTF-16 code units`),
    );
    assert.ok(
      publishing.includes(`expires after ${DEFAULT_SESSION_DAYS}\nunused days`),
    );
    const idle = section(source, "## 9.");
    assert.ok(idle.includes(`has used for ${IDLE_HOURS} hours closes itself`));
  }
  if (file === "adapters/openclaw/index.mjs")
    assert.ok(
      doc.includes(
        `Model limits are ${MAX_TRIANGLES} triangles and ${mib} MiB`,
      ),
    );
  for (const format of ["GLB", "glTF", "STL", "STEP"])
    assert.ok(doc.includes(format), `${file}: ${format}`);
}
test("non-generated model and publication facts remain tied to constants", () => {
  for (const file of [
    "README.md",
    "AGENT-INTERFACE.md",
    "skills/meshcue-review/SKILL.md",
    "adapters/openclaw/index.mjs",
  ])
    assertFacts(file, read(file));
  assert.match(FIELDS.up.schema.description, /published file coordinates/);
  assert.match(
    FIELDS.partGroups.schema.description,
    /Omit to keep.*\[\] clears/,
  );
});
test("synced generated blocks cannot mask stale named prose facts", () => {
  const agent = read("AGENT-INTERFACE.md");
  for (const old of [
    `**${MAX_TRIANGLES.toLocaleString("en-US")}**`,
    `**${MAX_BYTES / 1024 / 1024} MiB**`,
    `${MAX_TEXTURE_EDGE}×${MAX_TEXTURE_EDGE}`,
    `**${MAX_TEXTURE_BYTES / 1024 / 1024} MiB**`,
    `limited to ${INPUT_LIMITS.label} characters`,
    `trimmed to 1–${MAX_AGENT_NAME} UTF-16`,
    `${PART_GROUP_LIMITS.groups} groups total`,
    `depth ${PART_GROUP_LIMITS.depth} (root = 1)`,
    `${PART_GROUP_LIMITS.members.toLocaleString("en-US")} members total`,
    `and ${PART_GROUP_LIMITS.bytes / 1024} KiB`,
    `a ${PART_GROUP_LIMITS.bytes / 1024} KiB file`,
    `default ${DEFAULT_STALL_AFTER} attempts`,
    `summary is 1–${INPUT_LIMITS.summary}`,
    `at most ${INPUT_LIMITS.annotations} regions`,
  ]) {
    assert.ok(prose(agent).includes(old), old);
    const stale = syncContractDocs(
      agent.replace(
        old,
        old.replace(/\d/, (digit) => String((Number(digit) + 1) % 10)),
      ),
    );
    assert.equal(syncContractDocs(stale), stale);
    assert.throws(
      () => assertFacts("AGENT-INTERFACE.md", stale),
      undefined,
      old,
    );
  }
  const skill = read("skills/meshcue-review/SKILL.md");
  for (const old of [
    `${MAX_TRIANGLES} triangles`,
    `${MAX_BYTES / 1024 / 1024} MiB`,
    `at most ${INPUT_LIMITS.label} characters`,
    `trimmed to 1–${MAX_AGENT_NAME}`,
    `after ${DEFAULT_SESSION_DAYS}\nunused days`,
    `has used for ${IDLE_HOURS} hours`,
  ]) {
    assert.ok(prose(skill).includes(old), old);
    assert.throws(
      () =>
        assertFacts(
          "skills/meshcue-review/SKILL.md",
          skill.replace(
            old,
            old.replace(/\d/, (digit) => String((Number(digit) + 1) % 10)),
          ),
        ),
      undefined,
      old,
    );
  }
});
