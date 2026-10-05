import {
  clickControl,
  showParts,
  revealControl,
} from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { devices } from "@playwright/test";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";

const evidence = "tmp/b1-decisions/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const offset = (camera) => camera.position.map((v, i) => v - camera.target[i]);
function expectPan(before, after) {
  expect(after.target).not.toEqual(before.target);
  offset(after).forEach((v, i) => expect(v).toBeCloseTo(offset(before)[i], 7));
}
async function open(page) {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST,
    runRoot: "tmp/b1-decisions/scenarios",
  });
  await scenarioKit(page, environment).open(environment.url);
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
}
async function shot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.DECISIONS_EVIDENCE || "green"}.png`,
  });
}
async function drag(page, button = "left") {
  const r = await page.locator("#viewer canvas").boundingBox();
  await page.mouse.move(r.x + r.width * 0.45, r.y + r.height * 0.4);
  await page.mouse.down({ button });
  await page.mouse.move(r.x + r.width * 0.45 + 45, r.y + r.height * 0.4 + 20, {
    steps: 5,
  });
}
test("Pan: primary drag translates without rotation or marks, H selects it, and navigation gestures remain available", async ({
  page,
}) => {
  await open(page);
  await shot(page, "pan-desktop");
  await page.keyboard.press("h");
  await expect(page.locator('[data-mode="pan"]')).toHaveClass(/active/);
  await expect(page.locator("#tool-options")).toBeHidden();
  const before = (await diag(page)).camera;
  await drag(page);
  await expect(page.locator("#viewer canvas")).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  expectPan(before, (await diag(page)).camera);
  await expect(page.locator("#viewer canvas")).toHaveCSS("cursor", "grab");
  await page.mouse.click(600, 350);
  expect((await diag(page)).annotationCount).toBe(0);
  const pan = (await diag(page)).camera;
  await drag(page, "right");
  await page.mouse.up({ button: "right" });
  expect(offset((await diag(page)).camera)).not.toEqual(offset(pan));
  for (const mode of ["orbit", "pan", "label", "fill", "measure"]) {
    await clickControl(page, `[data-mode="${mode}"]`);
    for (const button of ["left", "middle"]) {
      const before = (await diag(page)).camera;
      if (button === "left") await page.keyboard.down("Shift");
      await drag(page, button);
      await page.mouse.up({ button });
      await page.keyboard.up("Shift");
      expectPan(before, (await diag(page)).camera);
    }
  }
  expect((await diag(page)).annotationCount).toBe(0);
  await page.keyboard.press("h");
  for (const ctrl of [false, true]) {
    const before = (await diag(page)).camera;
    if (ctrl) await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect
      .poll(async () => Math.hypot(...offset((await diag(page)).camera)))
      .toBeLessThan(Math.hypot(...offset(before)));
  }
  await shot(page, "pan-selected");
});
for (const device of ["iPhone 13", "iPad (gen 7) landscape"]) {
  test(`Pan: single touch pans and pinch zooms (${device})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices[device],
      defaultBrowserType: undefined,
    });
    try {
      const page = await context.newPage();
      await open(page);
      await page.locator("#toggle-annotations").tap();
      await shot(page, `pan-${device.split(" ")[0]}`);
      await clickControl(page, '[data-mode="pan"]', "tap");
      const r = await page.locator("#viewer canvas").boundingBox(),
        x = r.x + r.width * 0.45,
        y = r.y + r.height * 0.4;
      await page.touchscreen.tap(x, y);
      const before = (await diag(page)).camera;
      const session = await context.newCDPSession(page);
      for (const [type, touchPoints] of [
        ["touchStart", [{ x, y }]],
        ["touchMove", [{ x: x + 45, y: y + 20 }]],
        ["touchEnd", []],
      ])
        await session.send("Input.dispatchTouchEvent", { type, touchPoints });
      expectPan(before, (await diag(page)).camera);
      const pan = (await diag(page)).camera;
      for (const [type, touchPoints] of [
        [
          "touchStart",
          [
            { x: x - 20, y },
            { x: x + 20, y },
          ],
        ],
        [
          "touchMove",
          [
            { x: x - 45, y },
            { x: x + 45, y },
          ],
        ],
        ["touchEnd", []],
      ])
        await session.send("Input.dispatchTouchEvent", { type, touchPoints });
      expect(Math.hypot(...offset((await diag(page)).camera))).toBeLessThan(
        Math.hypot(...offset(pan)),
      );
      expect((await diag(page)).annotationCount).toBe(0);
      await session.detach();
      await shot(page, `pan-selected-${device.split(" ")[0]}`);
    } finally {
      await context.close();
    }
  });
}
for (const locale of ["de", "fr"])
  for (const theme of ["light", "dark"]) {
    test(`Pan: toolbar and phone palette remain reachable (${locale}, ${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.addInitScript(
        ({ locale, theme }) => {
          localStorage.setItem("meshcue-locale", locale);
          localStorage.setItem("meshcue-theme", theme);
        },
        { locale, theme },
      );
      await open(page);
      await showParts(page);
      await expect(page.locator("#parts-panel")).toBeVisible();
      await shot(page, `pan-layout-${locale}-${theme}`);
      await revealControl(page, '[data-mode="pan"]');
      await expect(page.locator('[data-mode="pan"]')).toBeVisible();
      await page.keyboard.press("Escape");
      const reachable = async () =>
        page.locator(".toolbar button:visible").evaluateAll((buttons) =>
          buttons.every((b) => {
            const r = b.getBoundingClientRect(),
              shell = b.closest(".viewer-shell").getBoundingClientRect();
            return (
              r.left >= shell.left &&
              r.right <= shell.right &&
              r.bottom <= innerHeight &&
              b.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              )
            );
          }),
        );
      expect(await reachable()).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      await clickControl(page, '[data-mode="fill"]');
      await shot(page, `pan-palette-${locale}-${theme}`);
      expect(await reachable()).toBe(true);
      const toolbar = await page.locator(".toolbar").boundingBox(),
        palette = await page.locator("#tool-options").boundingBox();
      expect(palette.y + palette.height).toBeLessThanOrEqual(toolbar.y);
    });
  }

test("Pan: hovering matches Orbit and existing pins cannot be selected or moved", async ({
  page,
}) => {
  await open(page);
  const r = await page.locator("#viewer canvas").boundingBox();
  let point;
  for (const dx of [0, -60, 60, -110, 110]) {
    const candidate = { x: r.x + r.width / 2 + dx, y: r.y + r.height * 0.45 };
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(80);
    if (
      await page.evaluate(() => window.__navigationDiagnostics().hoverFaces > 0)
    ) {
      point = candidate;
      break;
    }
  }
  expect(point).toBeTruthy();
  const faces = await page.evaluate(
    () => window.__navigationDiagnostics().hoverFaces,
  );
  await page.keyboard.press("h");
  await page.mouse.move(point.x + 1, point.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__navigationDiagnostics().hoverFaces),
    )
    .toBe(faces);
  await page.mouse.click(point.x, point.y);
  expect((await diag(page)).annotationCount).toBe(0);
  await clickControl(page, '[data-mode="label"]');
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  await page.keyboard.press("h");
  const marks = (await diag(page)).annotations;
  const pin = page.locator(".model-pin").first();
  await expect(pin).toHaveCSS("pointer-events", "none");
  const b = await pin.boundingBox();
  const before = (await diag(page)).camera;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 15, {
    steps: 5,
  });
  await page.mouse.up();
  expectPan(before, (await diag(page)).camera);
  expect((await diag(page)).annotations).toEqual(marks);
});
