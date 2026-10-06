import { test, expect } from "./fixtures.mjs";
import { clickControl, showParts } from "./b1u-shell-helpers.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";

const evidence = "tmp/b1v-view/evidence";
let environment;
const nav = (page) => page.evaluate(() => window.__navigationDiagnostics());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settled = (page) =>
  expect.poll(async () => (await nav(page)).animating).toBe(false);
test.afterEach(async () => environment?.stop());
async function open(page) {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture: "tests/fixtures/plate.step",
    dist: process.env.REVIEW_TEST_DIST,
    runRoot: "tmp/b1v-view/scenarios",
  });
  await scenarioKit(page, environment).open(environment.url);
  await settled(page);
}
async function cube(page) {
  await page.locator("#settings-button").click();
  await page.locator("#setting-viewCube").check();
  await page.locator("#close-settings").click();
  await settled(page);
}
async function probe(page) {
  return page.evaluate(() => {
    const r = document.querySelector("#viewer canvas").getBoundingClientRect();
    for (let y = r.top + 100; y < r.bottom - 200; y += 12)
      for (let x = r.left + 310; x < r.right - 100; x += 12) {
        const pick = window.__navigationDiagnostics(x, y).pick;
        if (pick?.range?.[0] === 214) return { x, y, ...pick };
      }
  });
}
async function shot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.B1V_VIEW_EVIDENCE || "after"}.png`,
  });
}

test("view widget and fill evidence at desktop and phone sizes", async ({
  page,
}) => {
  await open(page);
  await cube(page);
  await shot(page, "desktop-idle");
  await page.locator(".orient-stage").hover();
  await shot(page, "desktop-hover");
  const p = await probe(page);
  expect(p).toBeTruthy();
  await clickControl(page, '[data-mode="fill"]');
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
  await page.mouse.move(10, 10);
  await shot(page, "desktop-fill");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-annotations").click();
  await page.mouse.move(10, 10);
  await settled(page);
  await shot(page, "phone-fill");
});

test("cube keeps Home visible, hides arrows until hover and embeds rotating axes", async ({
  page,
}) => {
  await open(page);
  await cube(page);
  await page.mouse.move(10, 10);
  await expect(page.locator("#home-view")).toBeVisible();
  expect(
    Number(
      await page
        .locator("#home-view")
        .evaluate((el) => getComputedStyle(el).opacity),
    ),
  ).toBeLessThan(1);
  await expect(page.locator(".navigation-arrow").first()).toBeHidden();
  await expect(page.locator(".navigation-roll").first()).toBeHidden();
  await expect(page.locator(".orient-stage > .navigation-triad")).toHaveCount(
    1,
  );
  await page.locator(".orient-stage").hover();
  for (const selector of [".navigation-arrow", ".navigation-roll"])
    for (const button of await page.locator(selector).all())
      await expect(button).toBeVisible();
  expect(await page.locator(".navigation-arrow").allTextContents()).toEqual([
    "◀",
    "▶",
    "▲",
    "▼",
  ]);
  await expect
    .poll(() =>
      page
        .locator("#home-view")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(1);
  const axes = await page.locator(".navigation-triad").innerHTML();
  const before = (await diag(page)).camera;
  await page.locator(".navigation-roll-left").click();
  const after = (await diag(page)).camera;
  after.position.forEach((v, i) =>
    expect(v).toBeCloseTo(before.position[i], 7),
  );
  after.target.forEach((v, i) => expect(v).toBeCloseTo(before.target[i], 7));
  await expect
    .poll(() => page.locator(".navigation-triad").innerHTML())
    .not.toBe(axes);
  await expect(page.locator("#orient-cube")).toHaveAttribute(
    "style",
    /rotateZ/,
  );
  await shot(page, "desktop-rolled");
  await page.keyboard.press("f");
  await settled(page);
  for (const corner of (await nav(page)).bounds)
    expect(Math.max(Math.abs(corner[0]), Math.abs(corner[1]))).toBeLessThan(1);
  await shot(page, "desktop-rolled-fit");
});

test("saved review default includes framing, projection and roll, survives reload, and can be reset", async ({
  page,
}) => {
  await open(page);
  await cube(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const initial = (await diag(page)).camera;
  await page.keyboard.press("Shift+4");
  await clickControl(page, "#navigation-projection");
  await page.keyboard.press("Control+Shift+ArrowRight");
  await page.keyboard.press("Shift+z");
  await page.locator(".orient-stage").hover();
  await page.locator(".navigation-roll-left").click();
  const saved = await diag(page);
  const sent = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" || request.method() === "POST")
      sent.push(request.postData() || "");
  });
  await page.locator(".orient-stage").click({ button: "right" });
  await expect(page.locator(".orient-menu")).toBeVisible();
  await shot(page, "desktop-default-menu");
  await page.locator('[data-command="navigation-default-set"]').click();
  expect((await nav(page)).defaultView.up).toBeTruthy();
  expect(sent.join("\n")).not.toContain("meshcue-default-view");
  await page.keyboard.press("Shift+2");
  await page.locator("#home-view").click();
  const equal = async () => {
    const current = await diag(page);
    for (const key of ["position", "target"])
      current.camera[key].forEach((v, i) =>
        expect(v).toBeCloseTo(saved.camera[key][i], 6),
      );
    expect((await nav(page)).projection).toBe("orthographic");
    const offset = current.camera.position.map(
      (v, i) => v - current.camera.target[i],
    );
    expect(
      Math.abs(current.cameraUp.reduce((sum, v, i) => sum + v * offset[i], 0)),
    ).toBeLessThan(1e-6);
  };
  await equal();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.keyboard.press("Shift+1");
  await page.locator("#home-view").click();
  await settled(page);
  await equal();
  // Keyboard access to the context menu has its own arrows, not camera steps.
  await page.locator(".orient-stage").focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator('[data-command="navigation-default-reset"]'),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  expect((await nav(page)).defaultView).toBeNull();
  await clickControl(page, "#navigation-projection");
  await page.locator("#home-view").click();
  await settled(page);
  const reset = (await diag(page)).camera;
  reset.position.forEach((v, i) =>
    expect(v).toBeCloseTo(initial.position[i], 5),
  );
  reset.target.forEach((v, i) => expect(v).toBeCloseTo(initial.target[i], 7));
});

test("fill has solid translucent tint and an outline that thickens when selected, never stripes", async ({
  page,
}) => {
  await open(page);
  const p = await probe(page);
  await clickControl(page, '[data-mode="fill"]');
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
  await page.mouse.move(10, 10);
  let fill = await nav(page);
  expect(fill.fills).toEqual([{ opacity: 0.46, solid: true }]);
  expect(fill.regionOutlines).toHaveLength(2);
  expect(fill.regionOutlines.every((o) => !o.dashed)).toBe(true);
  const selectedWidth = fill.regionOutlines.at(-1).width;
  await page.locator("#new-region").click();
  await expect
    .poll(async () => (await nav(page)).regionOutlines.at(-1).width)
    .toBeLessThan(selectedWidth);
  await shot(page, "desktop-fill-unselected");
});

test("View click selects only the part, keeps B-rep hover transient, and double-click centres at the hit", async ({
  page,
}) => {
  await open(page);
  await showParts(page);
  const p = await probe(page);
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(async () => (await nav(page)).hoverFaces)
    .toBe(p.range[1] - p.range[0] + 1);
  await page.mouse.click(p.x, p.y);
  expect((await nav(page)).selection).toBeNull();
  expect((await nav(page)).selectionOverlayChildren).toBe(0);
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(1);
  await page.mouse.move(500, 160);
  await expect.poll(async () => (await nav(page)).hoverFaces).toBe(0);
  await shot(page, "desktop-part-selected");
  await page.keyboard.press("Escape");
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(0);
  const before = (await diag(page)).camera;
  await page.mouse.dblclick(p.x, p.y);
  await settled(page);
  const after = (await diag(page)).camera;
  after.target.forEach((v, i) => expect(v).toBeCloseTo(p.point[i], 6));
  after.position.forEach((v, i) =>
    expect(v - after.target[i]).toBeCloseTo(
      before.position[i] - before.target[i],
      6,
    ),
  );
  expect((await nav(page)).selectionOverlayChildren).toBe(0);
  expect((await diag(page)).annotationCount).toBe(0);
});

test("touch reveals compact controls, long-press opens defaults, and a drag does not open the menu", async ({
  page,
}) => {
  await open(page);
  await cube(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toggle-annotations").click();
  await page.mouse.move(10, 10);
  const box = await page.locator(".orient-stage").boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const touch = await page.context().newCDPSession(page);
  const send = (type, touchPoints) =>
    touch.send("Input.dispatchTouchEvent", { type, touchPoints });
  try {
    await send("touchStart", [point]);
    await send("touchEnd", []);
    await expect(page.locator(".orient-stage")).toHaveClass(
      /navigation-touch-controls/,
    );
    await expect(page.locator(".navigation-roll-left")).toBeVisible();
    await shot(page, "phone-touch-controls");
    await page.evaluate(() => {
      window.__cubeTouchEvents = [];
      for (const type of ["pointerdown", "pointerup", "click", "contextmenu"])
        document.addEventListener(
          type,
          (e) =>
            window.__cubeTouchEvents.push({
              type,
              target: e.target.className,
              command: e.target.dataset?.command,
            }),
          true,
        );
    });
    await send("touchStart", [point]);
    await expect(page.locator(".orient-menu")).toBeVisible();
    await send("touchEnd", []);
    await shot(page, "phone-default-menu");
    fs.writeFileSync(
      `${evidence}/cube-touch-events.json`,
      JSON.stringify(
        await page.evaluate(() => window.__cubeTouchEvents),
        null,
        2,
      ),
    );
    await expect(page.locator(".orient-menu")).toBeVisible();
    await page.locator('[data-command="navigation-default-set"]').click();
    expect((await nav(page)).defaultView).not.toBeNull();
    await send("touchStart", [point]);
    await send("touchMove", [{ x: point.x + 25, y: point.y + 15 }]);
    await page.waitForTimeout(650);
    await send("touchEnd", []);
    await expect(page.locator(".orient-menu")).toBeHidden();
    await send("touchStart", [{ x: 30, y: 30 }]);
    await send("touchEnd", []);
    await expect(page.locator(".orient-stage")).not.toHaveClass(
      /navigation-touch-controls/,
    );
  } finally {
    await touch.detach().catch(() => {});
  }
});
