import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import {
  FIELDS,
  toolSchema,
  validateToolInput,
} from "../integration/contract.mjs";
import { MAX_AGENT_NAME } from "../server/agent-name.mjs";
import { INPUT_LIMITS } from "../server/input-limits.mjs";
import { createHandler } from "../mcp/server.mjs";
import { InstanceManager } from "../integration/manager.mjs";
import { ReviewStore } from "../server/store.mjs";
import { startReview } from "./helpers/review-server.mjs";

process.env.REVIEW_UPDATE_CHECK = "off";
const repo = process.cwd();
const publication = Object.fromEntries(
  ["name", "version", "units", "label"].map((key) => [
    key,
    "x".repeat(INPUT_LIMITS[key] + 1),
  ]),
);
const legal = [
  { action: "inspect", summary: "" },
  { action: "status", summary: "" },
  { action: "open", ...publication },
  { action: "read", submissionId: "batch", versionId: "ignored id!" },
  {
    action: "echo",
    submissionId: "batch",
    summary: "ok",
    versionId: "ignored id!",
  },
];
// No JSON Schema validator dependency is installed. This minimal evaluator
// implements exactly the keywords emitted for these flat discovery
// contracts; unsupported keywords fail loudly, never silently pass.
function valid(schema, value) {
  for (const key of Object.keys(schema))
    assert.ok(
      [
        "description",
        "default",
        "type",
        "properties",
        "required",
        "additionalProperties",
        "items",
        "enum",
        "const",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "pattern",
        "maxItems",
      ].includes(key),
      `Unsupported schema keyword: ${key}`,
    );
  const types = [].concat(schema.type || []);
  if (
    types.length &&
    !types.some((type) =>
      type === "null"
        ? value === null
        : type === "integer"
          ? Number.isInteger(value)
          : type === "array"
            ? Array.isArray(value)
            : type === "object"
              ? value !== null &&
                typeof value === "object" &&
                !Array.isArray(value)
              : typeof value === type,
    )
  )
    return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (Object.hasOwn(schema, "const") && schema.const !== value) return false;
  if (typeof value === "string") {
    // JSON Schema counts Unicode code points, unlike runtime UTF-16 limits.
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength)
      return false;
    if (schema.maxLength !== undefined && length > schema.maxLength)
      return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
  }
  if (
    typeof value === "number" &&
    ((schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  )
    return false;
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      return false;
    if (schema.items && !value.every((item) => valid(schema.items, item)))
      return false;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (schema.required?.some((key) => !Object.hasOwn(value, key)))
      return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some(
        (key) => !Object.hasOwn(schema.properties || {}, key),
      )
    )
      return false;
    for (const [key, child] of Object.entries(schema.properties || {}))
      if (Object.hasOwn(value, key) && !valid(child, value[key])) return false;
  }
  return true;
}

test("generated flat schemas accept ignored known fields and reject unknown names", () => {
  for (const entry of ["mcp", "cli", "openclaw"]) {
    const schema = toolSchema(entry);
    for (const input of legal) {
      validateToolInput(input, entry);
      assert.equal(
        valid(schema, input),
        true,
        `${entry}: ${JSON.stringify(input)}`,
      );
    }
    assert.equal(valid(schema, { action: "inspect", typo: true }), false);
    // Intentional discovery-only tightening: raw read/echo still ignore any
    // versionId value, but providers get a string type (W2 removes the field).
    for (const action of ["read", "echo"])
      for (const versionId of [null, 42, false, [], { arbitrary: true }]) {
        const input = {
          action,
          submissionId: "batch",
          ...(action === "echo" ? { summary: "ok" } : {}),
          versionId,
        };
        assert.doesNotThrow(() => validateToolInput(input, entry));
        assert.equal(valid(schema, input), false);
      }
    for (const input of [
      { action: "echo", summary: "" },
      { action: "activate", versionId: "ignored id!" },
      { action: "retain", keep: INPUT_LIMITS.keep + 1 },
    ]) {
      assert.throws(() => validateToolInput(input, entry));
      assert.equal(
        valid(schema, input),
        true,
        "action bounds are runtime-only",
      );
    }
    // Portable schema deliberately leaves UTF-16 maxima to runtime, rather
    // than promising a Unicode-code-point bound with different semantics.
    for (const input of [
      { action: "open", file: "part.stl", ...publication },
      {
        action: "open",
        file: "part.stl",
        name: "😀".repeat(INPUT_LIMITS.name / 2 + 1),
      },
    ]) {
      assert.throws(() => validateToolInput(input, entry));
      assert.equal(valid(schema, input), true);
    }
    const padded = {
      action: "open",
      agentName: `  ${"a".repeat(MAX_AGENT_NAME)}  `,
    };
    validateToolInput(padded, entry);
    assert.equal(valid(schema, padded), true);
  }
});

