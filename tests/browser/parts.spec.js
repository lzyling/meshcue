import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { scenarioKit } from "../scenarios/kit.mjs";
const repo = process.cwd();
let url;
const evidence = path.join(repo, "tmp/b1-p/evidence");
let child, dir, env;
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-parts-"));
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

async function fixture(count = 3) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((data) => {
        this.result = data;
        this.onloadend?.();
      });
    }
  };
  const assembly = new THREE.Group();
  assembly.name = "Assembly";
  // 350 × 1,632 = 571,200 source triangles exercises the tree near the model
  // budget, rather than making hundreds of rows stand in for a large model.
  const geometry =
    count === 350
      ? new THREE.BoxGeometry(2, 2, 2, 12, 12, 11)
      : new THREE.BoxGeometry(2, 2, 2);
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: [0xd58060, 0x4c95b5, 0x75a56b][i % 3],
        metalness: 0,
        roughness: 0.6,
      }),
    );
    mesh.name = count === 3 ? ["Front", "Back", "Side"][i] : `Part ${i + 1}`;
    mesh.position.set(
      i < 2 ? 0 : 3 + ((i - 2) % 20) * 2.3,
      count === 3 ? 0 : Math.floor(i / 20) * 2.3,
      i === 0 ? 2 : -2,
    );
    assembly.add(mesh);
  }
  const file = path.join(dir, "parts.glb");
  fs.writeFileSync(
    file,
    Buffer.from(
      await new GLTFExporter().parseAsync(assembly, { binary: true }),
    ),
  );
  return file;
}
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const row = (page, name) =>
  page
    .locator(".parts-row")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
const select = (page, name) => row(page, name).locator(".parts-name").click();
const front = (page) => page.locator('[data-view="0,0,1"]').press("Enter");
async function open(page, file) {
  ctl(
    "publish",
    file || (await fixture()),
    "--version",
    "parts-v1",
    "--units",
    "mm",
  );
  const kit = scenarioKit(page, { run: evidence });
  await kit.open(url);
  return kit;
}
async function amberPixels(page) {
  const image = await page.locator("#viewer canvas").screenshot();
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (
      let i = Math.ceil(canvas.height * 0.2) * canvas.width * 4;
      i < Math.floor(canvas.height * 0.8) * canvas.width * 4;
      i += 4
    )
      if (
        bytes[i] > 150 &&
        bytes[i + 1] > 85 &&
        bytes[i + 1] < bytes[i] * 0.88 &&
        bytes[i + 2] < bytes[i + 1] * 0.65
      )
        count++;
    return count;
  }, image.toString("base64"));
}

