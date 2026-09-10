import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { startReview } from "../helpers/review-server.mjs";

const origin = {
  harness: "openclaw",
  channel: "telegram",
  sessionKey: "test-browser-topic-41",
  target: "-100000001",
  accountId: "test",
  threadId: "41",
};
let f, browserUrl, cleanups;
test.beforeEach(async () => {
  cleanups = [];
  f = await startReview(
    {
      after(fn) {
        cleanups.push(fn);
      },
    },
    { origin, protectedAccess: true },
  );
  browserUrl = f.url.replace("127.0.0.1", "review.test");
  await f.publish();
});
test.afterEach(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

// Test-only host bootstrap: credentials remain in memory, never in a URL,
// browser trace, fixture log, saved browser state, or assertion output.
async function authorize(context) {
  const issued = await f.ipc("/access/issue", {});
  expect(issued.status).toBe(200);
  const exchange = await f.api("access/exchange", {
    method: "POST",
    body: { grant: issued.body.value },
  });
  expect(exchange.status).toBe(200);
  const pair = exchange.headers.get("set-cookie").split(";")[0];
  await context.addCookies([
    {
      name: "review_access",
      value: pair.slice(pair.indexOf("=") + 1),
      url: browserUrl,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}
async function ready(page, context) {
  await authorize(context);
  await page.goto(browserUrl);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "畫筆模式", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
}
async function mark(page) {
  await page.getByRole("button", { name: "畫筆模式", exact: true }).click();
  const box = await page.locator("#viewer").boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function geometryBytes(bytes) {
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    if (bytes.readUInt32LE(offset + 4) === 0x004e4942)
      return bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  throw new Error("Expected binary geometry");
}
async function currentDownload(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#download-model").click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return fs.readFileSync(await download.path());
}

test("ordinary link automatically claims a host-admitted peer and loads, marks, restores and downloads without token input", async ({
  page,
  context,
}) => {
  await page.goto(browserUrl);
  await expect(page.locator("#loading-text")).toContainText("原對話");
  await f.ipc("/access/admit", { address: "192.168.1.22" });
  const rejected = await page.waitForResponse((r) =>
    r.url().endsWith("/api/access/claim"),
  );
  expect(rejected.status()).toBe(401);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().versionId),
  ).toBeNull();
  await f.ipc("/access/admit", { address: "127.0.0.1" });
  await expect(page.locator("#loading")).toBeHidden();
  expect(page.url()).toBe(`${browserUrl}/`);
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(
    await page.evaluate(() => document.cookie.includes("review_access")),
  ).toBe(false);
  expect(
    (await context.cookies()).some(
      (c) =>
        c.name === "review_access" && c.httpOnly && c.sameSite === "Strict",
    ),
  ).toBe(true);
  const initial = (await f.ipc("/status")).body;
  expect(initial.access.sessions).toBe(1);
  expect(initial.access.grantActive).toBe(false);
  await mark(page);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  await f.ipc("/access/admit", { address: "192.168.1.23" });
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  expect(sha(await currentDownload(page))).toBe(initial.active.sha256);
  expect((await f.ipc("/status")).body.access.sessions).toBe(1);
});

test("protected LAN HTTP: marked region, session-routed receipt, real geometry revision and new review", async ({
  page,
  context,
}) => {
  await ready(page, context);
  const initial = (await f.ipc("/status")).body;
  await mark(page);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  // New admissions rotate without revoking an already active editing browser.
  await f.ipc("/access/issue", {});
  await f.ipc("/access/issue", {});
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
  await page.locator("#submit-feedback").click();
  await expect(page.locator("#feedback-status")).toContainText("已送到原會話");
  await expect(page.locator("#feedback-status")).not.toContainText(
    "Agent 已讀取",
  );
  const submission = (await f.ipc("/submissions")).body[0];
  expect(submission.annotations[0].type).toBe("region");
  expect(submission.annotations[0].surfacePatches.length).toBeGreaterThan(0);
  const calls = JSON.parse(
    fs.readFileSync(path.join(f.dir, "fake-gateway.json"), "utf8"),
  ).calls;
  const delivery = calls.find((c) => c.method === "chat.send").params;
  // sessionKey is the route. Naming the destination with originating* fields
  // instead is an admin-scoped override the real Gateway refuses outright.
  expect(delivery.sessionKey).toBe(origin.sessionKey);
  expect(delivery.deliver).toBe(true);
  expect(delivery.originatingThreadId).toBeUndefined();
  expect(delivery.originatingTo).toBeUndefined();
  expect(
    (
      await f.ipc("/read", {
        submissionId: submission.id,
        versionId: submission.versionId,
      })
    ).status,
  ).toBe(200);
  await expect(page.locator("#feedback-status")).toContainText("Agent 已讀取");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  expect(
    (
      await f.ipc("/echo", {
        submissionId: submission.id,
        versionId: submission.versionId,
        summary:
          "隔離驗收：確認標記範圍；按測試要求把支架孔半徑由 0.19 加大至 0.28",
        annotations: submission.annotations,
      })
    ).status,
  ).toBe(200);
  await expect(page.locator("#echo-panel")).toBeVisible();
  const echoed = await page.evaluate(() => window.__reviewDiagnostics());
  expect(echoed.annotations).toEqual(before.annotations);
  expect(echoed.camera).toEqual(before.camera);
  const v1bytes = await currentDownload(page);
  expect(sha(v1bytes)).toBe(initial.active.sha256);

  const output = path.join(f.dir, "generated");
  execFileSync(
    process.execPath,
    [
      "scripts/generate-samples.mjs",
      "--output",
      output,
      "--hole-radius",
      "0.28",
      "--bracket-name",
      "widened.glb",
    ],
    { cwd: f.repo, stdio: "ignore" },
  );
  const nextBytes = fs.readFileSync(path.join(output, "widened.glb"));
  expect(sha(geometryBytes(nextBytes))).not.toBe(sha(geometryBytes(v1bytes)));
  const published = await f.ipc("/publish", {
    file: path.join(output, "widened.glb"),
    name: "雙孔支架 · 加大孔徑",
    version: "v2-hole-0.28",
    origin,
  });
  expect(published.status).toBe(200);
  expect(published.body.status).toBe("queued");
  await expect(page.locator("#pending-banner")).toBeVisible();
  expect(sha(await currentDownload(page))).toBe(initial.active.sha256);
  expect((await f.ipc("/status")).body.locked).toBe(true);
  await page.locator("#finish-review").click();
  await expect(page.locator("#model-version")).toHaveText("v2-hole-0.28");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#echo-panel")).toBeHidden();
  expect(sha(await currentDownload(page))).toBe(published.body.model.sha256);
  const current = await page.evaluate(() => window.__reviewDiagnostics());
  expect(current.versionId).toBe(published.body.model.id);
  expect(current.annotationCount).toBe(0);
  expect(current.accessBlocked).toBe(false);
  await mark(page);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  expect(
    (await f.ipc(`/submissions/${submission.id}`)).body.annotations,
  ).toEqual(submission.annotations);
});

test("authorization loss stops editing, auto-claim recovers unsynced draft in place and never imports it into another topic", async ({
  page,
  context,
}) => {
  await ready(page, context);
  await page.route("**/api/draft", (route) => route.abort());
  await mark(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  expect(before.dirty).toBe(true);
  await f.ipc("/access/revoke", {});
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().accessBlocked))
    .toBe(true);
  await expect(page.locator("#submit-feedback")).toBeDisabled();
  await expect(page.locator("#recovery-banner")).toBeVisible();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before.annotations);
  await page.unroute("**/api/draft");
  // Real address-bound bootstrap recovers this open page, without fixture
  // cookie injection or a reload that could hide an ownership race.
  await f.ipc("/access/admit", { address: "127.0.0.1" });
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().accessBlocked))
    .toBe(false);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before.annotations);
  await page.locator("#submit-feedback").click();
  await expect(page.locator("#feedback-status")).toContainText("已送到原會話");
  await page.locator("#finish-review").click();
  await expect
    .poll(async () => (await f.ipc("/status")).body.locked)
    .toBe(false);
  // Keep an old unsynced cache deliberately: a later topic uses the same GLB.
  await page.evaluate(
    ({ key, notes }) => {
      const data = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(
        key,
        JSON.stringify({
          ...data,
          annotations: notes,
          dirty: true,
          editSeq: 7,
          savedSeq: 1,
        }),
      );
    },
    { key: before.draftCacheKey, notes: before.annotations },
  );
  expect(
    (
      await f.ipc("/origin", {
        origin: {
          ...origin,
          sessionKey: "test-browser-topic-42",
          threadId: "42",
        },
      })
    ).status,
  ).toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().accessBlocked))
    .toBe(true);
  await authorize(context);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  const current = await page.evaluate(() => window.__reviewDiagnostics());
  expect(current.versionId).toBe(before.versionId);
  expect(current.reviewId).not.toBe(before.reviewId);
  expect(current.annotationCount).toBe(0);
  expect(current.dirty).toBe(false);
  expect(
    await page.evaluate(
      (key) => !!localStorage.getItem(key),
      before.draftCacheKey,
    ),
  ).toBe(true);
});

