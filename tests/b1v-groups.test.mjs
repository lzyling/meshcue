import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { INTEGRATION_API } from "../server/instance.mjs";
import * as THREE from "three";
import {
  normalizePartGroups,
  partGroupsSchema,
  PART_GROUP_LIMITS,
} from "../integration/part-groups.mjs";
import { ReviewStore } from "../server/store.mjs";
import {
  InstanceManager,
  inspectInstall,
  requirePartGroupsRuntime,
} from "../integration/manager.mjs";
import { run, parseArgs, help } from "../cli/meshcue.mjs";
import { TOOL } from "../mcp/server.mjs";
import { startReview } from "./helpers/review-server.mjs";
import { stopManagedReview } from "./helpers/managed-server.mjs";
import { buildPartTree, createParts } from "../src/viewer/parts-tree.js";
import { resolvePartGroups } from "../src/viewer/part-groups.js";
import { ModelViewer } from "../src/viewer.js";

process.env.REVIEW_UPDATE_CHECK = "off";
const repo = process.cwd();
const group = (extra = {}) => ({ id: "a", name: "  A  ", ...extra });
const doc = (extra = {}) => [group(extra)];
const invalid = (value) =>
  assert.throws(() => normalizePartGroups(value), {
    code: "ERROR",
    status: 400,
  });
const bytes = (value) =>
  Buffer.byteLength(JSON.stringify(normalizePartGroups(value)));
