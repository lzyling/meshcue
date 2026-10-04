import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import fs from "node:fs";

const evidence = "tmp/b1-fix/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
async function open(page) {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST,
  });
  await page.goto(environment.url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await diag(page)).viewer.meshes)
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
}
async function screenshot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.FIX_EVIDENCE || "green"}.png`,
  });
}
async function unobscured(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return (
      r.left >= 0 &&
      r.right <= innerWidth &&
      r.top >= 0 &&
      r.bottom <= innerHeight &&
      [0.15, 0.5, 0.85].every((x) =>
        [0.2, 0.8].every((y) =>
          el.contains(
            document.elementFromPoint(
              r.left + r.width * x,
              r.top + r.height * y,
            ),
          ),
        ),
      )
    );
  });
}

for (const locale of ["en", "zh-Hant", "de"]) {
  test(`Bug 1: phone toolbar and expanded Section leave every control tappable (${locale})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 664 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(
        (locale) => localStorage.setItem("meshcue-locale", locale),
        locale,
      );
      await open(page);
      await screenshot(page, `bug1-${locale}-toolbar`);
      for (const button of await page
        .locator(".toolbar button:visible")
        .all()) {
        expect
          .soft(await unobscured(button), await button.getAttribute("id"))
          .toBe(true);
      }
      await page.locator("#section-toggle").tap();
      await screenshot(page, `bug1-${locale}-section`);
      expect
        .soft(await unobscured(page.locator(".navigation-arrow-left")))
        .toBe(true);
      const section = await page.locator("#section-options").boundingBox();
      const triad = await page.locator(".navigation-triad").boundingBox();
      expect
        .soft(
          section.x + section.width <= triad.x ||
            section.y >= triad.y + triad.height ||
            section.y + section.height <= triad.y,
        )
        .toBe(true);
      await page.locator(".navigation-arrow-left").tap({ timeout: 3000 });
      await page.locator("#section-off").tap();
      await page.locator("#display-toggle").tap();
      await expect(page.locator("#display-menu")).toBeVisible();
      await page.locator("#display-toggle").tap();
      await page.locator('[data-command="parts-panel"]').tap();
      await expect(page.locator("#parts-panel")).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