test("an unauthenticated browser sees a clear entrance state and no model", async ({
  page,
}) => {
  await page.goto(browserUrl);
  await expect(page.locator("#loading-text")).toContainText("原對話");
  await expect(page.locator("#loading .spinner")).toBeHidden();
  await expect(page.locator("#submit-feedback")).toBeDisabled();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().versionId),
  ).toBeNull();
});

test("remembered browser survives service restart and tab reopening; passive polls do not renew, actual navigation does", async ({
  page,
  context,
}) => {
  await f.ipc("/access/admit", { address: "127.0.0.1" });
  await page.goto(browserUrl);
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    (await context.cookies()).some(
      (c) =>
        c.name === "review_access" &&
        c.expires > Date.now() / 1000 + 29 * 86400,
    ),
  ).toBe(true);
  const first = (await f.ipc("/status")).body.access.browsers[0];
  await page.waitForResponse((r) => new URL(r.url()).pathname === "/api/state");
  expect((await f.ipc("/status")).body.access.browsers[0].lastUsedAt).toBe(
    first.lastUsedAt,
  );
  const activity = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/access/activity",
  );
  const box = await page.locator("#viewer").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -80);
  expect((await activity).status()).toBe(200);
  expect(
    (await f.ipc("/status")).body.access.browsers[0].lastUsedAt,
  ).toBeGreaterThan(first.lastUsedAt);
  await mark(page);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  await f.restart();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.owned).toBe(true);
  expect((await f.ipc("/status")).body.access.browsers[0].id).toBe(first.id);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(browserUrl);
  await expect(reopened.locator("#loading")).toBeHidden();
  expect((await f.ipc("/status")).body.access.browsers[0].id).toBe(first.id);
  expect((await f.ipc("/status")).body.access.sessions).toBe(1);
  expect(
    await reopened.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(1);
});

