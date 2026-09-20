/* The badge is the only part of this feature a reviewer ever sees, and the
   request behind it is the only one this service makes to the internet. Both
   are checked here against a stand-in upstream on loopback: a suite that
   reached GitHub to prove it can reach GitHub would be slow, rate-limited and
   wrong about what it was testing.
 *
 * Kept out of review.spec.js on purpose. Every case there runs with the check
 * turned off, which is what a suite should do by default, and one case that
 * needs it on would have to turn it on for all of them. */
import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";

const repo = process.cwd(),
  url = "http://127.0.0.1:43176";
let child, upstream, dir, env, asked;

async function start({ tag, notes, fail = false } = {}) {
  asked = 0;
  upstream = http.createServer((req, res) => {
    asked++;
    if (fail) {
      res.writeHead(503).end("{}");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ tag_name: tag, html_url: notes }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/latest`;

  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "update-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  env = {
    ...process.env,
    PORT: "43176",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
    REVIEW_SESSION_KEY: "test-only-update-session",
    REVIEW_ALLOWED_HOSTS: "review.test",
    REVIEW_UPDATE_CHECK: "on",
    REVIEW_UPDATE_URL: upstreamUrl,
    REVIEW_UPDATE_TTL_MS: "500",
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  const out = fs.openSync(path.join(dir, "server.log"), "a");
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env,
    stdio: ["ignore", out, out],
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  execFileSync(
    process.execPath,
    [
      "scripts/reviewctl.mjs",
      "publish",
      "../../media/3d/3d-agent-review/samples/parametric-bracket.glb",
      "--name",
      "Bracket",
      "--version",
      "v1",
    ],
    { cwd: repo, env, encoding: "utf8" },
  );
}

test.afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
  await new Promise((r) => upstream.close(r));
});

test("a newer release shows up beside the running version, and links to it", async ({
  page,
}) => {
  await start({
    tag: "v99.0.0",
    notes: "https://example.test/releases/v99.0.0",
  });
  await page.goto(url);
  const badge = page.locator("#app-update");
  await expect(badge).toBeVisible({ timeout: 10000 });
  await expect(badge).toHaveText("99.0.0");
  // The reviewer is not usually the person who installs anything, so the badge
  // says who to tell rather than offering a button that cannot do it.
  await expect(badge).toHaveAttribute("title", /ask your agent/i);
  await expect(badge).toHaveAttribute(
    "href",
    "https://example.test/releases/v99.0.0",
  );
  // It sits with the version it is about, not somewhere else in the header.
  expect(
    await page.locator(".brand-title #app-update").count(),
    "the badge left the name it belongs to",
  ).toBe(1);
  // And it did not cost the header its fit on an embedded-width panel.
  await page.setViewportSize({ width: 460, height: 720 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "the badge pushed a horizontal scrollbar",
  ).toBe(true);
});

test("an upstream that is not ahead, or not answering, says nothing at all", async ({
  page,
}) => {
  // The version this suite runs is whatever the manifest says; an upstream
  // naming 0.0.1 is behind any of them.
  await start({ tag: "v0.0.1" });
  await page.goto(url);
  await expect(page.locator("#app-version")).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.locator("#app-update")).toBeHidden();
  /* Asked, and asked only a handful of times across a page polling every 2.2
     seconds — the window here is 500ms, so this is the caching working, not the
     absence of traffic. */
  expect(asked).toBeGreaterThan(0);
  expect(asked).toBeLessThan(12);
});

test("a failing upstream is never reported to the reviewer", async ({
  page,
}) => {
  await start({ fail: true });
  await page.goto(url);
  await expect(page.locator("#app-version")).toBeVisible();
  await page.waitForTimeout(2000);
  // Not reaching GitHub says nothing about the model in front of them.
  await expect(page.locator("#app-update")).toBeHidden();
  await expect(page.locator("#connection-status")).not.toContainText(/error/i);
});