function workspace(t, cleanup = true) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "contract-entries-"));
  if (cleanup) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "web"));
  fs.writeFileSync(path.join(dir, "web/index.html"), "<!doctype html>");
  fs.writeFileSync(
    path.join(dir, "part.stl"),
    "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n",
  );
  return dir;
}

test("actual OpenClaw execute and CLI main ignore irrelevant summary but reject unknown parameters", async (t) => {
  const dir = workspace(t);
  const bundle = path.join(dir, "adapter.mjs");
  const result = await build({
    entryPoints: ["adapters/openclaw/index.mjs"],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
    plugins: [
      {
        name: "fixture-sdk",
        setup(builder) {
          builder.onResolve(
            { filter: /^openclaw\/plugin-sdk\/tool-plugin$/ },
            () => ({ path: "sdk", namespace: "fixture-sdk" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "fixture-sdk" }, () => ({
            contents:
              "export const defineToolPlugin = definition => definition;",
            loader: "js",
          }));
        },
      },
    ],
  });
  fs.writeFileSync(bundle, result.outputFiles[0].text);
  const definition = (await import(pathToFileURL(bundle))).default;
  const native = definition
    .tools((value) => value)[0]
    .factory({
      api: { rootDir: repo },
      config: {},
      toolContext: { workspaceDir: dir, agentId: "fixture" },
    });
  const inspected = await native.execute("call", legal[0]);
  assert.notEqual(inspected.isError, true);
  assert.equal(inspected.details.product, "MeshCue");
  const rejected = await native.execute("call", {
    action: "inspect",
    typo: true,
  });
  assert.equal(rejected.isError, true);
  assert.equal(rejected.details.code, "BAD_USAGE");
  const cli = JSON.parse(
    execFileSync(
      process.execPath,
      ["cli/meshcue.mjs", "inspect", "--workspace", dir, "--summary", ""],
      { cwd: repo, encoding: "utf8" },
    ),
  );
  assert.equal(cli.product, "MeshCue");
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ["cli/meshcue.mjs", "inspect", "--typo", "true"],
        { cwd: repo, stdio: "pipe" },
      ),
    (error) => JSON.parse(error.stdout).error.code === "BAD_USAGE",
  );
});

