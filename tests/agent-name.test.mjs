/* The page calls the Agent by the name it gave with the tool it runs in after
 * it, by either one alone when it knows only that one, and says "the Agent" in
 * its own words only when it knows neither. These cases hold the places that
 * decide which: the service that keeps the name and the tool, the entries that
 * supply them, the label the page makes of the two, and the catalogue lookup
 * that puts it in a sentence. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ReviewStore } from "../server/store.mjs";
import { agentNameSchema, MAX_AGENT_NAME } from "../server/agent-name.mjs";
import {
  createHandler,
  clientToolName,
  KNOWN_CLIENTS,
  TOOL,
} from "../mcp/server.mjs";
import { parseArgs } from "../cli/meshcue.mjs";
import { CATALOGUES, setLocale, setAgentName, ta } from "../src/i18n/index.js";
import { agentLabel } from "../src/agent-label.js";

process.env.REVIEW_UPDATE_CHECK = "off";
const repo = process.cwd();

function storeFor(t, origin) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "agent-name-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new ReviewStore(dir, { legacyOrigin: origin }) };
}
const conversation = (sessionKey, extra = {}) => ({
  harness: "openclaw",
  sessionKey,
  route: { channel: "webchat" },
  ...extra,
});

test("a name is plain text on one line, at most twenty-four characters", () => {
  const ok = (value) => agentNameSchema.safeParse(value);
  assert.equal(ok("  Ada  ").data, "Ada");
  for (const value of [
    "爆爆",
    "Claude Code",
    "x".repeat(MAX_AGENT_NAME),
    "👩‍💻 Ada",
    "<b>Bo</b>",
  ])
    assert.equal(ok(value).success, true, JSON.stringify(value));
  for (const value of [
    "",
    "   ",
    "x".repeat(MAX_AGENT_NAME + 1),
    "a\nb",
    "tab\there",
    "a\u0000b",
    "‮evil",
    "⁦isolate⁩",
    "a b",
    42,
  ])
    assert.equal(ok(value).success, false, JSON.stringify(value));
  // The entries advertise the same limit the service holds them to.
  const name = TOOL.inputSchema.properties.agentName;
  assert.equal(name.type, "string");
  assert.match(
    name.description,
    new RegExp(`trim first, 1–${MAX_AGENT_NAME} UTF-16`),
  );
  assert.equal(
    name.maxLength,
    undefined,
    "schema must not reject padded names before runtime trimming",
  );
});

test("the name given is what the page shows, and leaving it out keeps it", (t) => {
  const { dir, store } = storeFor(t, conversation("topic-a"));
  assert.equal(store.agentName(), null);
  assert.equal(store.publicState("").agentName, null);
  assert.equal(store.nameAgent({ tool: "OpenClaw" }), "OpenClaw");
  assert.equal(store.nameAgent({ name: "爆爆", tool: "OpenClaw" }), "爆爆");
  assert.equal(store.nameAgent({ tool: "OpenClaw" }), "爆爆");
  assert.equal(store.nameAgent({ name: "POP", tool: "OpenClaw" }), "POP");
  assert.equal(store.publicState("").agentName, "POP");
  // Kept with the project, so a restarted service still knows it.
  assert.equal(new ReviewStore(dir).agentName(), "POP");
});

test("another conversation taking the project over does not wear the name", (t) => {
  const { store } = storeFor(t, conversation("topic-a"));
  store.nameAgent({ name: "爆爆", tool: "OpenClaw" });
  store.bindOrigin(conversation("topic-b"));
  // Until the new owner says anything, the page has no name for it.
  assert.equal(store.agentName(), null);
  assert.equal(store.nameAgent({ tool: "OpenClaw" }), "OpenClaw");
});

test("a continued conversation keeps its name", (t) => {
  const { store } = storeFor(t, conversation("topic-a", { sessionId: "one" }));
  store.nameAgent({ name: "爆爆", tool: "OpenClaw" });
  store.bindOrigin(conversation("topic-a", { sessionId: "two" }), {
    resumeGeneration: true,
  });
  assert.equal(store.agentName(), "爆爆");
});

test("the page is given the tool as well as the name, so it can say both", (t) => {
  const { store } = storeFor(t, conversation("topic-a"));
  const given = () => {
    const { agentName, agentTool } = store.publicState("");
    return [agentName, agentTool];
  };
  assert.deepEqual(given(), [null, null]);
  store.nameAgent({ tool: "OpenClaw" });
  assert.deepEqual(given(), ["OpenClaw", "OpenClaw"]);
  store.nameAgent({ name: "爆爆", tool: "OpenClaw" });
  assert.deepEqual(given(), ["爆爆", "OpenClaw"]);
  // The CLI gives a name and cannot say which tool is calling.
  store.nameAgent({ name: "爆爆" });
  assert.deepEqual(given(), ["爆爆", null]);
  // A conversation that takes the project over has neither until it speaks.
  store.nameAgent({ name: "爆爆", tool: "OpenClaw" });
  store.bindOrigin(conversation("topic-b"));
  assert.deepEqual(given(), [null, null]);
});

test("every MCP client shares one owner, so another client starts without the name", (t) => {
  const { store } = storeFor(t, {
    harness: "mcp",
    sessionKey: "mcp:workspace",
  });
  assert.equal(store.nameAgent({ name: "Ada", tool: "Claude Code" }), "Ada");
  assert.equal(store.nameAgent({ tool: "Codex" }), "Codex");
  // A caller that cannot say which tool it is (the CLI) and gives no name.
  assert.equal(store.nameAgent({}), null);
});

test("an MCP client is recognised only by a handshake that was read", () => {
  assert.equal(
    clientToolName({ name: "claude-code", version: "2.1.284" }),
    "Claude Code",
  );
  assert.equal(clientToolName({ name: "codex-mcp-client" }), "Codex");
  for (const info of [
    undefined,
    {},
    { name: "some-other-client", title: "Some Other" },
    { name: "constructor" },
    { name: "__proto__" },
    { name: 7 },
  ])
    assert.equal(clientToolName(info), undefined, JSON.stringify(info));
  for (const name of Object.values(KNOWN_CLIENTS))
    assert.equal(agentNameSchema.safeParse(name).success, true);
});

test("the CLI takes a name, since it cannot tell which tool is calling", () => {
  const { input } = parseArgs([
    "open",
    "--project",
    "projects/a",
    "--agent-name",
    "Ada",
  ]);
  assert.equal(input.agentName, "Ada");
});

const stl =
  "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";
function workspace(t) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "agent-name-ws-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "web"));
  fs.writeFileSync(path.join(dir, "web/index.html"), "<!doctype html>");
  fs.mkdirSync(path.join(dir, "projects/lamp"), { recursive: true });
  fs.writeFileSync(path.join(dir, "projects/lamp/part.stl"), stl);
  fs.writeFileSync(
    path.join(dir, "openclaw.plugin.json"),
    JSON.stringify({ id: "meshcue" }),
  );
  return dir;
}

test("over MCP: the client's own name, then the one the Agent gives, which a bad one does not replace", async (t) => {
  const dir = workspace(t);
  const handle = createHandler({
    workspace: dir,
    environment: { MESHCUE_OWNER: "mcp-agent-name" },
    managerOptions: {
      installRoot: dir,
      serverEntry: path.join(repo, "server/index.mjs"),
      distRoot: path.join(dir, "web"),
      listenHost: "127.0.0.1",
      environment: { REVIEW_BRIDGE: "off" },
    },
  });
  await handle({
    id: 1,
    method: "initialize",
    params: {
      clientInfo: {
        name: "claude-code",
        title: "Claude Code",
        version: "2.1.284",
      },
    },
  });
  const call = async (args) =>
    (
      await handle({
        id: 2,
        method: "tools/call",
        params: { name: "meshcue", arguments: args },
      })
    ).result;
  const open = (extra = {}) =>
    call({
      action: "open",
      project: "projects/lamp",
      file: "projects/lamp/part.stl",
      version: "v1",
      confirmedClientAddress: "127.0.0.1",
      ...extra,
    });
  // What `open` says the page calls it: the name, and the tool in brackets.
  const called = ({ structuredContent: { agentName, agentTool } }) => [
    agentName,
    agentTool,
  ];
  try {
    assert.deepEqual(called(await open()), ["Claude Code", "Claude Code"]);
    assert.deepEqual(called(await open({ agentName: "Ada" })), [
      "Ada",
      "Claude Code",
    ]);
    assert.deepEqual(called(await open()), ["Ada", "Claude Code"]);
    const refused = await open({ agentName: "‮evil" });
    assert.equal(refused.isError, true);
    assert.equal(JSON.parse(refused.content[0].text).code, "BAD_AGENT_NAME");
    const status = (await call({ action: "status", project: "projects/lamp" }))
      .structuredContent;
    assert.equal(status.agentName, "Ada");
    assert.equal(status.agentTool, "Claude Code");
  } finally {
    await call({ action: "stop", project: "projects/lamp" });
  }
});

/* Every named sentence, in every language, with every slot it has filled:
   nothing may be left in braces, and the name has to be in it. */
