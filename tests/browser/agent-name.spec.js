import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
/* The page calls the Agent by the name it gave, with the tool it runs in after
 * it. Only a browser shows that the name reaches the sentences drawn once at
 * start-up as well as those written later, that it goes in as words and never
 * as markup, and that a long one shortens inside its button instead of pushing
 * the button out of the panel.
 */
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

const repo = process.cwd();
let url;
let child, dir, env;

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "agent-name-"));
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
    REVIEW_BRIDGE: "off",
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
});
test.afterEach(async () => {
  // Opened on the worker's browser, so nothing closes them unless this does.
  for (const ctx of readers.splice(0)) await ctx.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
});

// What `open` does with the name, without an agent to call it.
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

const readers = [];
async function reader(browser, locale, languages, viewport) {
  const ctx = await browser.newContext({
    locale,
    ...(viewport ? { viewport } : {}),
  });
  readers.push(ctx);
  const page = await ctx.newPage();
  await page.addInitScript((langs) => {
    Object.defineProperty(navigator, "languages", { get: () => langs });
  }, languages);
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden({ timeout: 20000 });
  return page;
}

test("the page says the Agent's name wherever it spoke of the Agent", async ({
  browser,
}) => {
  const page = await reader(browser, "en-US", ["en-US", "en"]);
  const button = page.locator("#submit-feedback");
  await expect(button).toHaveText("Send to Agent");
  ctl("agent", "--name", "Ada", "--tool", "OpenClaw");
  // The next poll brings it; nothing is reloaded. The tool follows the name,
  // so a reader who has never met Ada knows what it is.
  await expect(button).toHaveText("Send to Ada (OpenClaw)");
  await expect(page.locator("#mark-note-text")).toHaveAttribute(
    "placeholder",
    "What should change here? Optional; it goes to Ada (OpenClaw) with the mark.",
  );
  await page.locator("#help-button").click();
  const help = page.locator("#help-dialog");
  await expect(help).toContainText(
    "“Send to Ada (OpenClaw)” saves and submits",
  );
  await expect(help).toContainText(
    "Ada (OpenClaw) first explains its understanding and waits for your confirmation before changing the model",
  );
  // Drawn at start-up in the page's own words; none of them may be left.
  expect(await help.innerText()).not.toMatch(/\bagent\b/i);
  await page.keyboard.press("Escape");

  // A name is words: angle brackets in it are shown, not obeyed.
  ctl("agent", "--name", "<b>Bo</b>");
  await expect(button).toHaveText("Send to <b>Bo</b>");
  await expect(button.locator("b")).toHaveCount(0);
});

test("a Chinese reader reads AI Agent until there is a name, then the name and its tool in full-width brackets", async ({
  browser,
}) => {
  const page = await reader(browser, "zh-CN", ["zh-CN", "zh"]);
  const button = page.locator("#submit-feedback");
  await expect(button).toHaveText("交给 AI Agent");
  // Only the tool: said once.
  ctl("agent", "--tool", "OpenClaw");
  await expect(button).toHaveText("交给 OpenClaw");
  ctl("agent", "--name", "爆爆", "--tool", "OpenClaw");
  await expect(button).toHaveText("交给爆爆（OpenClaw）");
  await expect(page.locator("#mark-note-text")).toHaveAttribute(
    "placeholder",
    "这里要怎么改？选填，会随标记交给爆爆（OpenClaw）。",
  );
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toContainText(
    "「交给爆爆（OpenClaw）」会保存并提交标记和说明",
  );
  await page.keyboard.press("Escape");
  // The CLI cannot say which tool is calling, so its name stands alone.
  ctl("agent", "--name", "爆爆");
  await expect(button).toHaveText("交给爆爆");
});

test("a long name shortens inside the button instead of pushing it out", async ({
  browser,
}) => {
  // The most the page can be given: a name at the limit and a tool after it.
  const name = "W".repeat(24);
  ctl("agent", "--name", name, "--tool", "Claude Code");
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 700, height: 900 },
  ]) {
    const page = await reader(browser, "de-DE", ["de-DE", "de"], viewport);
    const label = page.locator("#submit-feedback .submit-label");
    await expect(label).toHaveText(`An ${name} (Claude Code)`);
    // The whole name is still there for whoever points at it.
    await expect(label).toHaveAttribute("title", `An ${name} (Claude Code)`);
    // The button stays in its panel, and its words and icon stay in it.
    const box = await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const button = document.querySelector("#submit-feedback");
      const panel = rect(document.querySelector(".annotations-panel"));
      const outer = rect(button);
      const within = (inner, box) =>
        inner.left >= box.left - 0.5 && inner.right <= box.right + 0.5;
      return {
        inside:
          within(outer, panel) &&
          within(rect(button.querySelector(".submit-label")), outer) &&
          within(rect(button.querySelector(".icon")), outer),
        widths: [panel, outer, rect(button.querySelector(".submit-label"))]
          .map((r) => Math.round(r.width))
          .join(" / "),
      };
    });
    expect(box.inside, `${viewport.width}px: ${box.widths}`).toBe(true);
    await page.context().close();
  }
});