function temp(t, cleanup = true) {
  fs.mkdirSync("tmp", { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "b1v-groups-"));
  if (cleanup) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const model = (id = "one") => ({
  id,
  name: "Model",
  version: "v1",
  filename: `${id}.glb`,
  sha256: id,
  publishedAt: 1,
});
const makeStore = (t) => new ReviewStore(temp(t));
function chain(depth) {
  let child = group({ id: `g${depth}` });
  for (let i = depth - 1; i > 0; i--)
    child = group({ id: `g${i}`, children: [child] });
  return [child];
}
function byteDocument(target) {
  const value = doc({
    members: Array.from({ length: 1000 }, () => ({
      nodeName: "x".repeat(256),
    })),
  });
  // ASCII lets this fixture hit the exact normalized byte boundary, not merely
  // a nearby number that happened to fail with one JavaScript string encoding.
  const normalized = [{ ...value[0], children: [] }];
  let excess = Buffer.byteLength(JSON.stringify(normalized)) - target;
  for (const ref of value[0].members) {
    const reduction = Math.min(excess, 255);
    ref.nodeName = ref.nodeName.slice(reduction);
    excess -= reduction;
    if (!excess) break;
  }
  assert.equal(excess, 0);
  return value;
}

test("partGroups normalizes optional arrays and preserves explicit spelling and overlaps", () => {
  assert.deepEqual(normalizePartGroups([]), []);
  const refs = [
    { nodeIndex: 0 },
    { nodeName: "Same" },
    { partId: "part-0.1" },
    { nodeIndex: 0 },
  ];
  assert.deepEqual(
    normalizePartGroups(
      doc({ members: refs, children: [group({ id: "b", name: "  A  " })] }),
    ),
    [
      {
        id: "a",
        name: "  A  ",
        members: refs,
        children: [{ id: "b", name: "  A  ", members: [], children: [] }],
      },
    ],
  );
});

test("partGroups rejects unknown keys combined selectors and duplicate group ids", () => {
  for (const value of [
    null,
    {},
    ["a"],
    doc({ unknown: 1 }),
    doc({ children: [group()] }),
    doc({ members: ["part-0"] }),
    doc({ members: [{}] }),
    doc({ members: [{ nodeIndex: 0, nodeName: "A" }] }),
    doc({ members: [{ meshId: "mesh-0" }] }),
    doc({ members: [{ partId: "part-0", extra: true }] }),
    doc({ children: null }),
  ])
    invalid(value);
});

test("partGroups enforces exact text identifier and selector boundaries", () => {
  normalizePartGroups([
    {
      id: "x".repeat(64),
      name: "x".repeat(96),
      members: [
        { nodeName: "x".repeat(256) },
        { partId: `part-${"0".repeat(507)}` },
        { nodeIndex: 0 },
      ],
    },
  ]);
  for (const name of [
    "",
    "  ",
    "x".repeat(97),
    "a\nb",
    "a\rb",
    "a\tb",
    "a\u007fb",
    "a\u0085b",
    "a\u061cb",
    "a\u2028b",
    "a\u202eb",
    "a\u2066b",
  ])
    invalid(doc({ name }));
  for (const id of ["", "x".repeat(65), "bad.id", "中文"]) invalid(doc({ id }));
  for (const member of [
    { nodeName: "" },
    { nodeName: "x".repeat(257) },
    { nodeIndex: -1 },
    { nodeIndex: 0.5 },
    { nodeIndex: "0" },
    { partId: "mesh-0" },
    { partId: "part-0." },
    { partId: `part-${"0".repeat(508)}` },
  ])
    invalid(doc({ members: [member] }));
  assert.equal(
    normalizePartGroups(doc({ name: "<b>组件</b>" }))[0].name,
    "<b>组件</b>",
  );
});

test("partGroups checks total group and depth limits including boundary plus one", () => {
  normalizePartGroups(
    Array.from({ length: 256 }, (_, i) => group({ id: `g${i}` })),
  );
  invalid(Array.from({ length: 257 }, (_, i) => group({ id: `g${i}` })));
  invalid([
    group({
      children: Array.from({ length: 256 }, (_, i) => group({ id: `g${i}` })),
    }),
  ]);
  normalizePartGroups(chain(8));
  invalid(chain(9));
  invalid(chain(10000));
});

test("partGroups checks total members and normalized UTF-8 byte boundary plus one", () => {
  normalizePartGroups(
    doc({ members: Array.from({ length: 4096 }, () => ({ nodeIndex: 0 })) }),
  );
  invalid(
    doc({ members: Array.from({ length: 4097 }, () => ({ nodeIndex: 0 })) }),
  );
  invalid(
    doc({
      members: Array.from({ length: 4096 }, () => ({ nodeIndex: 0 })),
      children: [group({ id: "b", members: [{ partId: "part-0" }] })],
    }),
  );
  assert.equal(
    bytes(byteDocument(PART_GROUP_LIMITS.bytes)),
    PART_GROUP_LIMITS.bytes,
  );
  invalid(byteDocument(PART_GROUP_LIMITS.bytes + 1));
  invalid(
    doc({
      members: Array.from({ length: 1000 }, () => ({
        nodeName: "界".repeat(256),
      })),
    }),
  );
});

test("stored optional groups survive reopen without migrating old state or changing model and draft", (t) => {
  const store = makeStore(t);
  store.publish(model());
  assert.equal(store.state.schemaVersion, 2);
  assert.equal(store.state.partGroups, undefined);
  const savedModel = structuredClone(store.state.models.one);
  const before = JSON.stringify({
    drafts: store.state.drafts,
    echoes: store.state.echoes,
  });
  store.publish(model(), undefined, {
    activate: false,
    partGroups: doc({ members: [{ partId: "part-0" }] }),
  });
  const reopened = new ReviewStore(store.dir);
  assert.deepEqual(
    reopened.publicState("").partGroups,
    normalizePartGroups(doc({ members: [{ partId: "part-0" }] })),
  );
  assert.deepEqual(reopened.state.models.one, savedModel);
  assert.equal(
    JSON.stringify({
      drafts: reopened.state.drafts,
      echoes: reopened.state.echoes,
    }),
    before,
  );
  assert.equal(reopened.state.schemaVersion, 2);
});

test("same-content groups replace only when supplied and [] clears with an additive notice", (t) => {
  const store = makeStore(t);
  store.publish(model(), undefined, { partGroups: doc() });
  assert.equal(
    store.publish(model(), undefined, { activate: false }).notices.length,
    1,
  );
  assert.deepEqual(store.state.partGroups.one, normalizePartGroups(doc()));
  const result = store.publish(model(), undefined, {
    activate: false,
    partGroups: [],
  });
  assert.deepEqual(
    result.notices.map((n) => n.code),
    ["SAME_CONTENT_REUSED", "PART_GROUPS_REPLACED"],
  );
  assert.equal(result.notices[1].message, "groups of v1 replaced");
  assert.deepEqual(store.publicState("").partGroups, []);
  const before = JSON.stringify(store.state);
  assert.throws(
    () =>
      store.publish(model("two"), undefined, { partGroups: doc({ bad: 1 }) }),
    { code: "ERROR" },
  );
  assert.equal(JSON.stringify(store.state), before);
});

test("browser state serves viewed version groups not necessarily active version groups", (t) => {
  const store = makeStore(t);
  store.publish(model(), undefined, { partGroups: doc() });
  store.publish(model("two"), undefined, { activate: false });
  assert.deepEqual(
    store.publicState("", "one").partGroups,
    normalizePartGroups(doc()),
  );
  assert.equal(store.publicState("", "two").partGroups, undefined);
  assert.equal(store.publicState("", "two").active.id, "one");
});

test("HTTP rejects malformed groups before importing and advertises running feature support", async (t) => {
  const f = await startReview(t);
  const initial = fs.readFileSync(path.join(f.dir, "state.json"), "utf8");
  const result = await f.ipc("/publish", {
    file: "does-not-exist.glb",
    partGroups: doc({ members: [{ nodeIndex: 0, partId: "part-0" }] }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "ERROR");
  assert.match(result.body.error, /partGroups/);
  assert.equal(
    fs.readFileSync(path.join(f.dir, "state.json"), "utf8"),
    initial,
  );
  assert.equal(
    fs.existsSync(path.join(f.dir, "models")) &&
      fs.readdirSync(path.join(f.dir, "models")).length > 0,
    false,
  );
  for (const result of [
    (await f.api("health")).body,
    (await f.api("state")).body,
    (await f.ipc("/status")).body,
  ])
    assert.equal(result.features.partGroups, 1);
});

test("HTTP keeps per-version groups across restart and passive same-content replacement", async (t) => {
  const f = await startReview(t);
  const file = "tmp/samples/parametric-bracket.glb";
  const published = await f.ipc("/publish", {
    file,
    version: "grouped",
    partGroups: doc(),
  });
  assert.equal(published.status, 200);
  const active = published.body.model;
  await f.restart();
  assert.deepEqual(
    (await f.api("state")).body.partGroups,
    normalizePartGroups(doc()),
  );
  await f.ipc("/publish", { file });
  assert.deepEqual(
    (await f.api("state")).body.partGroups,
    normalizePartGroups(doc()),
  );
  const cleared = await f.ipc("/publish", {
    file,
    partGroups: [],
    activate: false,
  });
  assert.equal(cleared.body.notices[1].code, "PART_GROUPS_REPLACED");
  assert.deepEqual((await f.api("state")).body.partGroups, []);
  assert.deepEqual((await f.ipc("/status")).body.active, active);
});

function managed(t) {
  const dir = temp(t, false);
  fs.writeFileSync(
    path.join(dir, "part.stl"),
    "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n",
  );
  fs.writeFileSync(
    path.join(dir, "openclaw.plugin.json"),
    JSON.stringify({ id: "meshcue" }),
  );
  fs.mkdirSync(path.join(dir, "web"));
  fs.writeFileSync(path.join(dir, "web/index.html"), "<title>fixture</title>");
  const origin = {
    harness: "cli",
    sessionKey: "group-test",
    sessionId: "group-test",
  };
  const options = {
    installRoot: dir,
    serverEntry: path.join(repo, "server/index.mjs"),
    distRoot: path.join(dir, "web"),
    environment: { REVIEW_BRIDGE: "off" },
    listenHost: "127.0.0.1",
    resolveOrigin: () => origin,
  };
  const manager = new InstanceManager(
    { workspaceDir: dir, agentId: "cli" },
    options,
  );
  t.after(async () => {
    const projects = path.join(dir, "projects");
    if (fs.existsSync(projects))
      for (const name of fs.readdirSync(projects)) {
        if (name !== "meshcue-state")
          await stopManagedReview(manager, `projects/${name}`);
      }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, manager, options: { ...options, cwd: dir } };
}

test("manager validates grouping before creating a project and rejects metadata-only open", async (t) => {
  const f = managed(t);
  await assert.rejects(
    f.manager.execute({
      action: "open",
      project: "projects/new",
      file: "part.stl",
      partGroups: doc({ unknown: 1 }),
    }),
    { code: "ERROR" },
  );
  assert.equal(fs.existsSync(path.join(f.dir, "projects")), false);
  await assert.rejects(
    f.manager.execute({
      action: "open",
      project: "projects/new",
      partGroups: [],
    }),
    { code: "ERROR" },
  );
  assert.equal(fs.existsSync(path.join(f.dir, "projects")), false);
});

test("manager fails OLD_RUNTIME before grouped publication without silently stripping metadata", async (t) => {
  assert.throws(() => requirePartGroupsRuntime({}), { code: "OLD_RUNTIME" });
  requirePartGroupsRuntime({ features: { partGroups: 1 } });
  const f = managed(t);
  const originalEnsure = f.manager.ensure.bind(f.manager);
  f.manager.ensure = async (...args) => {
    const state = await originalEnsure(...args);
    delete state.features;
    return state;
  };
  await assert.rejects(
    f.manager.execute({
      action: "open",
      project: "projects/old",
      file: "part.stl",
      partGroups: doc(),
    }),
    { code: "OLD_RUNTIME" },
  );
  const p = f.manager.project("projects/old");
  const state = JSON.parse(fs.readFileSync(path.join(p.runtime, "state.json")));
  assert.equal(Object.keys(state.models).length, 0);
  assert.equal(state.partGroups, undefined);
});

test("CLI transports grouping JSON through open and same-content clear", async (t) => {
  const f = managed(t);
  fs.writeFileSync(
    path.join(f.dir, "groups.json"),
    JSON.stringify(doc({ members: [{ partId: "part-0" }] })),
  );
  const args = ["--owner", "group-test", "--project", "projects/cli"];
  const result = await run(
    ["open", ...args, "--file", "part.stl", "--part-groups", "groups.json"],
    f.options,
  );
  assert.equal(result.publication, "active");
  const status = await run(["status", ...args], f.options);
  assert.deepEqual(
    status.partGroups,
    normalizePartGroups(doc({ members: [{ partId: "part-0" }] })),
  );
  fs.writeFileSync(path.join(f.dir, "groups.json"), "[]");
  const reused = await run(
    ["open", ...args, "--file", "part.stl", "--part-groups", "groups.json"],
    f.options,
  );
  assert.ok(reused.notices.some((n) => n.code === "PART_GROUPS_REPLACED"));
  assert.deepEqual((await run(["status", ...args], f.options)).partGroups, []);
});

test("CLI rejects malformed oversize and out-of-workspace grouping files before open", async (t) => {
  const f = managed(t);
  const base = [
    "open",
    "--owner",
    "group-test",
    "--project",
    "projects/new",
    "--file",
    "part.stl",
    "--part-groups",
  ];
  fs.writeFileSync(path.join(f.dir, "groups.json"), "{");
  await assert.rejects(run([...base, "groups.json"], f.options), {
    code: "BAD_USAGE",
  });
  fs.writeFileSync(
    path.join(f.dir, "groups.json"),
    " ".repeat(PART_GROUP_LIMITS.bytes + 1),
  );
  await assert.rejects(run([...base, "groups.json"], f.options), {
    code: "BAD_USAGE",
  });
  await assert.rejects(run([...base, "../groups.json"], f.options), {
    code: "PATH_SCOPE",
  });
  await assert.rejects(
    run([...base, path.join(f.dir, "groups.json")], f.options),
    { code: "PATH_SCOPE" },
  );
  fs.symlinkSync(
    path.join(repo, "package.json"),
    path.join(f.dir, "escape.json"),
  );
  await assert.rejects(run([...base, "escape.json"], f.options), {
    code: "PATH_SCOPE",
  });
  await assert.rejects(
    run(["status", "--part-groups", "groups.json"], f.options),
    { code: "BAD_USAGE" },
  );
  assert.equal(fs.existsSync(path.join(f.dir, "projects")), false);
  assert.equal(help().flags["--part-groups <value>"], "partGroups");
  assert.equal(
    parseArgs(["open", "--part-groups", "groups.json"]).input.partGroupsFile,
    "groups.json",
  );
});

test("MCP and native schemas share strict grouping shape without changing the integration API", async (t) => {
  assert.equal(TOOL.inputSchema.properties.partGroups, partGroupsSchema);
  const native = fs.readFileSync("adapters/openclaw/index.mjs", "utf8");
  assert.match(
    native,
    /import \{ toolSchema, validateToolInput \} from "\.\.\/\.\.\/integration\/contract\.mjs"/,
  );
  assert.match(native, /parameters = toolSchema\("openclaw"\)/);
  // Evaluate the actual native tool definition with only its public host SDK
  // entry mocked. No factory runs, so this neither reads host credentials nor
  // requires a globally installed OpenClaw package to test schema parity.
  const bundle = path.join(temp(t), "native-schema.mjs");
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
  const parameters = definition.tools((value) => value)[0].parameters;
  assert.deepEqual(
    parameters.properties.partGroups,
    TOOL.inputSchema.properties.partGroups,
  );
  assert.deepEqual(parameters.properties.up, TOOL.inputSchema.properties.up);
  assert.equal(INTEGRATION_API, 2);
  let schema = partGroupsSchema.items;
  for (let depth = 1; depth <= 8; depth++) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["id", "name"]);
    assert.equal(schema.properties.members.items.oneOf.length, 3);
    for (const selector of schema.properties.members.items.oneOf)
      assert.equal(selector.additionalProperties, false);
    if (depth === 8) assert.equal(schema.properties.children.maxItems, 0);
    else schema = schema.properties.children.items;
  }
  assert.equal(
    inspectInstall({ workspaceDir: repo, agentId: "fixture" }, repo).features
      .partGroups,
    1,
  );
});

function nativeFixture() {
  const scene = new THREE.Scene(),
    parent = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
  parent.name = "Assembly";
  parent.userData.reviewId = "m0";
  const a = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  a.name = "Same";
  a.userData.reviewId = "m1";
  a.position.x = 5;
  const b = a.clone();
  b.userData = { reviewId: "m2" };
  b.position.x = -5;
  parent.add(a, b);
  scene.add(parent);
  const tree = buildPartTree(scene, {
    sourceNodes: new Map([
      [parent, { nodeIndex: 0, nodeName: "Assembly" }],
      [a, { nodeIndex: 1, nodeName: "Same" }],
      [b, { nodeIndex: 2, nodeName: "Same" }],
    ]),
  });
  return { tree, scene };
}

test("resolver resolves exact node index name and native part id and rejects duplicate names", () => {
  const { tree } = nativeFixture();
  const result = resolvePartGroups(
    doc({
      members: [
        { nodeIndex: 1 },
        { partId: "part-0.1" },
        { nodeName: "Assembly" },
        { nodeName: "Same" },
        { nodeName: "assembly" },
        { nodeIndex: 99 },
      ],
    }),
    tree.entries,
    tree.identities,
  );
  assert.deepEqual(result.entries[0].meshIds, ["m1", "m2", "m0"]);
  assert.deepEqual(
    result.issues.map((i) => i.reason),
    ["ambiguous", "missing", "missing"],
  );
  assert.equal(
    result.entries.some((p) => p.id === "agent-other"),
    false,
  );
  const duplicate = new Map(tree.identities);
  duplicate.set("part-0.1", { nodeIndex: 1, nodeName: "Same" });
  assert.equal(
    resolvePartGroups(
      doc({ members: [{ nodeIndex: 1 }] }),
      tree.entries,
      duplicate,
    ).issues[0].reason,
    "ambiguous",
  );
});

test("resolver unions overlap and child groups and preserves residual non-leaf mesh ownership", () => {
  const { tree } = nativeFixture();
  const result = resolvePartGroups(
    doc({
      members: [{ nodeIndex: 1 }, { partId: "part-0.0" }],
      children: [group({ id: "b", members: [{ nodeIndex: 2 }] })],
    }),
    tree.entries,
    tree.identities,
  );
  assert.deepEqual(result.entries[0].meshIds, ["m1", "m2"]);
  assert.deepEqual(result.entries.find((p) => p.id === "agent-other").meshIds, [
    "m0",
  ]);
  assert.deepEqual(
    result.entries.find((p) => p.id === "agent-other:part-0").meshIds,
    ["m0"],
  );
  assert.ok(result.firstAlias.get("part-0.0").startsWith("agent-member:a:0:"));
  assert.equal(
    result.entries.filter((p) => p.id.startsWith("agent-other:")).length,
    1,
  );
});

test("projection actions bounds and shared native visibility never rewrite the native list", () => {
  const { tree, scene } = nativeFixture();
  scene.updateMatrixWorld(true);
  const parts = createParts();
  parts.reset(tree);
  const before = parts.list();
  parts.setGroups(
    normalizePartGroups(
      doc({
        members: [{ nodeIndex: 1 }],
        children: [group({ id: "b", members: [{ nodeIndex: 2 }] })],
      }),
    ),
  );
  parts.setView("agent");
  parts.setVisible("agent-group:a", false);
  assert.equal(parts.meshVisible("m1"), false);
  assert.equal(parts.meshVisible("m2"), false);
  assert.equal(parts.meshVisible("m0"), true);
  parts.setView("file");
  assert.equal(parts.isVisible("part-0.0"), false);
  parts.isolate(["agent-group:a"]);
  assert.equal(parts.meshVisible("m0"), false);
  parts.setTransparent("agent-group:a", true);
  assert.equal(parts.meshPickable("m1"), false);
  assert.equal(
    parts.bounds("agent-group:a").getSize(new THREE.Vector3()).x,
    11,
  );
  assert.equal(parts.bounds("agent-other").getSize(new THREE.Vector3()).x, 1);
  parts.setGroups([]);
  assert.equal(parts.meshVisible("m0"), false);
  parts.restoreAll();
  assert.equal(parts.meshPickable("m0"), true);
  assert.equal(parts.meshPickable("m1"), true);
  assert.deepEqual(parts.list(), before);
});

function packed(json) {
  const binary = Buffer.from(
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer,
  );
  const body = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ byteLength: binary.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      scene: 0,
      ...json,
    }),
  );
  const padded = Buffer.concat([
      body,
      Buffer.alloc((4 - (body.length % 4)) % 4, 32),
    ]),
    header = Buffer.alloc(20),
    tail = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  tail.writeUInt32LE(binary.length);
  tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, tail, binary]);
}
async function load(bytes, format = "glb") {
  const viewer = Object.assign(Object.create(ModelViewer.prototype), {
    root: new THREE.Group(),
    grid: new THREE.Object3D(),
    meshMap: new Map(),
    meshes: [],
    loadingEpoch: 0,
    parts: createParts(),
    clearModel() {},
    home() {},
    async onReady() {},
  });
  await viewer.load(
    {
      id: "test",
      name: "STL label",
      format,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    `data:application/octet-stream;base64,${bytes.toString("base64")}`,
  );
  return viewer.parts;
}

test("loaded GLB keeps original names indices and multi-primitive ownership without renumbering", async () => {
  const parts = await load(
    packed({
      nodes: [
        { children: [1, 2, 3], name: "Root" },
        { mesh: 0, name: "Same name" },
        { mesh: 0, name: "Same name" },
        { mesh: 0 },
      ],
      scenes: [{ nodes: [0] }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 } },
            { attributes: { POSITION: 0 } },
          ],
        },
      ],
    }),
  );
  assert.deepEqual(
    parts.list().map((p) => p.id),
    ["part-0", "part-0.0", "part-0.1", "part-0.2"],
  );
  assert.deepEqual(
    parts.list().map((p) => p.name),
    ["Root", "Same name", "Same name", "Part 4"],
  );
  assert.equal(parts.list()[1].meshIds.length, 2);
  const result = resolvePartGroups(
    doc({
      members: [
        { nodeIndex: 1 },
        { nodeName: "Same name" },
        { nodeName: "Part 4" },
      ],
    }),
    parts.list(),
    parts.identities(),
  );
  assert.equal(result.entries[0].meshIds.length, 2);
  assert.deepEqual(
    result.issues.map((i) => i.reason),
    ["ambiguous", "missing"],
  );
});

