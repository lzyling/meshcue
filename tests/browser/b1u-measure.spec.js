import { browserServerUrl } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";

/* Measuring, on a model whose every dimension is known: a plate 20 × 15 × 8,
   modelled flat on +Z and centred on the origin. The page stands an STL up and
   fits it into three units by its long side, so the file's (x, y, z) is the
   preview's 0.15 × (x, z, -y); that is all a test needs to aim at a corner. */

const repo = process.cwd();
let url;
let child, dir, env;

function writePlate() {
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
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-b1u-measure-"));
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

async function open(page, units, file = writePlate()) {
  ctl(
    "publish",
    file,
    "--version",
    "plate",
    ...(units ? ["--units", units] : []),
  );
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: "Measure tool", exact: true }).click();
  await expect(page.locator("#measure-options")).toBeVisible();
}
// Where a point of the plate is on the screen, from the camera the page holds.
// A GLB is not stood up: its (x, y, z) is the preview's 0.15 × (x, y, z).
async function screenOf(page, [x, y, z], format) {
  // Cube changes now animate. Sample screen coordinates only once the camera
  // has arrived, so the following click still tests the intended source face.
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const box = await page.locator("#viewer").boundingBox();
  const camera = new THREE.PerspectiveCamera(
    38,
    box.width / box.height,
    0.01,
    100,
  );
  camera.up.fromArray(d.screenUp);
  camera.position.fromArray(d.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(d.camera.target));
  camera.updateMatrixWorld();
  const p = (
    format === "glb"
      ? new THREE.Vector3(0.15 * x, 0.15 * y, 0.15 * z)
      : new THREE.Vector3(0.15 * x, 0.15 * z, -0.15 * y)
  ).project(camera);
  return {
    x: box.x + ((p.x + 1) / 2) * box.width,
    y: box.y + ((1 - p.y) / 2) * box.height,
  };
}
// A click a few pixels in from a corner, towards the middle of a face: close
// enough that the corner is taken, far enough in that the face is what is hit.
async function nearCorner(page, corner, face) {
  const [c, m] = [await screenOf(page, corner), await screenOf(page, face)];
  const d = Math.hypot(m.x - c.x, m.y - c.y);
  return { x: c.x + ((m.x - c.x) / d) * 4, y: c.y + ((m.y - c.y) / d) * 4 };
}
const click = async (page, at) => {
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
};
const reading = (page) => page.locator("#measure-reading");
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());

// The STEP rim has 42 tessellation vertices. Zoom until the segment midpoint
// lies outside both 10 px vertex snaps, then click just into its top-face side.
// These are the known rim vertices (-2.5, 0, 4) and (-2.472077, -0.372606, 4).
async function holeRim(page) {
  await page.locator('.orient-face[data-view="0,1,0"]').dispatchEvent("click");
  const distance = (camera) =>
    new THREE.Vector3()
      .fromArray(camera.position)
      .distanceTo(new THREE.Vector3().fromArray(camera.target));
  let gap = 0;
  for (let step = 0; step < 6; step++) {
    const a = await screenOf(page, [-2.5, 0, 4]);
    const b = await screenOf(page, [-2.472077, -0.372606, 4]);
    gap = Math.hypot(a.x - b.x, a.y - b.y);
    if (gap > 28) break;
    const centre = await screenOf(page, [0, 0, 4]);
    const before = (await diagnostics(page)).camera;
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, -220);
    await expect
      .poll(async () => distance((await diagnostics(page)).camera))
      .toBeLessThan(distance(before) * 0.99);
  }
  expect(gap).toBeGreaterThan(28);
  return screenOf(page, [-2.506, -0.188, 4]);
}

