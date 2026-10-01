import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("the fake Gateway publishes complete JSON to concurrent readers", (t) => {
  fs.mkdirSync("tmp", { recursive: true });
  const dir = fs.mkdtempSync(path.resolve("tmp/fixture-json-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const gateway = path.join(dir, "fake-gateway.json");
  const messages = path.join(dir, "fake-messages.json");
  const probe = path.join(dir, "read-during-write.mjs");
  // Read at precisely the vulnerable boundary, not after an arbitrary delay:
  // opening a file for writing has truncated it, but no bytes were written yet.
  // A temp-file writer leaves the published path readable at that same point.
  fs.writeFileSync(
    probe,
    `import fs from "node:fs";
const write = fs.writeFileSync;
fs.writeFileSync = (file, data, options) => {
  const fd = fs.openSync(file, "w", options?.mode);
  try {
    JSON.parse(fs.readFileSync(process.env.REVIEW_FAKE_STATE_PROBE, "utf8"));
    write(fd, data, options);
  } finally {
    fs.closeSync(fd);
  }
};
`,
  );
  const params = {
    sessionKey: "atomic-fixture",
    sessionId: "fixture-generation",
    expectedLeafEntryId: "leaf-0",
    idempotencyKey: "atomic-batch",
    deliver: false,
    message: "fixture only",
  };
  for (const method of ["chat.history", "chat.send", "send", "edit"]) {
    fs.writeFileSync(gateway, JSON.stringify({ calls: [], messages: [] }));
    fs.writeFileSync(messages, "[]");
    const isGateway = method.startsWith("chat.");
    const args = isGateway
      ? ["gateway", "call", method, "--params", JSON.stringify(params)]
      : ["message", method, "--channel", "telegram", "--message-id", "1000"];
    execFileSync(
      process.execPath,
      ["--import", probe, "tests/fake-openclaw.mjs", ...args],
      {
        env: {
          ...process.env,
          REVIEW_FAKE_GATEWAY_LOG: gateway,
          REVIEW_FAKE_STATE_PROBE: isGateway ? gateway : messages,
        },
        stdio: "pipe",
      },
    );
    const result = JSON.parse(
      fs.readFileSync(isGateway ? gateway : messages, "utf8"),
    );
    assert.equal(isGateway ? result.calls.length : result.length, 1);
    if (method === "chat.send") assert.equal(result.messages.length, 2);
  }
});
