import { installFakeOpenClaw } from "../helpers/fake-openclaw.mjs";
import { clickControl } from "./b1u-shell-helpers.mjs";
import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
/* What the reviewer is shown after pressing the button: how many marks went,
 * that the Agent read them and when, that its understanding arrived — and,
 * where the Agent cannot be woken, what to do about it, with the sentence to
 * do it with. Only a browser shows the lines change as the service reports
 * each step, that the sentence copies, and that it all stays in the panel.
 */
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

const repo = process.cwd();
let url;
let child, dir, env;

async function start(extra = {}) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-receipt-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  installFakeOpenClaw(bin);
  env = {
    ...process.env,
    PORT: "0",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR:
      process.env.REVIEW_TEST_DIST || path.join(repo, "tmp/refinement-dist"),
    REVIEW_SESSION_KEY: "test-only-review-session",
    REVIEW_ALLOWED_HOSTS: "review.test",
    REVIEW_UPDATE_CHECK: "off",
    REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    ...extra,
  };
  const log = fs.openSync(path.join(dir, "server.log"), "a");
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env,
    stdio: ["ignore", log, log],
  });
  url = await browserServerUrl(child, dir);
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  ctl(
    "publish",
    "tmp/samples/parametric-bracket.glb",
    "--name",
    "Bracket",
    "--version",
    "v1",
  );
}
test.afterEach(async () => {
  for (const ctx of readers.splice(0)) await ctx.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
});
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });
const readers = [];
async function reader(browser, locale, viewport) {
  const ctx = await browser.newContext({
    locale,
    ...(viewport ? { viewport } : {}),
  });
  readers.push(ctx);
  const page = await ctx.newPage();
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
  return { ctx, page };
}
async function markAndSend(page, send) {
  const box = await page.locator("#viewer").boundingBox();
  await clickControl(page, '[data-mode="label"]');
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await clickControl(page, '[data-mode="orbit"]');
  await page.getByRole("button", { name: send }).click();
}
const submitted = () =>
  JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))
    .submissions[0];

test("where the host pushes, the lines under the button follow the batch to the Agent's understanding", async ({
  browser,
}) => {
  await start();
  const { page } = await reader(browser, "en-US");
  await markAndSend(page, /Send to Agent/);
  const line = page.locator("#feedback-line"),
    detail = page.locator("#feedback-detail");
  await expect(line).toHaveText(
    "Marks sent: 1 · waiting for the Agent to read it",
  );
  await expect(detail).toHaveText("delivered to the original conversation");
  // Someone is told: nothing for the reviewer to do.
  await expect(page.locator("#receipt-nudge")).toBeHidden();
  const receipt = submitted();
  ctl("read", receipt.id);
  await expect(line).toContainText("Marks sent: 1 · the Agent has read it · ");
  const readAt = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  ).submissions[0].readAt;
  const time = await page.evaluate(
    (at) =>
      new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(at)),
    readAt,
  );
  await expect(line).toHaveText(
    `Marks sent: 1 · the Agent has read it · ${time}`,
  );
  await expect(detail).toHaveText(
    "What the Agent understood will appear at the bottom right of the model",
  );
  const file = path.join(dir, "echo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: receipt.id,
      versionId: receipt.versionId,
      summary: "Thicken the bracket arm",
      annotations: [],
    }),
  );
  ctl("echo", file);
  await expect(page.locator("#echo-panel")).toBeVisible();
  await expect(detail).toContainText("What the Agent understood arrived at ");
});

