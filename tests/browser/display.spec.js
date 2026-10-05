import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
const repo = process.cwd();
let url;
const evidence = path.join(repo, "tmp/b1-d/evidence");
let child, dir, env;
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-display-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
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
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
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

async function open(page, file = "tmp/samples/parametric-bracket.glb") {
  ctl("publish", file, "--version", "display", "--units", "mm");
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await diagnostics(page)).viewer.display.pending)
    .toBe(false);
  expect((await diagnostics(page)).viewer.display.error).toBeNull();
  fs.mkdirSync(evidence, { recursive: true });
}
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());
async function style(page, name) {
  await page.locator("#display-toggle").click();
  await page.locator(`[data-style="${name}"]`).click();
  await expect
    .poll(async () => (await diagnostics(page)).viewer.display.style)
    .toBe(name);
}
async function pixelDifference(page, one, two, side = "all") {
  return page.evaluate(
    async ([a, b, side]) => {
      const read = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      const [x, y] = await Promise.all([read(a), read(b)]);
      let changed = 0;
      for (let row = Math.ceil(x.height * 0.2); row < x.height * 0.8; row++)
        for (
          let col = Math.ceil(x.width * (side === "right" ? 0.505 : 0.2));
          col < x.width * (side === "left" ? 0.495 : 0.8);
          col++
        ) {
          const i = (row * x.width + col) * 4;
          if (
            [0, 1, 2].some((c) => Math.abs(x.data[i + c] - y.data[i + c]) > 8)
          )
            changed++;
        }
      return changed;
    },
    [one.toString("base64"), two.toString("base64"), side],
  );
}
for (const model of ["bracket", "plate"])
  for (const theme of ["light", "dark"]) {
    test(`display styles render ${model} in ${theme} with visible edge differences`, async ({
      page,
    }) => {
      await open(
        page,
        model === "plate" ? "tests/fixtures/plate.step" : undefined,
      );
      await page.locator("#theme-choice").selectOption(theme);
      const shots = {};
      for (const name of ["edges", "shaded", "wireframe", "hidden", "xray"]) {
        await style(page, name);
        await page.mouse.move(5, 5);
        const state = (await diagnostics(page)).viewer.display;
        expect(state.segments > 0).toBe(
          ["edges", "wireframe", "hidden"].includes(name),
        );
        shots[name] = await page.locator("#viewer canvas").screenshot();
        await page.screenshot({
          path: path.join(evidence, `${model}-${theme}-${name}.png`),
        });
        await page.locator("#neutral-view").click();
        expect((await diagnostics(page)).viewer.neutral).toBe(true);
        expect((await diagnostics(page)).viewer.display.style).toBe(name);
        await page.locator("#neutral-view").click();
      }
      for (const name of ["edges", "wireframe", "hidden", "xray"])
        expect(
          await pixelDifference(page, shots.shaded, shots[name]),
        ).toBeGreaterThan(150);
    });
  }

test("display menu is keyboard reachable, persists and reuses version edge cache", async ({
  page,
}) => {
  await open(page);
  expect((await diagnostics(page)).viewer.display.style).toBe("edges");
  await page.locator("#display-toggle").click();
  await expect(page.locator("#display-menu")).toBeVisible();
  await page.locator("#display-toggle").click();
  await expect(page.locator("#display-menu")).toBeHidden();
  await page.locator("#display-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-style="edges"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#display-toggle")).toBeFocused();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect((await diagnostics(page)).viewer.display.style).toBe("shaded");
  const initial = (await diagnostics(page)).versionId;
  ctl("publish", "tests/fixtures/plate.step", "--version", "plate");
  await expect
    .poll(async () => (await diagnostics(page)).versionId)
    .not.toBe(initial);
  await expect
    .poll(async () => (await diagnostics(page)).viewer.display.pending)
    .toBe(false);
  await page.locator(`[data-version-id="${initial}"]`).click();
  await expect
    .poll(async () => (await diagnostics(page)).viewer.display.cacheHits)
    .toBeGreaterThan(0);
});

