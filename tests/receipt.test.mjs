import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startReview } from "./helpers/review-server.mjs";
import { markList, receiptRoute, receiptText } from "../server/receipt.mjs";

/* The line written into the reviewer's own conversation when a batch is
   handed over, and changed once the Agent has read it. What the service says
   there is all it knows: the marks arrived, which ones, to whom, and when they
   were read. It never waits on the line, and a line that fails changes
   nothing about the batch. */

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-receipt",
  target: "-100000031",
  accountId: "test",
  threadId: "31",
};
const mesh = {
  id: "mesh-0",
  name: "isolated",
  triangles: 4,
  sourceTriangles: 2,
  surfaceAlgorithm: "midpoint-v3-edge0.07-rationed",
  matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const pin = {
  id: "pin-receipt",
  type: "pin",
  label: "A",
  color: "#e76d5c",
  meshId: "mesh-0",
  faceIndex: 3,
  sourceFaceIndex: 1,
  position: [0, 0, 0],
  normal: [0, 1, 0],
  barycentric: [1, 0, 0],
};
const region = {
  id: "region-receipt",
  type: "region",
  coverage: "source-v2",
  label: "红色区域",
  color: "#e76d5c",
  faces: { "mesh-0": [0] },
  surfacePatches: [],
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
  for (let i = 0; i < 400; i++) {
    const value = await check();
    if (value) return value;
    await delay(25);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const lines = (f) => {
  const file = path.join(f.dir, "fake-messages.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
};
async function ready(t, options = {}) {
  const f = await startReview(t, { origin, ...options });
  const model = await f.publish();
  const owner = { versionId: model.id, clientId: "receipt-client" };
  await f.api("ready", {
    method: "POST",
    body: { ...owner, sha256: model.sha256, meshes: [mesh] },
  });
  await f.api("review/begin", { method: "POST", body: owner });
  const saved = await f.api("draft", {
    method: "PUT",
    body: { ...owner, revision: 0, annotations: [pin, region], camera: null },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 300));
  const hand = (submissionId, locale = "zh-Hans") =>
    f.api("feedback", {
      method: "POST",
      body: { ...owner, revision: saved.body.revision, submissionId, locale },
    });
  return { f, owner, hand };
}

test("the line says how many marks, which, and to whom, in the reviewer's language", () => {
  const annotations = [
    ...[1, 2, 3, 4].map((n) => ({ type: "measure", label: `M${n}` })),
    { type: "pin", label: "A" },
    { type: "region", label: "红色区域" },
  ];
  const named = { annotations, agentName: "爆爆", agentTool: "OpenClaw" };
  assert.equal(
    receiptText("sent", { ...named, locale: "zh-Hans" }),
    "📐 已收到 6 个标记（M1–M4、A、红色区域），已交给爆爆（OpenClaw），正在读取……",
  );
  assert.equal(
    receiptText("read", { ...named, locale: "zh-Hans" }),
    "📐 已收到 6 个标记（M1–M4、A、红色区域），爆爆（OpenClaw）已读取，正在理解……",
  );
  // A name in Latin letters is set apart from Chinese by a space.
  assert.equal(
    receiptText("sent", {
      annotations: [{ type: "pin", label: "A" }],
      agentName: "OpenClaw",
      agentTool: "OpenClaw",
      locale: "zh-Hant",
    }),
    "📐 已收到 1 個標記（A），已交給 OpenClaw，正在讀取……",
  );
  // No language on the batch, or one there is no catalogue for: English. No
  // name: the page's own words for an agent.
  assert.equal(
    receiptText("sent", { annotations: [{ type: "pin", label: "B" }] }),
    "📐 Marks received: 1 (B). Handed to the Agent, reading them now…",
  );
  assert.equal(
    receiptText("read", {
      annotations: [{ type: "pin", label: "B" }],
      locale: "pt-BR",
      agentName: "Ada",
      agentTool: "Claude Code",
    }),
    "📐 Marks received: 1 (B). Ada (Claude Code) has read them and is working out what you meant…",
  );
});

test("the list writes runs as ranges, counts a repeated name, stops at eight, and keeps only words", () => {
  const pins = (labels) => labels.map((label) => ({ type: "pin", label }));
  assert.equal(markList("en", pins(["A", "B"])), "A, B");
  assert.equal(markList("en", pins(["A", "B", "C", "E"])), "A–C, E");
  assert.equal(
    markList("ja", [
      { type: "region", label: "赤の領域" },
      { type: "region", label: "赤の領域" },
      { type: "measure", label: "M2" },
    ]),
    "M2、赤の領域 ×2",
  );
  assert.equal(
    markList("en", pins(["A", "C", "E", "G", "I", "K", "M", "O", "Q"])),
    "A, C, E, G, I, K, M, O, …",
  );
  // A region's name is the page's to give, and the service only holds it to a
  // length: nothing but letters, digits, spaces and dashes reaches the chat.
  assert.equal(
    markList("en", [{ type: "region", label: "<b>red</b> *x*" }]),
    "bredb x",
  );
});

test("only a chat the message command can write to and edit gets a line", () => {
  assert.deepEqual(receiptRoute(origin), {
    channel: "telegram",
    target: "-100000031",
    accountId: "test",
    threadId: "31",
  });
  assert.equal(
    receiptRoute({
      harness: "openclaw",
      sessionKey: "x",
      route: { channel: "webchat" },
    }),
    null,
  );
  assert.equal(receiptRoute({ harness: "claude-code", sessionKey: "x" }), null);
  assert.equal(receiptRoute("a-bare-session-key"), null);
  assert.equal(receiptRoute(null), null);
});

test("a batch handed over from Telegram is announced there, and the same line says so once it is read", async (t) => {
  const { f, hand } = await ready(t);
  await f.ipc("/agent", { name: "爆爆", tool: "OpenClaw" });
  const result = await hand("receipt-one");
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "accepted");
  assert.equal(result.body.markCount, 2);
  assert.equal(result.body.locale, "zh-Hans");
  const sent = await until(
    () => lines(f).find((line) => line.action === "send"),
    "the line in the conversation",
  );
  assert.deepEqual(sent, {
    action: "send",
    channel: "telegram",
    target: "-100000031",
    accountId: "test",
    threadId: "31",
    messageId: "1000",
    message:
      "📐 已收到 2 个标记（A、红色区域），已交给爆爆（OpenClaw），正在读取……",
    json: true,
  });
  // The line went beside the batch, never into it: the Agent's session got the
  // batch and nothing else.
  const calls = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls;
  assert.equal(calls.filter((c) => c.method === "chat.send").length, 1);
  await until(
    async () =>
      (await f.ipc("/submissions/receipt-one")).body?.chatReceipt?.messageId,
    "the line to be kept on the batch",
  );
  const stored = await f.ipc("/submissions/receipt-one");
  assert.equal(stored.body.chatReceipt.messageId, "1000");
  const read = await f.ipc("/read", {
    submissionId: "receipt-one",
    versionId: stored.body.versionId,
  });
  assert.equal(read.status, 200);
  const edited = await until(
    () => lines(f).find((line) => line.action === "edit"),
    "the line to be marked read",
  );
  assert.equal(edited.messageId, "1000");
  assert.equal(edited.target, "-100000031");
  assert.equal(edited.threadId, "31");
  assert.equal(
    edited.message,
    "📐 已收到 2 个标记（A、红色区域），爆爆（OpenClaw）已读取，正在理解……",
  );
  // Reading it again changes nothing more.
  await f.ipc("/read", {
    submissionId: "receipt-one",
    versionId: stored.body.versionId,
  });
  await delay(400);
  assert.equal(lines(f).filter((line) => line.action === "edit").length, 1);
  assert.equal(lines(f).filter((line) => line.action === "send").length, 1);
});

test("a line that cannot be written leaves the batch exactly as delivered", async (t) => {
  const { f, hand } = await ready(t);
  fs.writeFileSync(path.join(f.dir, "fake-messages-offline"), "");
  const result = await hand("receipt-offline", "en");
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "accepted");
  await delay(600);
  const stored = await f.ipc("/submissions/receipt-offline");
  assert.equal(stored.body.status, "accepted");
  assert.equal(stored.body.chatReceipt, undefined);
  // Nothing to mark read, and reading is not held up by it.
  const read = await f.ipc("/read", {
    submissionId: "receipt-offline",
    versionId: stored.body.versionId,
  });
  assert.equal(read.status, 200);
  assert.ok(read.body.readAt);
  assert.equal(lines(f).length, 0);
});

test("the Control UI's chat and a batch the Agent sealed get no line", async (t) => {
  const webchat = await ready(t, {
    origin: {
      ...origin,
      channel: "webchat",
      target: undefined,
      accountId: undefined,
      threadId: undefined,
    },
  });
  const accepted = await webchat.hand("receipt-webchat");
  assert.equal(accepted.body.status, "accepted");
  await delay(400);
  assert.equal(lines(webchat.f).length, 0);

  const telegram = await ready(t);
  const finished = await telegram.f.api("review/finish", {
    method: "POST",
    body: telegram.owner,
  });
  assert.equal(finished.status, 200);
  assert.ok(finished.body.sealed);
  await delay(400);
  assert.equal(lines(telegram.f).length, 0);
});

test("the page is told the project the Agent opened, so the sentence it offers names it", async (t) => {
  const managed = await startReview(t, {
    origin,
    managed: true,
    projectPath: "projects/plate",
  });
  const state = await managed.api("state?clientId=project-client");
  assert.equal(state.body.project, "projects/plate");
  const plain = await startReview(t, { origin });
  assert.equal(
    (await plain.api("state?clientId=project-client")).body.project,
    null,
  );
});
