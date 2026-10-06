import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import { clickControl, showParts } from "./b1u-shell-helpers.mjs";
import fs from "node:fs";

let environment;
const evidence = "tmp/b1u-int/evidence";
test.afterEach(async () => environment?.stop());
async function open(page) {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture: "tests/fixtures/plate.step",
    dist: process.env.REVIEW_TEST_DIST,
    runRoot: "tmp/b1u-int/scenarios",
  });
  await scenarioKit(page, environment).open(environment.url);
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
}
async function face(page) {
  return page.evaluate(() => {
    const r = document.querySelector("#viewer canvas").getBoundingClientRect();
    for (let y = r.top + 80; y < r.bottom - 180; y += 12)
      for (let x = r.left + 100; x < r.right - 120; x += 12)
        if (window.__navigationDiagnostics(x, y).pick) return { x, y };
    throw new Error("No visible model face");
  });
}
const noOverlap = (a, b) =>
  a.x + a.width <= b.x + 1 ||
  b.x + b.width <= a.x + 1 ||
  a.y + a.height <= b.y + 1 ||
  b.y + b.height <= a.y + 1;

test("integrated View selects parts regardless of sidebar visibility, without a face overlay", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("#sidebar-parts")).toBeHidden();
  let p = await face(page);
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.__navigationDiagnostics().selection),
  ).toBeNull();
  await showParts(page);
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(1);
  p = await face(page);
  await page.mouse.click(p.x, p.y);
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(1);
  await clickControl(page, "#section-toggle");
  expect(
    await page.evaluate(() => window.__navigationDiagnostics().selection),
  ).toBeNull();
  await page.screenshot({ path: `${evidence}/selection-and-section.png` });
  await page.keyboard.press("Escape");
  await page.locator("#settings-button").click();
  await page.locator("#setting-parts").uncheck();
  await page.locator("#close-settings").click();
  await page.locator("#section-off").click();
  p = await face(page);
  await page.mouse.click(p.x, p.y);
  await showParts(page);
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(1);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["compact", { width: 1024, height: 768 }],
  ["iphone13", { width: 390, height: 844 }],
])
  test.describe(name, () => {
    test.use({
      viewport,
      hasTouch: name === "iphone13",
      isMobile: name === "iphone13",
      deviceScaleFactor: name === "iphone13" ? 3 : 1,
    });
    test(`integrated STEP options and menus stay reachable at ${name}`, async ({
      page,
    }) => {
      await open(page);
      await expect(page.locator("#tool-hint")).toContainText(
        "double-click centres",
      );
      await clickControl(page, '[data-mode="fill"]');
      await expect(page.locator("#fill-control")).toBeHidden();
      await clickControl(page, '[data-mode="measure"]');
      await expect(page.locator('[data-measure="smart"]')).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator("#tool-hint")).toContainText(
        "Click an edge, hole or face",
      );
      await page.locator("#measure-advanced summary").click();
      await clickControl(page, "#section-toggle");
      for (const selector of ["#measure-options", "#section-options"]) {
        await expect(page.locator(selector)).toBeVisible();
        const box = await page.locator(selector).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(
          noOverlap(box, await page.locator(".toolbar").boundingBox()),
        ).toBe(true);
      }
      expect(
        noOverlap(
          await page.locator("#measure-options").boundingBox(),
          await page.locator("#section-options").boundingBox(),
        ),
      ).toBe(true);
      const hint = page.locator(".tool-hint-box");
      if (name === "iphone13") {
        // The two option panels leave too little room for a first-use hint.
        // It must return when Section closes, without asking to reset hints.
        await expect(hint).toBeHidden();
        await page.locator("#section-off").click();
        await expect(hint).toBeVisible();
        await expect(hint).toContainText("Click an edge, hole or face");
        await clickControl(page, "#section-toggle");
        await expect(hint).toBeHidden();
      } else {
        await expect(hint).toBeVisible();
        expect(
          noOverlap(
            await hint.boundingBox(),
            await page.locator("#section-options").boundingBox(),
          ),
        ).toBe(true);
      }
      await page.screenshot({
        path: `${evidence}/${name}-smart-advanced-section.png`,
      });
      for (const menu of ["view", "mark", "inspect"]) {
        await page.locator(`#${menu}-menu-button`).click();
        const popup = page.locator(`#${menu}-menu`);
        await expect(popup).toBeVisible();
        expect(
          noOverlap(
            await popup.boundingBox(),
            await page.locator(".toolbar").boundingBox(),
          ),
        ).toBe(true);
        const commands = {
          view: [
            "mode-orbit",
            "mode-pan",
            "home",
            "navigation-fit",
            "navigation-projection",
            "display",
            "plain",
            "marks",
          ],
          mark: ["mode-label", "mode-fill"],
          inspect: ["mode-measure", "section"],
        }[menu];
        for (const command of commands)
          await expect(
            popup.locator(`[data-command="${command}"]`),
          ).toBeVisible();
        const items = popup.locator("button:visible");
        for (let i = 0; i < (await items.count()); i++)
          await items.nth(i).click({ trial: true });
        await page.screenshot({ path: `${evidence}/${name}-${menu}-menu.png` });
        await page.keyboard.press("Escape");
      }
      await expect(
        page.locator('[data-command="navigation-projection"]'),
      ).toHaveCount(1);
    });
  });