const SAMPLE = {
  count: 2,
  attempts: 3,
  reason: "R",
  summary: "S",
  version: "9.9.9",
  current: "1.5.0",
  time: "18:32",
  marks: "A",
};
test("every sentence about the Agent reads with a name and without one", (t) => {
  t.after(() => {
    setAgentName(null);
    setLocale("en");
  });
  for (const locale of Object.keys(CATALOGUES)) {
    setLocale(locale);
    const bases = Object.keys(CATALOGUES.en)
      .filter((k) => k.endsWith(".named"))
      .map((k) => k.slice(0, -".named".length));
    assert.ok(bases.length >= 21);
    for (const name of [
      null,
      "Ada",
      "爆爆",
      agentLabel("爆爆", "OpenClaw"),
      agentLabel("Ada", "Claude Code"),
    ]) {
      setAgentName(name);
      for (const key of bases) {
        const text = ta(key, SAMPLE);
        assert.doesNotMatch(text, /\{\w+\}/, `${locale} ${key} with ${name}`);
        if (name)
          assert.ok(text.includes(name), `${locale} ${key} lacks ${name}`);
      }
    }
  }
});

test("a Chinese or Japanese sentence spaces a Latin name and not a Chinese one", (t) => {
  t.after(() => {
    setAgentName(null);
    setLocale("en");
  });
  setLocale("zh-Hans");
  setAgentName(null);
  assert.equal(ta("feedback.submit"), "交给 AI Agent");
  setAgentName("爆爆");
  assert.equal(ta("feedback.submit"), "交给爆爆");
  assert.equal(ta("echo.summary", { summary: "加厚" }), "爆爆理解：加厚");
  setAgentName("OpenClaw");
  assert.equal(ta("feedback.submit"), "交给 OpenClaw");
  assert.equal(ta("echo.summary", { summary: "加厚" }), "OpenClaw 理解：加厚");
  // Nothing goes between a bracket and a name.
  assert.ok(ta("help.p6").startsWith("「交给 OpenClaw」会"));
  setLocale("zh-Hant");
  assert.equal(ta("feedback.submit"), "交給 OpenClaw");
  setLocale("ja");
  setAgentName("Claude Code");
  assert.equal(ta("feedback.submit"), "Claude Code へ送る");
  setAgentName("爆爆");
  assert.equal(ta("feedback.submit"), "爆爆へ送る");
  setAgentName(null);
  assert.equal(ta("feedback.submit"), "エージェントへ送る");
});

