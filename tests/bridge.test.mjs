import test from "node:test";
import assert from "node:assert/strict";
import { OpenClawBridge } from "../server/bridge.mjs";

const message = (id, timestamp, text = id) => ({
  role: "assistant",
  timestamp,
  __openclaw: { id },
  content: [{ type: "text", text }],
});
const tool = {
  role: "toolResult",
  timestamp: 30,
  content: [{ type: "text", text: "private tool output" }],
};

test("history backfills text hidden behind a tool-only page without exposing tools or reasoning", async () => {
  const bridge = new OpenClawBridge("test-session");
  const requests = [];
  bridge.call = async (_method, params) => {
    requests.push(params);
    return params.offset === undefined
      ? {
          messages: [tool],
          hasMore: true,
          nextOffset: 80,
          inFlightRun: { runId: "busy" },
        }
      : {
          messages: [
            message("visible", 20),
            { ...message("hidden", 21), channel: "analysis" },
          ],
          hasMore: false,
        };
  };
  const result = await bridge.history(10);
  assert.equal(result.busy, true);
  assert.deepEqual(
    result.messages.map((m) => m.id),
    ["visible"],
  );
  assert.equal(requests[1].offset, 80);
});

test("tool-heavy polls retain previously shown text and deduplicate updated messages", async () => {
  const bridge = new OpenClawBridge("test-session");
  let data = { messages: [message("reply", 20)] };
  bridge.call = async () => data;
  await bridge.history(10);
  bridge.cached.at = 0;
  data = { messages: [tool] };
  assert.equal((await bridge.history(10)).messages[0].text, "reply");
  bridge.cached.at = 0;
  data = { messages: [message("reply", 20, "completed reply")] };
  const result = await bridge.history(10);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, "completed reply");
});

test("new history cutoff does not reuse an older cached conversation", async () => {
  const bridge = new OpenClawBridge("test-session");
  bridge.call = async () => ({
    messages: [message("old", 10), message("new", 30)],
  });
  assert.equal((await bridge.history(0)).messages.length, 2);
  assert.deepEqual(
    (await bridge.history(20)).messages.map((m) => m.id),
    ["new"],
  );
});

test("history pagination is bounded even with only tools and repeated cursors", async () => {
  const bridge = new OpenClawBridge("test-session");
  let calls = 0;
  bridge.call = async () => ({
    messages: [tool],
    hasMore: true,
    nextOffset: ++calls,
  });
  const result = await bridge.history(0);
  assert.equal(calls, 3);
  assert.deepEqual(result.messages, []);
});
