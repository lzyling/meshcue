import test from "node:test";
import assert from "node:assert/strict";

process.env.REVIEW_LOG_LEVEL = "silent";
const { createUpdateWatch, isNewer } = await import("../server/upstream.mjs");
const { releaseSummary } = await import("../src/app/update-popover.js");
const settled = () => new Promise((resolve) => setImmediate(resolve));

function watchFor(release, options = {}) {
  return createUpdateWatch({
    installed: "1.5.0-dev.1",
    fetchImpl: async () => ({ ok: true, json: async () => release }),
    ...options,
  });
}

test("release notes preserve raw text and stop at 2000 characters", async () => {
  const body = "# Changes\n<script>alert(1)</script>\n" + "a".repeat(2100);
  const watch = watchFor({
    tag_name: "v1.6.0",
    body,
    html_url: "https://example.test/releases/v1.6.0",
  });
  watch.report();
  await settled();
  assert.deepEqual(watch.report(), {
    version: "1.6.0",
    notes: body.slice(0, 2000),
    url: "https://example.test/releases/v1.6.0",
  });
});

test("missing or non-string notes remain optional; empty notes are valid", async () => {
  for (const body of [undefined, null, 42, { text: "not a string" }, ""]) {
    const watch = watchFor({ tag_name: "v1.6.0", body });
    watch.report();
    await settled();
    assert.equal(
      Object.hasOwn(watch.report(), "notes"),
      typeof body === "string",
    );
    if (body === "") assert.equal(watch.report().notes, "");
  }
});

test("failed refresh keeps previous notes and URL with unchanged retry window", async () => {
  let clock = 0;
  let calls = 0;
  const watch = watchFor(null, {
    now: () => clock,
    ttlMs: 100,
    retryMs: 500,
    fetchImpl: async () => {
      if (++calls > 1) throw new Error("fake upstream failure");
      return {
        ok: true,
        json: async () => ({
          tag_name: "v1.6.0",
          body: "# Retained notes",
          html_url: "https://example.test/release",
        }),
      };
    },
  });
  watch.report();
  await settled();
  const previous = watch.report();
  clock = 101;
  watch.report();
  await settled();
  assert.deepEqual(watch.report(), previous);
  assert.equal(watch.report().notes, "# Retained notes");
  clock = 600;
  watch.report();
  await settled();
  assert.equal(calls, 2);
  clock = 601;
  watch.report();
  await settled();
  assert.equal(calls, 3);
});

test("notes do not change version comparison or disabled-check behavior", async () => {
  assert.equal(isNewer("v1.5.0", "1.5.0-dev.1"), true);
  assert.equal(isNewer("v1.6.0-rc.1", "1.5.0"), false);
  assert.equal(isNewer("v1.10.0", "1.9.0"), true);
  assert.equal(isNewer("v1.4.9", "1.5.0"), false);
  const watch = watchFor({ tag_name: "v1.5.0-dev.2", body: "notes" });
  watch.report();
  await settled();
  assert.equal(watch.report(), null);
  let calls = 0;
  const disabled = watchFor(null, {
    enabled: false,
    fetchImpl: async () => {
      calls++;
      throw new Error("must not fetch");
    },
  });
  assert.equal(disabled.report(), null);
  await settled();
  assert.equal(calls, 0);
});

test("summary strips Markdown and HTML as text while preserving line breaks", () => {
  assert.equal(
    releaseSummary(
      "# Heading\n\n- **Bold** and [link](https://example.test)\n> `code`\n<img src=x onerror=alert(1)>safe",
    ),
    "Heading\n\nBold and link\ncode\nsafe",
  );
  assert.equal(releaseSummary(undefined), "");
});

test("summary truncates only beyond 600 plain-text characters", () => {
  assert.equal(releaseSummary("a".repeat(600)), "a".repeat(600));
  assert.equal(
    releaseSummary("**" + "a".repeat(601) + "**"),
    "a".repeat(600) + "…",
  );
});
