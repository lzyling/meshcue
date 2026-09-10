#!/usr/bin/env node
// Test-only executable. Production never adds this directory to PATH.
import fs from "node:fs";
const args = process.argv.slice(2),
  method = args[2],
  params = JSON.parse(args[args.indexOf("--params") + 1]);
const file = process.env.REVIEW_FAKE_GATEWAY_LOG;
const state = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : { calls: [], messages: [] };
state.calls.push({ method, params });
fs.writeFileSync(file, JSON.stringify(state));
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
  fs.writeFileSync(file, JSON.stringify(state));
  console.log(
    JSON.stringify({ status: "started", runId: params.idempotencyKey }),
  );
} else if (method === "chat.history") {
  fs.writeFileSync(file, JSON.stringify(state));
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