test("display section clips edges and preserves the opaque cap in every style", async ({
  page,
}) => {
  await open(page, "tests/fixtures/plate.step");
  await page.locator("#section-toggle").click();
  await page.locator("#section-axis").selectOption("z");
  for (const name of ["edges", "wireframe", "hidden", "xray", "shaded"]) {
    await style(page, name);
    expect((await diagnostics(page)).viewer.display.clipped).toBe(true);
    expect((await diagnostics(page)).viewer.section).not.toBeNull();
    await page.screenshot({
      path: path.join(evidence, `plate-section-${name}.png`),
    });
  }
  // A front view projects model X onto screen X. Keep the left half, then
  // compare styles away from the cut boundary: there must be feature pixels
  // on retained surfaces and none anywhere in the removed half.
  await page.locator('[data-view="0,0,1"]').press("Enter");
  await page.locator("#section-axis").selectOption("x");
  await page.locator("#section-offset").fill("0");
  await page.locator("#section-offset").press("Enter");
  const shaded = await page.locator("#viewer canvas").screenshot();
  await style(page, "edges");
  const edges = await page.locator("#viewer canvas").screenshot();
  const retained = await pixelDifference(page, shaded, edges, "left");
  const removed = await pixelDifference(page, shaded, edges, "right");
  fs.writeFileSync(
    path.join(evidence, "section-edge-pixels.json"),
    JSON.stringify({ retained, removed }),
  );
  expect(retained).toBeGreaterThan(20);
  expect(removed).toBe(0);
});

test("display X-ray keeps surface labels visible and selectable and bucket picking intact", async ({
  page,
}) => {
  const kit = scenarioKit(page, { run: evidence });
  await open(page);
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  await style(page, "xray");
  await page.locator('[data-mode="label"]').click();
  // Use a real surface point after fitting; repeated guessed clicks can queue
  // multiple marks before the asynchronous edit has returned its first one.
  await kit.clickModelPoint([-0.35, 0, 0.2]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await expect(page.locator(".model-pin")).toBeVisible();
  await page.locator(".model-pin").click();
  await expect(page.locator("#mark-note")).toBeVisible();
  const mark = (await diagnostics(page)).annotations[0];
  expect(mark.position.every(Number.isFinite)).toBe(true);
  await page.locator('[data-mode="fill"]').click();
  await kit.clickModelPoint([0.35, 0, 0.2]);
  await expect
    .poll(async () => (await diagnostics(page)).viewer.fillFaces)
    .toBeGreaterThan(0);
  await page.screenshot({ path: path.join(evidence, "xray-marks.png") });
});

test("performance is idle when still, updates on orbit, copies a private report and costs nothing per frame when off", async ({
  page,
}) => {
  if (process.env.MESHCUE_CI_CPU_RATE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: Number(process.env.MESHCUE_CI_CPU_RATE),
    });
  }
  await open(page);
  await expect(page.locator("#perf-panel")).toHaveCount(0);
  expect((await diagnostics(page)).viewer.performance.sampledFrames).toBe(0);
  await page.locator("#perf-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#perf-panel")).toBeVisible();
  await expect
    .poll(
      async () => (await diagnostics(page)).viewer.performance.snapshot.idle,
    )
    .toBe(true);
  const box = await page.locator("#viewer canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: "right" });
  // Capture a rendered sample while input is still arriving. By the time a
  // slow driver's mouse.up round trip returns, the 300 ms idle deadline can
  // legitimately have expired; a later one-shot read cannot describe the drag.
  const [sample] = await Promise.all([
    page.waitForFunction(() => {
      const snapshot = window.__reviewDiagnostics().viewer.performance.snapshot;
      return !snapshot.idle && snapshot.fps > 0 ? snapshot : false;
    }),
    page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
      steps: 50,
    }),
  ]);
  if (process.env.MESHCUE_CI_INPUT_GAP_MS)
    await page.waitForTimeout(Number(process.env.MESHCUE_CI_INPUT_GAP_MS));
  await page.mouse.up({ button: "right" });
  const active = await sample.jsonValue();
  await sample.dispose();
  expect(active.idle).toBe(false);
  expect(active.fps).toBeGreaterThan(0);
  expect(active.software).toBe(true);
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
  await page.locator("#perf-copy").click();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("30 FPS");
  expect(report).toContain("Shaded with edges");
  expect(report).toContain("Software rendering: On");
  expect(report).not.toMatch(/bracket|\.glb|mesh-0/);
  fs.writeFileSync(path.join(evidence, "performance-report.txt"), report);
  for (const theme of ["light", "dark"]) {
    await page.locator("#theme-choice").selectOption(theme);
    for (const section of [false, true]) {
      if (!!(await diagnostics(page)).viewer.section !== section)
        await page.locator("#section-toggle").click();
      await expect(page.locator("#perf-panel pre")).toContainText(
        `Section view: ${section ? "On" : "Off"}`,
      );
      const panelBox = await page.locator("#perf-panel").boundingBox();
      const homeBox = await page.locator("#home-view").boundingBox();
      expect(panelBox.y).toBeGreaterThan(homeBox.y + homeBox.height);
      await page.screenshot({
        path: path.join(evidence, `perf-${theme}-section-${section}.png`),
      });
    }
  }
  await expect
    .poll(
      async () => (await diagnostics(page)).viewer.performance.snapshot.idle,
    )
    .toBe(true);
  await page.locator("#perf-toggle").click();
  await expect(page.locator("#perf-panel")).toHaveCount(0);
  const off = (await diagnostics(page)).viewer.performance.sampledFrames;
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 20 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect((await diagnostics(page)).viewer.performance.sampledFrames).toBe(off);
  await page.reload();
  await expect(page.locator("#perf-panel")).toHaveCount(0);
});