test("actual MCP tools/call preserves status, reopen and batch-bound read/echo", async (t) => {
  const dir = workspace(t, false);
  const project = "projects/lamp";
  const managerOptions = {
    installRoot: repo,
    serverEntry: path.join(repo, "server/index.mjs"),
    distRoot: path.join(dir, "web"),
    listenHost: "127.0.0.1",
    environment: { REVIEW_BRIDGE: "off" },
  };
  const handle = createHandler({
    workspace: dir,
    environment: { MESHCUE_OWNER: "contract-owner" },
    managerOptions,
  });
  const call = async (input) => {
    const answer = (
      await handle({
        id: 1,
        method: "tools/call",
        params: { name: "meshcue", arguments: { project, ...input } },
      })
    ).result;
    assert.notEqual(answer.isError, true, answer.content[0].text);
    return answer.structuredContent;
  };
  t.after(async () => {
    try {
      await call({ action: "stop" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  await call(legal[0]);
  const opened = await call({ action: "open", file: "part.stl" });
  const status = await call(legal[1]);
  const reopened = await call(legal[2]);
  assert.equal(reopened.active.id, opened.active.id);
  assert.equal(reopened.active.name, opened.active.name);
  await call({ action: "stop" });
  const manager = new InstanceManager(
    { workspaceDir: dir, agentId: "mcp" },
    managerOptions,
  );
  const runtime = manager.project(project).runtime;
  // Seed an immutable saved batch while the isolated service is stopped.
  const store = new ReviewStore(runtime);
  store.state.submissions.push({
    id: "contract-batch",
    versionId: opened.active.id,
    revision: 0,
    createdAt: Date.now(),
    status: "saved",
    sealed: true,
    reviewId: store.state.reviewId,
    bindingId: store.state.bindingId,
    origin: status.origin,
    model: store.state.models[opened.active.id],
    annotations: [],
    camera: null,
  });
  store.save();
  fs.mkdirSync(path.join(runtime, "manifests"), { recursive: true });
  fs.writeFileSync(
    path.join(runtime, "manifests", `${opened.active.id}.json`),
    JSON.stringify({ meshes: [] }),
  );
  await call({ action: "open" });
  for (const versionId of [
    "ignored id!",
    "x".repeat(300),
    { arbitrary: true },
  ]) {
    const read = await call({
      action: "read",
      submissionId: "contract-batch",
      versionId,
    });
    assert.equal(read.submission.versionId, opened.active.id);
    const echo = await call({
      action: "echo",
      submissionId: "contract-batch",
      versionId,
      summary: "Understood.",
    });
    assert.ok(echo);
  }
});

test("HTTP publication persists metadata at shared input limits across restart", async (t) => {
  const f = await startReview(t);
  const metadata = Object.fromEntries(
    ["name", "version", "units"].map((key) => [
      key,
      "a".repeat(INPUT_LIMITS[key]),
    ]),
  );
  const result = await f.ipc("/publish", {
    file: "tmp/samples/parametric-bracket.glb",
    ...metadata,
  });
  assert.equal(result.status, 200);
  const id = result.body.model.id;
  const saved = JSON.parse(
    fs.readFileSync(path.join(f.dir, "state.json"), "utf8"),
  ).models[id];
  for (const [key, value] of Object.entries(metadata))
    assert.equal(saved[key], value, key);
  await f.restart();
  const active = (await f.ipc("/status")).body.active;
  for (const [key, value] of Object.entries(metadata))
    assert.equal(active[key], value, key);
  for (const key of Object.keys(metadata))
    assert.equal(
      (
        await f.ipc("/publish", {
          file: "tmp/samples/parametric-bracket.glb",
          ...metadata,
          [key]: metadata[key] + "a",
        })
      ).status,
      400,
    );
});

test("discovery schemas are flat, explicitly typed and smaller than the pre-contract baseline", () => {
  // Read-only git show 2339407:adapters/openclaw/index.mjs parameters and
  // 2339407:mcp/server.mjs TOOL.inputSchema, evaluated with their imported
  // partGroupsSchema/MAX_AGENT_NAME, then JSON.stringify(...).length (2026-10-10).
  const baseline = { openclaw: 9646, mcp: 8655 };
  // r3 restores minimal group/region shape guidance without recursive schemas.
  // W2B adds only sourceTransform and coordinate guidance: measured 3165/3289 characters.
  // Allow ~5% prose headroom, retaining the pre-contract ceiling and flatness checks.
  const budget = { openclaw: 3330, mcp: 3460 };
  const forbidden = new Set([
    "allOf",
    "anyOf",
    "oneOf",
    "if",
    "then",
    "else",
    "not",
    "$ref",
    "dependentSchemas",
  ]);
  const scan = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(
        forbidden.has(key),
        false,
        `Forbidden discovery keyword: ${key}`,
      );
      scan(child);
    }
  };
  for (const entry of ["openclaw", "mcp", "cli"]) {
    const schema = toolSchema(entry);
    assert.deepEqual(Object.keys(schema).sort(), [
      "additionalProperties",
      "properties",
      "required",
      "type",
    ]);
    assert.deepEqual(schema.required, ["action"]);
    scan(schema);
    for (const [key, property] of Object.entries(schema.properties))
      assert.equal(property.type, FIELDS[key].schema.type, `${entry}.${key}`);
    if (baseline[entry]) {
      const length = JSON.stringify(schema).length;
      assert.ok(length <= baseline[entry]);
      assert.ok(
        length <= budget[entry],
        `${entry}: ${length} > ${budget[entry]}`,
      );
    }
  }
});

test("flat discovery descriptions retain group and verified intended-change region shape guidance", () => {
  for (const entry of ["openclaw", "mcp"]) {
    const { partGroups, annotations } = toolSchema(entry).properties;
    assert.deepEqual(partGroups.items, { type: "object" });
    assert.deepEqual(annotations.items, { type: "object" });
    for (const text of [
      "require id/name",
      "optional members/children",
      "exactly one of nodeIndex/nodeName/partId",
      "whole-tree limits",
      "(root=1)",
      "AGENT-INTERFACE.md § Optional part groups",
    ])
      assert.ok(partGroups.description.includes(text), text);
    for (const text of [
      "verified intended-change regions using full read geometry",
      'required id, type:"region", label, color, faces',
      "view optional",
      "never construct geometry",
      "AGENT-INTERFACE.md § Echo — showing what you understood",
    ])
      assert.ok(annotations.description.includes(text), text);
  }
});

test("runtime reports action, field and limits, including action-required parameters", () => {
  for (const entry of ["openclaw", "mcp", "cli"]) {
    for (const [input, pattern] of [
      [{ action: "echo", submissionId: "batch" }, /summary \(echo\): required/],
      [{ action: "read" }, /submissionId \(read\): required/],
      [{ action: "precheck" }, /file \(precheck\): required/],
      [{ action: "activate" }, /versionId \(activate\): required/],
      [
        { action: "echo", submissionId: "batch", summary: "" },
        new RegExp(`summary \\(echo\\).*1–${INPUT_LIMITS.summary}`),
      ],
      [
        { action: "retain", keep: INPUT_LIMITS.keep + 1 },
        new RegExp(`keep \\(retain\\).*0–${INPUT_LIMITS.keep}`),
      ],
      [{ action: "activate", versionId: "bad id!" }, /versionId \(activate\)/],
    ])
      assert.throws(() => validateToolInput(input, entry), pattern);
  }
});