test("an editing tab recovers after a sibling tab collects their shared browser cookie", async ({
  page,
  context,
}) => {
  await ready(page, context);
  await mark(page);
  await expect(page.locator("#save-status")).toHaveText("草稿已保存");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  const sibling = await context.newPage();
  await sibling.goto(browserUrl);
  await expect(sibling.locator("#loading")).toBeHidden();
  await page.route("**/api/access/claim", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ACCESS_REQUIRED",
        error: "Awaiting sibling admission",
      }),
    }),
  );
  await f.ipc("/access/revoke", {});
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().accessBlocked))
    .toBe(true);
  await expect
    .poll(() =>
      sibling.evaluate(() => window.__reviewDiagnostics().accessBlocked),
    )
    .toBe(true);
  await f.ipc("/access/admit", { address: "127.0.0.1" });
  await expect
    .poll(() =>
      sibling.evaluate(() => window.__reviewDiagnostics().accessBlocked),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const current = window.__reviewDiagnostics();
        return { owned: current.owned, blocked: current.accessBlocked };
      }),
    )
    .toEqual({ owned: true, blocked: false });
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(before.annotations);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().accessBlocked),
  ).toBe(false);
  expect(await sibling.evaluate(() => window.__reviewDiagnostics().owned)).toBe(
    false,
  );
  expect((await f.ipc("/status")).body.access.sessions).toBe(1);
});