test("performance ON versus OFF frame-time evidence at identical canvas size", async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page, "tmp/samples/bunny-figurine.glb");
  // Otherwise enabling the panel shrinks the canvas, changing the amount of
  // software rasterization and making an overhead comparison meaningless.
  await page.addStyleTag({
    content:
      ".performance-open #viewer { right: 0; top: 0; width: 100%; height: 100%; }",
  });
  const runs = [];
  for (const enabled of [false, true, false, true]) {
    if ((await diagnostics(page)).viewer.performance.enabled !== enabled)
      await page.locator("#perf-toggle").click();
    const frames = await page.evaluate(async () => {
      const spans = [],
        canvas = document.querySelector("#viewer canvas");
      let last;
      for (let frame = 0; frame < 70; frame++) {
        const now = await new Promise(requestAnimationFrame);
        if (frame >= 20) spans.push(now - last);
        last = now;
        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: frame % 2 ? -2 : 2,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      spans.sort((a, b) => a - b);
      return {
        samples: spans.length,
        meanMs: spans.reduce((a, b) => a + b, 0) / spans.length,
        medianMs: spans[Math.floor(spans.length / 2)],
        worstMs: spans.at(-1),
        width: canvas.width,
        height: canvas.height,
      };
    });
    runs.push({ enabled, ...frames });
  }
  const state = (await diagnostics(page)).viewer.performance.snapshot;
  fs.writeFileSync(
    path.join(evidence, "performance-overhead.json"),
    JSON.stringify(
      {
        renderer: state.renderer,
        software: state.software,
        userAgent: state.userAgent,
        method:
          "Chromium SwiftShader software renderer; bunny; identical canvas dimensions; alternating ±2 wheel zoom each frame; OFF/ON/OFF/ON, 20 warmup then 50 requestAnimationFrame intervals each. Shared machine: observational, not a hardware performance guarantee.",
        runs,
      },
      null,
      2,
    ),
  );
  expect(
    runs.every(
      (r) =>
        r.samples === 50 &&
        r.width === runs[0].width &&
        r.height === runs[0].height,
    ),
  ).toBe(true);
});
