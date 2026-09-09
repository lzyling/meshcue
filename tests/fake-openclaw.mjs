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
if (method === "chat.send") {
  if (params.deliver !== false)
    throw new Error("External delivery must always be false");
  const old = state.messages.find(
    (m) => m.idempotencyKey === params.idempotencyKey,
  );
  if (!old) {
    const timestamp = Date.now();
    state.messages.push({
      role: "user",
      timestamp,
      idempotencyKey: params.idempotencyKey,
      content: [{ type: "text", text: params.message }],
    });
    state.messages.push({
      role: "assistant",
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
  console.log(JSON.stringify({ messages: state.messages, inFlightRun: null }));
} else throw new Error("Unexpected test method");