test("smart STEP rim and wall each give the known 5 mm diameter", async ({
  page,
}) => {
  await open(page, "mm", "tests/fixtures/plate.step");
  await expect(page.locator('[data-measure="smart"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await click(page, await holeRim(page));
  expect((await diagnostics(page)).measuring.objects).toEqual(["edge"]);
  await expect(reading(page)).toHaveText("⌀5.00 mm");
  for (const theme of ["light", "dark"]) {
    await page.locator("#theme-choice").selectOption(theme);
    await page.screenshot({ path: `tmp/b1u-m/evidence/rim-${theme}.png` });
  }
  await page.keyboard.press("Escape");
  await page.locator("#home-view").click();
  // From the front/top edge the far wall is visible well below its rim;
  // a low point viewed from a three-quarter corner is occluded by the top.
  await page.locator('[data-view="0,1,1"]').dispatchEvent("click");
  await click(page, await screenOf(page, [0, 2.49, 1]));
  await page.screenshot({ path: "tmp/b1u-m/evidence/hole-wall.png" });
  expect((await diagnostics(page)).measuring.objects).toEqual(["face"]);
  await expect(reading(page)).toHaveText("⌀5.00 mm");
});

test("smart straight edge, parallel faces, unsupported relation and third-click reset", async ({
  page,
}) => {
  await open(page, "mm", "tests/fixtures/plate.step");
  const front = await screenOf(page, [0, -7.5, 4]);
  await click(page, { x: front.x, y: front.y + 3 });
  await expect(reading(page)).toHaveText("16.00 mm");
  await click(page, await screenOf(page, [5, 3, 4]));
  await expect(page.locator("#toast")).toHaveText(
    "This pair cannot be compared yet. Try two corners or two flat faces.",
  );
  await expect(page.locator("#keep-measure")).toBeDisabled();
  await click(page, await screenOf(page, [5, 3, 4]));
  await expect(reading(page)).toHaveText("Click a second object to compare");
  await page.locator('.orient-face[data-view="0,-1,0"]').dispatchEvent("click");
  await click(page, await screenOf(page, [5, 3, -4]));
  await expect(reading(page)).toHaveText("8.00 mm");
});

test("Advanced is closed by default, remembered, and returns to Smart", async ({
  page,
}) => {
  await open(page, "mm");
  await expect(page.locator('[data-measure="points"]')).toBeHidden();
  await page.locator("#measure-advanced summary").click();
  for (const kind of ["points", "edge", "planes", "circle"]) {
    await page.locator(`[data-measure="${kind}"]`).click();
    await expect(page.locator(`[data-measure="${kind}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: "Measure tool", exact: true }).click();
  await expect(page.locator("#measure-advanced")).toHaveAttribute("open", "");
  await page.locator('[data-measure="smart"]').click();
  await expect(page.locator('[data-measure="smart"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#measure-advanced summary").click();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: "Measure tool", exact: true }).click();
  await expect(page.locator('[data-measure="points"]')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#measure-advanced summary").click();
  await expect(page.locator('[data-measure="circle"]')).toBeVisible();
  await page.screenshot({ path: "tmp/b1u-m/evidence/advanced-phone.png" });
});

test("a smart kept circle reloads, draws its ring, undoes and submits the existing shape", async ({
  page,
}) => {
  await open(page, "mm", "tests/fixtures/plate.step");
  await click(page, await holeRim(page));
  await expect(reading(page)).toHaveText("⌀5.00 mm");
  await page.locator("#keep-measure").click();
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const [mark] = (await diagnostics(page)).annotations;
  expect(mark).toMatchObject({
    kind: "circle",
    quantity: "diameter",
    value: 5,
  });
  expect(mark.points).toHaveLength(3);
  expect(mark.picks).toHaveLength(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).annotationCount)
    .toBe(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).annotationCount)
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect((await diagnostics(page)).annotations[0]).toEqual(mark);
  await expect(page.locator(".measure-label")).toContainText("⌀5.00 mm");
  await expect(page.locator(".annotation-row")).toContainText("Circle");
  await page.screenshot({ path: "tmp/b1u-m/evidence/kept-circle.png" });
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/feedback"),
  );
  await page.locator("#submit-feedback").click();
  const sent = await response;
  expect(sent.ok()).toBe(true);
  const submitted = JSON.parse(
    fs.readFileSync(
      path.join(dir, "submissions", `${(await sent.json()).id}.json`),
      "utf8",
    ),
  );
  expect(submitted.annotations[0]).toMatchObject({ kind: "circle", value: 5 });
});

test("Advanced three-point circles on STL keep the existing behaviour", async ({
  page,
}) => {
  await open(page, "mm");
  const first = await nearCorner(page, [-10, -7.5, 4], [0, 0, 4]);
  await page.mouse.move(first.x, first.y);
  await expect(page.locator(".measure-dot.hover.snapped")).toBeVisible();
  await click(page, first);
  await expect(reading(page)).toHaveText("Click a second object to compare");
  await click(page, await nearCorner(page, [10, -7.5, 4], [0, 0, 4]));
  await expect(reading(page)).toHaveText("20.00 mm");
  await page.keyboard.press("Escape");
  await page.locator("#measure-advanced summary").click();
  await page.locator('[data-measure="circle"]').click();
  for (const corner of [
    [-10, -7.5, 4],
    [10, -7.5, 4],
    [10, 7.5, 4],
  ])
    await click(page, await nearCorner(page, corner, [0, 0, 4]));
  await expect(reading(page)).toHaveText("⌀25.00 mm");
});

test("measurement help explains smart picks and the Advanced fallback", async ({
  page,
}) => {
  await open(page, "mm");
  await expect(page.locator("#tool-hint")).toContainText(
    "Click an edge, hole or face",
  );
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toContainText("Advanced");
  await expect(page.locator("#help-dialog")).toContainText("one click");
});
