import { clickControl, showParts } from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";

const evidence = "tmp/b1u-v/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const nav = (page) => page.evaluate(() => window.__navigationDiagnostics());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settled = (page) =>
  expect.poll(async () => (await nav(page)).animating).toBe(false);
async function open(page, fixture = "tests/fixtures/plate.step") {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST,
    runRoot: "tmp/b1u-v/scenarios",
  });
  await scenarioKit(page, environment).open(environment.url);
  await settled(page);
}
async function probes(page) {
  return page.evaluate(() => {
    const r = document.querySelector("#viewer canvas").getBoundingClientRect();
    const found = new Map();
    for (let y = r.top + 100; y < r.bottom - 200; y += 8)
      for (let x = r.left + 310; x < r.right - 80; x += 8) {
        const pick = window.__navigationDiagnostics(x, y).pick;
        if (!pick) continue;
        const key = `${pick.meshId}:${pick.range?.[0] ?? pick.seed}`;
        if (!found.has(key)) found.set(key, { x, y, ...pick });
      }
    return [...found.values()];
  });
}
async function shot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.B1U_VIEW_EVIDENCE || "after"}.png`,
  });
}
test("STEP hover follows whole planar and rounded B-rep faces", async ({
  page,
}) => {
  await open(page);
  const points = await probes(page);
  fs.writeFileSync(
    `${evidence}/face-probes.json`,
    JSON.stringify(points, null, 2),
  );
  expect(points.length).toBeGreaterThan(2);
  // plate.step has four radius-2 rounded corners and a cylindrical hole.
  // Save both views before assertions so the red run captures the old strips.
  const plane = points.find((p) => p.range[0] === 214);
  const fillet = points.find((p) => p.range[0] === 218);
  expect(plane).toBeTruthy();
  expect(fillet).toBeTruthy();
  for (const [name, p] of [
    ["plane", plane],
    ["fillet", fillet],
  ]) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(100);
    await shot(page, `hover-${name}`);
  }
  for (const p of points) {
    await page.mouse.move(p.x, p.y);
    await expect
      .poll(async () => (await nav(page)).hoverFaces)
      .toBe(p.range[1] - p.range[0] + 1);
  }
});

test("STEP fill paints one whole B-rep face, hides spread and survives reload", async ({
  page,
}) => {
  await open(page);
  const p = (await probes(page)).find((p) => p.range[0] === 218);
  await clickControl(page, '[data-mode="fill"]');
  await expect(page.locator("#fill-control")).toBeHidden();
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  const marks = (await diag(page)).annotations;
  const faces = marks[0].faces[p.meshId];
  expect(faces).toHaveLength(p.range[1] - p.range[0] + 1);
  expect(faces.toSorted((a, b) => a - b)).toEqual(
    Array.from({ length: 20 }, (_, i) => 218 + i),
  );
  await shot(page, "fill-fillet");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect((await diag(page)).annotations).toEqual(marks);
});

test("View click selects a face and part without making a mark, empty space and Escape clear it", async ({
  page,
}) => {
  await open(page);
  await showParts(page);
  const p = (await probes(page)).find((p) => p.range[0] === 218);
  await page.mouse.click(p.x, p.y);
  expect((await nav(page)).selection).toEqual({ meshId: p.meshId, faces: 20 });
  await page.mouse.move(500, 160);
  expect((await nav(page)).selection).not.toBeNull();
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(1);
  expect((await diag(page)).annotationCount).toBe(0);
  expect((await diag(page)).dirty).toBe(false);
  await shot(page, "selected-fillet");
  await page.keyboard.press("Escape");
  expect((await nav(page)).selection).toBeNull();
  await page.mouse.click(p.x, p.y);
  await page.mouse.click(500, 160);
  expect((await nav(page)).selection).toBeNull();
});

test("View double-click recentres at the hit without zoom and empty double-click does nothing", async ({
  page,
}) => {
  await open(page);
  const p = (await probes(page)).find((p) => p.range[0] === 218);
  const before = (await diag(page)).camera;
  await page.mouse.dblclick(p.x, p.y);
  await settled(page);
  const after = (await diag(page)).camera;
  after.target.forEach((v, i) => expect(v).toBeCloseTo(p.point[i], 6));
  const offset = (c) => c.position.map((v, i) => v - c.target[i]);
  offset(after).forEach((v, i) => expect(v).toBeCloseTo(offset(before)[i], 6));
  await page.mouse.dblclick(500, 160);
  await settled(page);
  expect((await diag(page)).camera.target).toEqual(after.target);
});

test("View touch tap selects, double-tap recentres and drag or pinch never selects", async ({
  page,
}) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const p = (await probes(page)).find((p) => p.range[0] === 218);
  await page.evaluate(() => {
    window.__touchEvents = [];
    for (const type of ["pointerdown", "pointerup", "pointercancel"])
      window.addEventListener(
        type,
        (e) =>
          window.__touchEvents.push({
            type,
            at: e.timeStamp,
            pointerType: e.pointerType,
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
          }),
        true,
      );
  });
  const touch = await page.context().newCDPSession(page);
  const send = (type, touchPoints, timestamp) =>
    touch.send("Input.dispatchTouchEvent", { type, touchPoints, timestamp });
  const point = { x: p.x, y: p.y };
  try {
    await send("touchStart", [point]);
    await send("touchEnd", []);
    expect((await nav(page)).selection?.faces).toBe(20);
    await page.keyboard.press("Escape");
    // A finger's taps carry the time the screen sensed them, and that is what
    // the double-tap window measures. An unstamped protocol event is stamped
    // when the browser receives it instead, and each send waits for the page
    // to handle the previous one: on a software-rendered runner that put
    // 850 ms between the two releases, so the test tapped too slowly rather
    // than the page missing a double tap. State a finger's timing outright.
    const at = Date.now() / 1000;
    await send("touchStart", [point], at);
    await send("touchEnd", [], at + 0.06);
    await send("touchStart", [point], at + 0.18);
    await send("touchEnd", [], at + 0.24);
    fs.writeFileSync(
      `${evidence}/touch-events.json`,
      JSON.stringify(await page.evaluate(() => window.__touchEvents), null, 2),
    );
    expect((await nav(page)).animating).toBe(false);
    (await diag(page)).camera.target.forEach((v, i) =>
      expect(v).toBeCloseTo(p.point[i], 5),
    );
    await page.keyboard.press("Escape");
    await send("touchStart", [point]);
    await send("touchMove", [{ x: p.x + 35, y: p.y + 15 }]);
    await send("touchEnd", []);
    expect((await nav(page)).selection).toBeNull();
    await send("touchStart", [point, { x: p.x + 50, y: p.y }]);
    await send("touchMove", [point, { x: p.x + 80, y: p.y }]);
    await send("touchEnd", []);
    expect((await nav(page)).selection).toBeNull();
    expect((await diag(page)).annotationCount).toBe(0);
  } finally {
    await touch.detach();
  }
});

test("View drag returning to its start, cancelled contacts and Pan clicks do not select", async ({
  page,
}) => {
  await open(page);
  const p = (await probes(page)).find((p) => p.range[0] === 218);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y, { steps: 4 });
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
  expect((await nav(page)).selection).toBeNull();
  const touch = await page.context().newCDPSession(page);
  try {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: p.x, y: p.y }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
  } finally {
    await touch.detach();
  }
  expect((await nav(page)).selection).toBeNull();
  await page.keyboard.press("h");
  const before = (await diag(page)).camera;
  await page.mouse.dblclick(p.x, p.y);
  expect((await nav(page)).selection).toBeNull();
  expect((await diag(page)).camera.target).toEqual(before.target);
});

test("old STEP fills keep their saved triangle subset instead of expanding to a B-rep face", async ({
  page,
}) => {
  await open(page);
  // Recreate a pre-fix source-v2 draft: just the first two triangles of a
  // fillet, as the old angle-based bucket would save. The data format is old
  // and valid; loading must never reinterpret it through the new helper.
  await page.route("**/api/draft", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const body = route.request().postDataJSON();
    for (const mark of body.annotations || [])
      if (mark.type === "region") mark.faces = { "mesh-0": [218, 219] };
    await route.continue({ postData: JSON.stringify(body) });
  });
  const p = (await probes(page)).find((p) => p.range[0] === 218);
  await clickControl(page, '[data-mode="fill"]');
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect((await diag(page)).annotations[0].faces).toEqual({
    "mesh-0": [218, 219],
  });
  await shot(page, "legacy-fill-strip");
});

test("STL hover and fill retain planar regions and the spread slider", async ({
  page,
}) => {
  const { BoxGeometry } = await import("three");
  fs.mkdirSync(evidence, { recursive: true });
  const geometry = new BoxGeometry(20, 15, 8).toNonIndexed();
  const vertices = geometry.attributes.position;
  let stl = "solid view\n";
  for (let i = 0; i < vertices.count; i += 3) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (let j = 0; j < 3; j++)
      stl += `vertex ${vertices.getX(i + j)} ${vertices.getY(i + j)} ${vertices.getZ(i + j)}\n`;
    stl += "endloop\nendfacet\n";
  }
  fs.writeFileSync("tmp/b1u-v/box.stl", stl + "endsolid view\n");
  geometry.dispose();
  await open(page, "tmp/b1u-v/box.stl");
  const p = (await probes(page))[0];
  expect(p.range).toBeUndefined();
  await page.mouse.move(p.x, p.y);
  await expect.poll(async () => (await nav(page)).hoverFaces).toBe(2);
  await clickControl(page, '[data-mode="fill"]');
  await expect(page.locator("#fill-control")).toBeVisible();
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
  expect((await diag(page)).annotations[0].faces[p.meshId]).toHaveLength(2);
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  fs.copyFileSync(
    "tests/fixtures/plate.step",
    `${environment.workspace}/plate.stp`,
  );
  await environment.ipc("/publish", {
    file: "plate.stp",
    name: "STEP replacement",
    version: "step",
  });
  await page.locator("[data-version-id]").last().click();
  await expect
    .poll(async () => (await diag(page)).modelFilename)
    .toMatch(/\.stp$/);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#fill-control")).toBeHidden();
  await page.locator("[data-version-id]").first().click();
  await expect
    .poll(async () => (await diag(page)).modelFilename)
    .toMatch(/\.stl$/);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#fill-control")).toBeVisible();
});

test("fixed mouse mapping remains available in every tool and help describes View selection", async ({
  page,
}) => {
  await open(page);
  const offset = (c) => c.position.map((v, i) => v - c.target[i]);
  const drag = async (button, shift = false) => {
    await page.mouse.move(1000, 420);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.down({ button });
    await page.mouse.move(1040, 435, { steps: 4 });
    await page.mouse.up({ button });
    if (shift) await page.keyboard.up("Shift");
  };
  for (const mode of ["orbit", "label", "fill", "measure", "pan"]) {
    await clickControl(page, `[data-mode="${mode}"]`);
    let before = (await diag(page)).camera;
    await drag("right");
    expect(offset((await diag(page)).camera)).not.toEqual(offset(before));
    before = (await diag(page)).camera;
    await drag("left");
    const after = (await diag(page)).camera;
    if (["label", "fill", "measure"].includes(mode)) {
      offset(after).forEach((v, i) =>
        expect(v).toBeCloseTo(offset(before)[i], 7),
      );
      expect(after.target).toEqual(before.target);
    } else if (mode === "orbit")
      expect(offset(after)).not.toEqual(offset(before));
    for (const [button, shift] of [
      ["middle", false],
      ["left", true],
      ["right", true],
    ]) {
      before = (await diag(page)).camera;
      await drag(button, shift);
      const after = (await diag(page)).camera;
      expect(after.target).not.toEqual(before.target);
      offset(after).forEach((v, i) =>
        expect(v).toBeCloseTo(offset(before)[i], 7),
      );
    }
    before = (await diag(page)).camera;
    await page.mouse.wheel(0, -40);
    await expect
      .poll(async () => Math.hypot(...offset((await diag(page)).camera)))
      .toBeLessThan(Math.hypot(...offset(before)));
    before = (await diag(page)).camera;
    await page.keyboard.down("Shift");
    await page.mouse.wheel(15, 20);
    await page.keyboard.up("Shift");
    await expect
      .poll(async () => (await diag(page)).camera.target)
      .not.toEqual(before.target);
    offset((await diag(page)).camera).forEach((v, i) =>
      expect(v).toBeCloseTo(offset(before)[i], 7),
    );
  }
  expect((await diag(page)).annotationCount).toBe(0);
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toContainText(
    "click or tap a face to select it",
  );
  await expect(page.locator("#help-dialog")).toContainText(
    "double-clicking empty space does nothing",
  );
});
