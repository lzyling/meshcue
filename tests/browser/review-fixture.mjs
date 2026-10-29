import { installFakeOpenClaw } from "../helpers/fake-openclaw.mjs";
import { clickControl } from "./r12-b-helpers.mjs";
import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

/* The server, sample model and helpers every review*.spec.js case shares.
   The cases were one file; split by theme, they still each get a fresh
   service and data directory. A file calls useReviewServer() once: hooks
   registered here at import time would attach only to the first file a
   worker loads, since a module is evaluated once per worker. */

export const repo = process.cwd();
export let url;
export let browserUrl;
export let child, dir, env;
export async function request(method, route, body) {
  const res = await fetch(`${url}/api/${route}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Review-Client": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}
export function fetchThroughFixture(route) {
  // route.fetch uses Node DNS, not Chromium's host-resolver mapping. Keep the
  // browser origin/Host while reaching the isolated loopback fixture directly.
  const target = new URL(route.request().url());
  const host = target.host;
  target.hostname = "127.0.0.1";
  return route.fetch({
    url: target.href,
    headers: { ...route.request().headers(), host },
  });
}
export function publish(file = "parametric-bracket.glb", version = "v1") {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        `tmp/samples/${file}`,
        "--name",
        file === "bunny-figurine.glb" ? "人偶樣例" : "參數支架",
        "--version",
        version,
      ],
      { cwd: repo, env, encoding: "utf8" },
    ),
  );
}
export async function ready(page) {
  await page.goto(browserUrl);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator('[data-mode="label"]')).toBeEnabled();
}
export async function point(page, dx = 0, dy = 0) {
  const box = await page.locator("#viewer").boundingBox();
  return {
    x: box.x + box.width * 0.55 + dx,
    y: box.y + box.height * 0.45 + dy,
  };
}
/* A plate 20 × 15 × 8 mm, modelled flat on +Z and centred on the origin, as an
   ASCII STL. STL carries no up axis, which is what makes it the model to ask
   about orientation with. */
export function writePlate() {
  const stl = path.join(dir, "plate.stl");
  const [lo, hi] = [
    [-10, -7.5, -4],
    [10, 7.5, 4],
  ];
  const corner = (i) => [0, 1, 2].map((k) => ((i >> k) & 1 ? hi : lo)[k]);
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const facet = (a, b, c) =>
    `facet normal 0 0 0\nouter loop\n${[a, b, c]
      .map((i) => `vertex ${corner(i).join(" ")}`)
      .join("\n")}\nendloop\nendfacet`;
  fs.writeFileSync(
    stl,
    `solid plate\n${quads
      .flatMap(([a, b, c, d]) => [facet(a, b, c), facet(a, c, d)])
      .join("\n")}\nendsolid plate\n`,
  );
  return stl;
}
export async function pin(page) {
  await clickControl(page, '[data-mode="label"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
}

export function useReviewServer() {
  test.beforeEach(async () => {
    fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
    dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-"));
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
    };
    const log = fs.openSync(path.join(dir, "server.log"), "a");
    child = spawn(process.execPath, ["server/index.mjs"], {
      cwd: repo,
      env,
      stdio: ["ignore", log, log],
    });
    url = await browserServerUrl(child, dir);
    browserUrl = browserOrigin(url);
    for (let i = 0; i < 80; i++) {
      try {
        const res = await fetch(`${url}/api/health`);
        if (res.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    publish();
  });
  test.afterEach(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    }
  });
}