async function draft(page, annotations, camera) {
  const d = await diag(page);
  const owner = {
    versionId: d.versionId,
    clientId: await page.evaluate(() =>
      sessionStorage.getItem("3d-review-client"),
    ),
  };
  for (const [route, method, body] of [
    ["review/begin", "POST", owner],
    ["draft", "PUT", { ...owner, revision: d.revision, annotations, camera }],
  ]) {
    const res = await fetch(`${url}/api/${route}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Review-Client": "1" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
  }
}

test("part rows, selection, fit, panel actions, shortcuts and version resets", async ({
  page,
}) => {
  const kit = await open(page);
  await expect(page.locator(".parts-row")).toHaveCount(4);
  await front(page);
  await kit.clickModelPoint([0, 0, 1]);
  await expect(row(page, "Front")).toHaveAttribute("aria-selected", "true");
  const initial = await diag(page);
  await page.locator("#theme-choice").selectOption("light");
  await kit.screenshot("panel-light");
  await page.locator("#theme-choice").selectOption("dark");
  await kit.screenshot("panel-dark");
  await kit.clickModelPoint([0, 0, 1]);
  await page.keyboard.press("y");
  await expect(row(page, "Front")).toHaveClass(/part-hidden/);
  await page.keyboard.press("Shift+Y");
  await expect(row(page, "Front")).not.toHaveClass(/part-hidden/);
  await page.locator('[data-command="parts-isolate"]').click();
  await expect(row(page, "Back")).toHaveClass(/part-hidden/);
  await kit.screenshot("isolate");
  await page.keyboard.press("Shift+I");
  await expect(row(page, "Back")).not.toHaveClass(/part-hidden/);
  await page.keyboard.press("Shift+I");
  await page.keyboard.press("Escape");
  await expect(row(page, "Back")).not.toHaveClass(/part-hidden/);
  const beforeFit = (await diag(page)).camera;
  await row(page, "Side").locator(".parts-name").dblclick();
  await expect
    .poll(async () => (await diag(page)).camera.target)
    .not.toEqual(beforeFit.target);
  await row(page, "Side").locator(".parts-eye").click();
  await page.keyboard.press("Shift+T");
  expect((await diag(page)).revision).toBe(initial.revision);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator(".part-hidden, .part-transparent")).toHaveCount(0);
  await select(page, "Front");
  await page.keyboard.press("y");
  ctl("publish", await fixture(4), "--version", "parts-v2", "--units", "mm");
  await expect
    .poll(async () => (await diag(page)).versionId)
    .not.toBe(initial.versionId);
  await expect(page.locator(".part-hidden, .part-transparent")).toHaveCount(0);
});

test("hidden parts lose pins and regions, cannot be marked, and stop contributing section caps", async ({
  page,
}) => {
  const kit = await open(page);
  await front(page);
  await page.locator('[data-mode="label"]').click();
  await kit.clickModelPoint([0, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await page.locator('[data-mode="fill"]').click();
  await kit.clickModelPoint([0.4, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("2");
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const marks = (await diag(page)).annotations;
  await row(page, "Front").locator(".parts-eye").click();
  await expect(page.locator(".model-pin")).toHaveCount(0);
  await page.locator('[data-mode="label"]').click();
  await kit.clickModelPoint([0, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("3");
  expect((await diag(page)).annotations.at(-1).meshId).toBe("mesh-1");
  await row(page, "Front").locator(".parts-eye").click();
  await expect(page.locator(".model-pin")).toHaveCount(2);
  expect((await diag(page)).annotations.slice(0, 2)).toEqual(marks);
  await page.locator("#section-toggle").click();
  await page.locator("#section-axis").selectOption("z");
  await page.locator("#section-offset").fill("2");
  await page.locator("#section-offset").press("Enter");
  await page.locator('[data-mode="orbit"]').click();
  await kit.screenshot("section-visible");
  expect(await amberPixels(page)).toBeGreaterThan(100);
  await row(page, "Front").locator(".parts-eye").click();
  await kit.screenshot("section-hidden");
  expect(await amberPixels(page)).toBeLessThan(10);
  await page.locator('[data-mode="label"]').click();
  await kit.clickModelPoint([0.3, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("4");
  expect((await diag(page)).annotations.at(-1).meshId).toBe("mesh-1");
});

test("transparent parts allow marking and measuring behind them through plain view", async ({
  page,
}) => {
  const kit = await open(page);
  await front(page);
  await select(page, "Front");
  await page.keyboard.press("Shift+T");
  await expect(row(page, "Front")).toHaveClass(/part-transparent/);
  await page.locator("#viewer").hover();
  await kit.screenshot("transparent");
  await page.locator('[data-mode="label"]').click();
  await kit.clickModelPoint([0, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  expect((await diag(page)).annotations[0].meshId).toBe("mesh-1");
  await page.locator("#neutral-view").click();
  await kit.clickModelPoint([0.4, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("2");
  expect((await diag(page)).annotations[1].meshId).toBe("mesh-1");
  await page.locator('[data-mode="measure"]').click();
  await kit.clickModelPoint([-0.5, -0.6, 1], { meshId: "mesh-1" });
  await expect.poll(async () => (await diag(page)).measuring?.picks).toBe(1);
  await kit.clickModelPoint([0.5, -0.6, 1], { meshId: "mesh-1" });
  await expect(page.locator("#keep-measure")).toBeEnabled();
  await page.locator("#keep-measure").click();
  await expect(page.locator("#annotation-count")).toHaveText("3");
  expect((await diag(page)).annotations[2].picks.map((p) => p.meshId)).toEqual([
    "mesh-1",
    "mesh-1",
  ]);
  await page.locator('[data-command="parts-transparent"]').click();
  await expect(row(page, "Front")).not.toHaveClass(/part-transparent/);
  await page.locator('[data-mode="label"]').click();
  await kit.clickModelPoint([-0.4, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("4");
  expect((await diag(page)).annotations[3].meshId).toBe("mesh-0");
});

test("old saved review retains its marks when parts hide, show and reload", async ({
  page,
}) => {
  const kit = await open(
    page,
    path.join(repo, "tmp/samples/parametric-bracket.glb"),
  );
  const legacy = JSON.parse(
    fs.readFileSync("tests/fixtures/legacy-review.json", "utf8"),
  );
  await draft(page, legacy.annotations, legacy.camera);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect((await diag(page)).annotations).toEqual(legacy.annotations);
  await expect(page.locator(".model-pin")).toHaveCount(2);
  await page.locator(".parts-name").first().click();
  await page.keyboard.press("y");
  await page.keyboard.press("Shift+Y");
  await expect(page.locator(".model-pin")).toHaveCount(2);
  expect((await diag(page)).annotations).toEqual(legacy.annotations);
  await kit.screenshot("legacy-marks");
});

test("phone parts sheet opens from the toolbar without covering the model", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const kit = await open(page);
  await expect(page.locator("#parts-panel")).toBeHidden();
  await page.locator('[data-command="parts-panel"]').click();
  await expect(page.locator("#parts-panel")).toBeVisible();
  const panel = await page.locator("#parts-panel").boundingBox(),
    canvas = await page.locator("#viewer canvas").boundingBox();
  expect(canvas.x).toBeGreaterThanOrEqual(0);
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(390);
  expect(panel.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  await kit.screenshot("phone");
  await select(page, "Front");
  await page.locator('[data-command="parts-hide"]').click();
  await expect(row(page, "Front")).toHaveClass(/part-hidden/);
  await page.locator("#parts-close").click();
  await expect(page.locator("#parts-panel")).toBeHidden();
});

test("hundreds of parts use bounded rows and remain keyboard reachable", async ({
  page,
}) => {
  await open(page, await fixture(350));
  expect((await diag(page)).precision.sourceTriangles).toBe(571200);
  expect(await page.locator(".parts-row").count()).toBeLessThan(40);
  await page.locator("#parts-tree").focus();
  await page.keyboard.press("End");
  await expect(row(page, "Part 350")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("y");
  await expect(row(page, "Part 350")).toHaveClass(/part-hidden/);
  await page.keyboard.press("Home");
  await expect(row(page, "Assembly")).toHaveAttribute("aria-selected", "true");
  await row(page, "Assembly").locator(".parts-expand").click();
  await expect(page.locator(".parts-row")).toHaveCount(1);
});