test("construction helper replacement preserves source association and excludes other scenes", async () => {
  const parts = await load(
    packed({
      nodes: [
        { mesh: 1, children: [1], name: "Line parent" },
        { mesh: 0, name: "Surface" },
        { mesh: 0, name: "Other scene" },
        { mesh: 1, name: "Only line" },
      ],
      scenes: [{ nodes: [0, 3] }, { nodes: [2] }],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 0 }, mode: 1 }] },
      ],
    }),
  );
  assert.deepEqual(
    parts.list().map((p) => p.id),
    ["part-0", "part-0.0"],
  );
  const result = resolvePartGroups(
    doc({
      members: [
        { nodeIndex: 0 },
        { nodeName: "Line parent" },
        { nodeIndex: 2 },
        { nodeIndex: 3 },
      ],
    }),
    parts.list(),
    parts.identities(),
  );
  assert.deepEqual(result.entries[0].meshIds, ["mesh-0"]);
  assert.equal(result.issues.length, 2);
});

test("STL remains part-0 and its display label is not a nodeName selector", async () => {
  const parts = await load(
    Buffer.from(
      "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n",
    ),
    "stl",
  );
  assert.deepEqual(
    parts.list().map((p) => p.id),
    ["part-0"],
  );
  const result = resolvePartGroups(
    doc({
      members: [
        { partId: "part-0" },
        { nodeName: "STL label" },
        { nodeIndex: 0 },
      ],
    }),
    parts.list(),
    parts.identities(),
  );
  assert.deepEqual(result.entries[0].meshIds, ["mesh-0"]);
  assert.deepEqual(
    result.issues.map((i) => i.reason),
    ["missing", "missing"],
  );
});