/* A name alone does not tell a reviewer who has never met 爆爆 that it is an
   agent, or where the marks go; the tool after it does. Kelven asked for
   "爆爆（OpenClaw）" on 2026-09-29, the submit button included. */
test("the page says the name, then the tool it came through in the language's own brackets", (t) => {
  t.after(() => setLocale("en"));
  setLocale("zh-Hans");
  assert.equal(agentLabel("爆爆", "OpenClaw"), "爆爆（OpenClaw）");
  // Only the tool: said once, not "OpenClaw（OpenClaw）".
  assert.equal(agentLabel("OpenClaw", "OpenClaw"), "OpenClaw");
  assert.equal(agentLabel("openclaw", "OpenClaw"), "openclaw");
  // A name from a caller that cannot say which tool it is: the name alone.
  assert.equal(agentLabel("爆爆", null), "爆爆");
  // Neither: no name, and the sentences keep the page's own words.
  assert.equal(agentLabel(null, null), null);
  setLocale("zh-Hant");
  assert.equal(agentLabel("爆爆", "OpenClaw"), "爆爆（OpenClaw）");
  setLocale("ja");
  assert.equal(agentLabel("爆爆", "Claude Code"), "爆爆（Claude Code）");
  for (const locale of ["en", "de", "fr"]) {
    setLocale(locale);
    assert.equal(agentLabel("Ada", "OpenClaw"), "Ada (OpenClaw)", locale);
    assert.equal(agentLabel("Claude Code", "Claude Code"), "Claude Code");
  }
});

