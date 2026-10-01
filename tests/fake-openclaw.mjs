#!/usr/bin/env node
// Test-only executable. Production never adds this directory to PATH.
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const file = process.env.REVIEW_FAKE_GATEWAY_LOG;
// The test process reads while the service polls this stand-in in another
// process. Direct writes expose an empty/partial JSON file between truncate
// and write; publish a complete sibling file instead. Keep this executable
// self-contained because browser fixtures copy it into their isolated PATH.
function publishJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.renameSync(temporary, file);
}
/* `openclaw message send|edit`: a line written straight into a chat, never
   into a session. Kept in a file of its own, because it runs beside the
   Gateway calls of the same batch and the two would overwrite each other's
   record. A file named `fake-messages-offline` beside it makes it fail the
   way a channel that cannot be reached does. */
if (args[0] === "message") {
  const dir = path.dirname(file);
  const log = path.join(dir, "fake-messages.json");
  const option = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  if (fs.existsSync(path.join(dir, "fake-messages-offline"))) {
    console.error("Fixture channel is unreachable");
    process.exit(1);
  }
  const sent = fs.existsSync(log)
    ? JSON.parse(fs.readFileSync(log, "utf8"))
    : [];
  const action = args[1];
  if (!["send", "edit"].includes(action))
    throw new Error("Unexpected message action");
  const messageId =
    action === "send"
      ? String(1000 + sent.filter((s) => s.action === "send").length)
      : option("--message-id");
  sent.push({
    action,
    channel: option("--channel"),
    target: option("--target"),
    accountId: option("--account"),
    threadId: option("--thread-id"),
    messageId,
    message: option("--message"),
    json: args.includes("--json"),
  });
  publishJson(log, sent);
  // The shape the real command prints with --json: pretty, and the id on top.
  console.log(
    JSON.stringify(
      {
        action,
        channel: option("--channel"),
        dryRun: false,
        handledBy: "plugin",
        messageId,
        payload: { ok: true, messageId },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const method = args[2],
  params = JSON.parse(args[args.indexOf("--params") + 1]);
const state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : { calls: [], messages: [] };
state.calls.push({ method, params });
publishJson(file, state);
if (state.offline) throw new Error("Fixture Gateway is offline");
const sessionId = state.sessions?.[params.sessionKey] || "fixture-generation";
const leaf = `leaf-${state.messages.length}`;
if (method === "chat.send") {
  if (
    params.sessionId &&
    (params.sessionId !== sessionId || params.expectedLeafEntryId !== leaf)
  )
    throw new Error("Fixture rejects stale session or leaf");
  // Mirror the real Gateway: caller-supplied route fields are an admin-scoped
  // override, refused with a typed reason on stdout and a non-zero exit. This
  // fixture used to require exactly those fields, so the suite stayed green on
  // a contract the host has never accepted and a real Telegram round could not
  // deliver at all. Reproduce the refusal here instead, including the shape the
  // reason arrives in, so neither the fields nor the discarded reason can come
  // back unnoticed.
  const override = [
    "originatingChannel",
    "originatingTo",
    "originatingAccountId",
    "originatingThreadId",
  ].filter((key) => params[key] !== undefined);
  if (override.length) {
    console.log(
      JSON.stringify({
        ok: false,
        error: {
          type: "gateway_request_error",
          code: "INVALID_REQUEST",
          message: "originating route fields require admin scope",
          retryable: false,
        },
      }),
    );
    process.exit(1);
  }
  if (params.deliver !== false && params.deliver !== true)
    throw new Error("Unexpected route in isolated Gateway fixture");
  const old = state.messages.find(
    (m) => m.idempotencyKey === params.idempotencyKey,
  );
  if (!old) {
    const timestamp = Date.now();
    state.messages.push({
      role: "user",
      sessionKey: params.sessionKey,
      timestamp,
      idempotencyKey: params.idempotencyKey,
      content: [{ type: "text", text: params.message }],
    });
    state.messages.push({
      role: "assistant",
      sessionKey: params.sessionKey,
      timestamp: timestamp + 1,
      idempotencyKey: `reply-${params.idempotencyKey}`,
      content: [
        {
          type: "text",
          text: "【自動化測試替身】已收到標記。請說明各個標記想點改。",
        },
      ],
    });
  }
  publishJson(file, state);
  console.log(
    JSON.stringify({ status: "started", runId: params.idempotencyKey }),
  );
} else if (method === "chat.history") {
  publishJson(file, state);
  console.log(
    JSON.stringify({
      messages: state.messages.filter(
        (m) => m.sessionKey === params.sessionKey,
      ),
      inFlightRun: null,
      sessionId,
      sessionInfo: { activeLeafEntryId: leaf },
    }),
  );
} else throw new Error("Unexpected test method");