test("selected middle scenes retain parser clone indices and duplicate occurrences bind nothing", async () => {
  const parts = await load(
    packed({
      scene: 1,
      nodes: [
        { mesh: 0, name: "Shared" },
        { mesh: 0, name: "Other" },
      ],
      scenes: [{ nodes: [0] }, { nodes: [0, 0] }, { nodes: [1] }],
    }),
  );
  const result = resolvePartGroups(
    doc({ members: [{ nodeIndex: 0 }, { nodeName: "Shared" }] }),
    parts.list(),
    parts.identities(),
  );
  assert.deepEqual(
    parts.list().map((p) => p.id),
    ["part-0", "part-1"],
  );
  assert.equal(parts.identities().size, 2);
  assert.deepEqual(
    result.issues.map((i) => i.reason),
    ["ambiguous", "ambiguous"],
  );
});

test("4096 repeated assemblies allocate roots only, defer File projection and share native meshes", () => {
  for (const childCount of [64, 4096]) {
    const meshIds = Array.from({ length: childCount }, (_, i) => `m${i}`);
    const native = [
      {
        id: "part-0",
        name: "Assembly",
        parentId: null,
        meshIds,
        childIds: meshIds.map((_, i) => `part-0.${i}`),
      },
      ...meshIds.map((mesh, i) => ({
        id: `part-0.${i}`,
        name: `Child ${i}`,
        parentId: "part-0",
        meshIds: [mesh],
        childIds: [],
      })),
    ];
    const groups = normalizePartGroups(
      doc({
        members: Array.from({ length: 4096 }, () => ({ partId: "part-0" })),
      }),
    );
    const result = resolvePartGroups(groups, native);
    assert.equal(result.entries.length, 4097);
    assert.equal(result.entries[1].meshIds, meshIds);
    assert.equal(result.entries[1].childIds.length, 0);
    result.expand(result.entries[1].id);
    assert.equal(result.entries.length, 4097 + childCount);
    result.expand(result.entries[1].id);
    assert.equal(result.entries.length, 4097 + childCount);
    assert.equal(
      result.firstAlias.get(`part-0.${childCount - 1}`),
      `agent-member:a:0:part-0.${childCount - 1}`,
    );
    assert.equal(result.entries[0].meshIds.length, childCount);

    let reads = 0;
    const parts = createParts();
    parts.reset({
      entries: native,
      objects: new Map(),
      meshParts: new Map(),
      identities: {
        get() {
          reads++;
          return undefined;
        },
      },
    });
    parts.setGroups(groups);
    assert.equal(parts.view(), "file");
    assert.equal(parts.viewList().length, childCount + 1);
    assert.equal(reads, 0, "File view never invokes the Agent resolver");
    parts.setView("agent");
    assert.equal(reads, childCount + 1);
    assert.equal(parts.viewList().length, 4097);
    assert.equal(parts.viewList()[1].meshIds, meshIds);
    parts.setView("file");
    parts.setView("agent");
    assert.equal(reads, childCount + 1, "switching back reuses the projection");
    parts.setVisible("agent-group:a", false);
    assert.equal(parts.meshVisible(meshIds[0]), false);
    const picked = parts.revealId(`part-0.${childCount - 1}`);
    assert.equal(picked, `agent-member:a:0:part-0.${childCount - 1}`);
    assert.equal(
      parts.viewList().length,
      4098,
      "reveal allocates only its path",
    );
    parts.search(`child ${childCount - 1}`);
    assert.equal(
      parts.viewList().length,
      8193,
      "search allocates only matching paths",
    );
    parts.select(picked);
    parts.setView("file");
    assert.equal(parts.selected(), `part-0.${childCount - 1}`);
  }
});

test("same-content group metadata preserves surviving visibility gates and releases removed gates", () => {
  const { tree } = nativeFixture();
  const parts = createParts();
  parts.reset(tree);
  parts.setGroups(doc({ members: [{ nodeIndex: 1 }] }));
  parts.setView("agent");
  parts.setVisible("agent-group:a", false);
  assert.equal(parts.meshVisible("m1"), false);
  parts.setGroups(doc({ name: "Renamed", members: [{ nodeIndex: 1 }] }));
  assert.equal(parts.meshVisible("m1"), false, "renaming is not Show all");
  assert.equal(parts.visibilityEnabled("agent-group:a"), false);
  parts.setGroups(doc({ name: "Changed union", members: [{ nodeIndex: 2 }] }));
  assert.equal(parts.meshVisible("m1"), true, "former member leaves the gate");
  assert.equal(
    parts.meshVisible("m2"),
    false,
    "current members inherit the gate",
  );
  parts.setGroups([]);
  assert.equal(
    parts.meshVisible("m2"),
    true,
    "removed groups cannot keep invisible gates",
  );
});