test("every sentence that names the Agent says the name and the tool", (t) => {
  t.after(() => {
    setAgentName(null);
    setLocale("en");
  });
  setLocale("zh-Hans");
  setAgentName(agentLabel("爆爆", "OpenClaw"));
  assert.equal(ta("feedback.submit"), "交给爆爆（OpenClaw）");
  assert.equal(ta("conn.collect"), "由爆爆（OpenClaw）来取");
  assert.equal(ta("feedback.unread"), "等待爆爆（OpenClaw）读取");
  assert.equal(
    ta("echo.summary", { summary: "加厚" }),
    "爆爆（OpenClaw）理解：加厚",
  );
  assert.equal(
    ta("note.placeholder"),
    "这里要怎么改？选填，会随标记交给爆爆（OpenClaw）。",
  );
  assert.ok(ta("help.p6").startsWith("「交给爆爆（OpenClaw）」会"));
  setAgentName(agentLabel("Ada", "OpenClaw"));
  assert.equal(ta("feedback.submit"), "交给 Ada（OpenClaw）");
  setLocale("ja");
  setAgentName(agentLabel("爆爆", "OpenClaw"));
  assert.equal(ta("feedback.submit"), "爆爆（OpenClaw）へ送る");
  setLocale("en");
  setAgentName(agentLabel("Ada", "OpenClaw"));
  assert.equal(ta("feedback.submit"), "Send to Ada (OpenClaw)");
  setLocale("de");
  setAgentName(agentLabel("Ada", "OpenClaw"));
  assert.equal(ta("feedback.submit"), "An Ada (OpenClaw)");
});

test("German and French write the sentence again rather than drop the name into it", (t) => {
  t.after(() => {
    setAgentName(null);
    setLocale("en");
  });
  setLocale("de");
  assert.equal(ta("feedback.submit"), "An den Agenten");
  setAgentName("Ada");
  assert.equal(ta("feedback.submit"), "An Ada");
  assert.equal(ta("echo.recall"), "Erneut lesen, was Ada verstanden hat");
  setLocale("fr");
  setAgentName("OpenClaw");
  assert.equal(ta("feedback.submit"), "Envoyer à OpenClaw");
  // Not "ce que OpenClaw": a name beginning with a vowel would need qu'.
  assert.equal(ta("echo.recall"), "Revoir ce qu'a compris OpenClaw");
  setLocale("en");
  setAgentName(null);
  assert.equal(ta("feedback.submit"), "Send to Agent");
  setAgentName("Ada");
  assert.equal(ta("feedback.submit"), "Send to Ada");
});

test("what goes into a sentence is not read again", (t) => {
  t.after(() => {
    setAgentName(null);
    setLocale("en");
  });
  setLocale("en");
  setAgentName("{count}");
  assert.equal(
    ta("outbox.retrying", SAMPLE).split(";")[0],
    "2 batches have not reached {count} yet",
  );
  setAgentName("Ada");
  assert.equal(
    ta("echo.summary", { summary: "call me {agent}" }),
    "Ada understands: call me {agent}",
  );
});
