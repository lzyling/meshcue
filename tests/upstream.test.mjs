import test from "node:test";
import assert from "node:assert/strict";

/* The service had never made an outbound request before this, so the cases
   worth writing are less about the comparison than about restraint: how often
   it may ask, what it does when the answer does not come, and how it is turned
   off. The comparison is here too, because "is 1.1.2 newer than 1.1.2-dev" has
   a right answer that is not the obvious one. */

process.env.REVIEW_LOG_LEVEL = "silent";
const { isNewer, parseVersion, createUpdateWatch, updateCheckEnabled } =
  await import("../server/upstream.mjs");

test("a release tag and a manifest version are the same three numbers", () => {
  assert.deepEqual(parseVersion("v1.1.2"), { parts: [1, 1, 2], pre: null });
  assert.deepEqual(parseVersion("1.1.2"), { parts: [1, 1, 2], pre: null });
  assert.deepEqual(parseVersion("1.1.2-dev"), { parts: [1, 1, 2], pre: "dev" });
  // What a missing or unreadable manifest yields, and it is not a version.
  assert.equal(parseVersion("unknown"), null);
  assert.equal(parseVersion(undefined), null);
});

test("newer means every position, not string order", () => {
  assert.equal(isNewer("v1.1.2", "1.1.1"), true);
  assert.equal(isNewer("v1.2.0", "1.1.9"), true);
  assert.equal(isNewer("v2.0.0", "1.9.9"), true);
  assert.equal(isNewer("v1.1.1", "1.1.1"), false);
  assert.equal(isNewer("v1.1.1", "1.1.2"), false);
  // 1.10.0 is ahead of 1.9.0; as text it sorts behind it.
  assert.equal(isNewer("v1.10.0", "1.9.0"), true);
});

test("a dev build is behind the release it is working towards", () => {
  assert.equal(isNewer("v1.1.2", "1.1.2-dev"), true);
  assert.equal(isNewer("v1.1.1", "1.1.2-dev"), false);
});

test("an upstream prerelease is never offered, nor is an unreadable version", () => {
  assert.equal(isNewer("v1.2.0-rc.1", "1.1.1"), false);
  assert.equal(isNewer("v1.1.2", "unknown"), false);
  assert.equal(isNewer("nightly", "1.1.1"), false);
});

function stubbed(replies) {
  let calls = 0;
  const fetchImpl = async () => {
    const reply = replies[Math.min(calls++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return { ok: true, json: async () => reply };
  };
  return { fetchImpl, calls: () => calls };
}

const settled = () => new Promise((r) => setImmediate(r));

test("one answer serves every poll until it goes stale", async () => {
  let clock = 0;
  const stub = stubbed([
    { tag_name: "v1.1.2", html_url: "https://example.test/v1.1.2" },
  ]);
  const watch = createUpdateWatch({
    installed: "1.1.1",
    fetchImpl: stub.fetchImpl,
    now: () => clock,
    ttlMs: 1000,
  });
  // Nothing is known yet, and asking is what the first read starts.
  assert.equal(watch.report(), null);
  await settled();
  assert.deepEqual(watch.report(), {
    version: "1.1.2",
    url: "https://example.test/v1.1.2",
  });
  // The page behind this polls every 2.2 seconds; none of that goes outward.
  for (let i = 0; i < 50; i++) watch.report();
  await settled();
  assert.equal(stub.calls(), 1, "asked more than once inside one window");
  clock = 1001;
  watch.report();
  await settled();
  assert.equal(stub.calls(), 2);
});

test("an upstream that cannot be reached keeps the last answer and waits", async () => {
  let clock = 0;
  const stub = stubbed([
    { tag_name: "v1.1.2" },
    new Error("getaddrinfo ENOTFOUND"),
  ]);
  const watch = createUpdateWatch({
    installed: "1.1.1",
    fetchImpl: stub.fetchImpl,
    now: () => clock,
    ttlMs: 1000,
    retryMs: 5000,
  });
  watch.report();
  await settled();
  assert.equal(watch.report().version, "1.1.2");
  clock = 1001;
  watch.report();
  await settled();
  // A flaky minute does not take the badge away, and it does not become a
  // retry every 2.2 seconds either: the failure waits out its own window.
  assert.equal(watch.report().version, "1.1.2");
  for (let i = 0; i < 20; i++) watch.report();
  await settled();
  assert.equal(stub.calls(), 2, "a failure turned into a retry storm");
});

test("nothing is reported when the upstream is not ahead", async () => {
  const stub = stubbed([{ tag_name: "v1.1.1" }]);
  const watch = createUpdateWatch({
    installed: "1.1.1",
    fetchImpl: stub.fetchImpl,
  });
  watch.report();
  await settled();
  assert.equal(watch.report(), null);
});

test("turned off, it does not ask at all", async () => {
  const stub = stubbed([{ tag_name: "v9.9.9" }]);
  const watch = createUpdateWatch({
    installed: "1.1.1",
    enabled: false,
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(watch.report(), null);
  await settled();
  assert.equal(stub.calls(), 0);
});

test("off is one word, and the environment outranks the stored config", () => {
  assert.equal(updateCheckEnabled({}, {}), true);
  assert.equal(updateCheckEnabled({}, { updateCheck: false }), false);
  for (const said of ["off", "0", "false", "no", "OFF"])
    assert.equal(
      updateCheckEnabled({ REVIEW_UPDATE_CHECK: said }, {}),
      false,
      `${said} did not turn it off`,
    );
  assert.equal(
    updateCheckEnabled({ REVIEW_UPDATE_CHECK: "on" }, { updateCheck: false }),
    true,
  );
  // An empty variable is not an answer; it is an unset one passed along.
  assert.equal(updateCheckEnabled({ REVIEW_UPDATE_CHECK: "" }, {}), true);
});