test("where nothing can push to the Agent, the page says so and hands over the sentence to paste", async ({
  browser,
}) => {
  await start({ REVIEW_BRIDGE: "off" });
  ctl("agent", "--name", "爆爆", "--tool", "Claude Code");
  const { ctx, page } = await reader(browser, "zh-CN");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: url,
  });
  await markAndSend(page, "交给爆爆（Claude Code）");
  const line = page.locator("#feedback-line");
  await expect(line).toHaveText(
    "已送出 1 个标记 · 等待爆爆（Claude Code）读取",
  );
  // No delivery to report where there was nowhere to deliver.
  await expect(page.locator("#feedback-detail")).toBeHidden();
  const nudge = page.locator("#receipt-nudge");
  await expect(nudge).toBeVisible();
  await expect(page.locator("#receipt-nudge-text")).toHaveText(
    "爆爆（Claude Code）收不到自动通知，请回到它的对话里说一声，可以直接粘贴这句：",
  );
  const receipt = submitted();
  const sentence = `我在 MeshCue 交了 1 个标记，请用 meshcue read 读取：submissionId ${receipt.id}`;
  await expect(page.locator("#receipt-line")).toHaveText(sentence);
  await page.screenshot({
    path: path.join(dir, "2026-09-29-receipt-zh-wide.png"),
  });
  await page.locator("#receipt-copy").click();
  await expect(page.locator("#receipt-copy")).toHaveText("已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    sentence,
  );
  // Once the Agent has read the batch there is nothing left to tell it.
  ctl("read", receipt.id);
  await expect(nudge).toBeHidden();
  await expect(line).toContainText(
    "已送出 1 个标记 · 爆爆（Claude Code）已读取 · ",
  );
  await expect(page.locator("#feedback-detail")).toHaveText(
    "爆爆（Claude Code）的理解会显示在模型右下角",
  );
});

test("the sentence copies without the clipboard API, and fits a narrow host panel", async ({
  browser,
}) => {
  await start({ REVIEW_BRIDGE: "off" });
  const { ctx, page } = await reader(browser, "zh-CN", {
    width: 420,
    height: 900,
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: url,
  });
  // A page on the local network is served over plain HTTP, where the
  // clipboard API is not offered at all.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });
  await markAndSend(page, "交给 AI Agent");
  const nudge = page.locator("#receipt-nudge");
  await expect(nudge).toBeVisible();
  const receipt = submitted();
  await expect(page.locator("#receipt-line")).toHaveText(
    `我在 MeshCue 交了 1 个标记，请用 meshcue read 读取：submissionId ${receipt.id}`,
  );
  // Everything the reviewer acts on is inside the panel, above the model.
  const inside = await page.evaluate(() => {
    const panel = document
      .querySelector(".annotations-panel")
      .getBoundingClientRect();
    return ["#submit-feedback", "#receipt-copy", "#receipt-line"].map((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return (
        r.top >= panel.top - 0.5 &&
        r.bottom <= panel.bottom + 0.5 &&
        r.left >= panel.left - 0.5 &&
        r.right <= panel.right + 0.5
      );
    });
  });
  expect(inside).toEqual([true, true, true]);
  await page.screenshot({
    path: path.join(dir, "2026-09-29-receipt-zh-narrow.png"),
  });
  await page.locator("#receipt-copy").click();
  await expect(page.locator("#receipt-copy")).toHaveText("已复制");
});

test("W2 status proves a browser loaded since open, not merely a retained receipt", async ({
  browser,
}) => {
  await start({ REVIEW_BRIDGE: "off" });
  const { ipc } = await import("../../integration/manager.mjs");
  await ipc(dir, null, "/opened", {});
  const status = () => JSON.parse(ctl("status"));
  expect(status().viewer.loadedSinceOpen).toBe(false);
  const { page } = await reader(browser, "en-US");
  await expect.poll(() => status().viewer.loadedSinceOpen).toBe(true);
  expect(status().viewer.clients).toBe(1);
  await new Promise((r) => setTimeout(r, 5));
  await ipc(dir, null, "/opened", {});
  expect(status().viewer.loadedSinceOpen).toBe(false);
  await page.reload();
  await expect.poll(() => status().viewer.loadedSinceOpen).toBe(true);
  expect(status().viewer.expectedSha256).toBe(status().active.sha256);
});
