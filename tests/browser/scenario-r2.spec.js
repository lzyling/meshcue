import { test, expect } from "./fixtures.mjs";
import { devices } from "@playwright/test";
import { startScenario } from "../../scripts/scenario-env.mjs";
import * as THREE from "three";
import fs from "node:fs";

const evidence = "tmp/b1-scenario-r2/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settled = (page) =>
  expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
async function open(page) {
  fs.mkdirSync(evidence, { recursive: true });
  const positions = new THREE.BoxGeometry(20, 16, 10).toNonIndexed().attributes
    .position;
  let stl = "solid regression\n";
  for (let i = 0; i < positions.count; i += 3) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (let j = 0; j < 3; j++)
      stl += `vertex ${positions.getX(i + j)} ${positions.getY(i + j)} ${positions.getZ(i + j)}\n`;
    stl += "endloop\nendfacet\n";
  }
  fs.writeFileSync("tmp/b1-scenario-r2/box.stl", stl + "endsolid regression\n");
  environment = await startScenario({
    fixture: "tmp/b1-scenario-r2/box.stl",
    dist: process.env.REVIEW_TEST_DIST,
  });
  await page.goto(environment.url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await diag(page)).viewer.meshes)
    .toBeGreaterThan(0);
  await settled(page);
}
async function screenshot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.R2_EVIDENCE || "green"}.png`,
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
async function chooseTouchTool(page, mode) {
  const button = page.locator(`[data-mode="${mode}"]`);
  const r = await button.boundingBox();
  // The caption remains reachable before the separate palette-overlap fix.
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height - 4);
  await expect(button).toHaveClass(/active/);
}
for (const device of ["iPhone 13", "iPad (gen 7) landscape"]) {
  test(`R2 bug 1: deliberate taps mark and touch gestures only navigate (${device})`, async ({
    browser,
  }) => {
    test.setTimeout(100000);
    const context = await browser.newContext({
      ...devices[device],
      defaultBrowserType: undefined,
    });
    try {
      const page = await context.newPage();
      await open(page);
      await page.locator("#toggle-annotations").tap();
      const r = await page.locator("#viewer canvas").boundingBox();
      const x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      await page.touchscreen.tap(x, y);
      expect((await diag(page)).annotationCount).toBe(0);
      await chooseTouchTool(page, "label");
      await page.touchscreen.tap(x, y);
      await expect.soft
        .poll(async () => (await diag(page)).annotationCount)
        .toBe(1);
      await chooseTouchTool(page, "fill");
      await page.touchscreen.tap(x - 45, y + 35);
      await expect.soft
        .poll(async () => (await diag(page)).annotationCount)
        .toBe(2);
      await chooseTouchTool(page, "measure");
      await page.touchscreen.tap(x - 45, y + 50);
      await page.touchscreen.tap(x + 35, y + 50);
      await expect.soft
        .poll(async () => (await diag(page)).measuring?.result?.value)
        .toBeGreaterThan(0);
      const session = await context.newCDPSession(page);
      for (const mode of ["label", "fill", "measure"]) {
        await chooseTouchTool(page, mode);
        const before = (await diag(page)).camera;
        // Start in empty canvas, clear of the marks placed above.
        const x = r.x + 65,
          y = r.y + r.height * 0.4;
        expect(
          await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS",
            { x, y },
          ),
        ).toBe(true);
        for (const [type, touchPoints] of [
          ["touchStart", [{ x, y }]],
          ["touchMove", [{ x: x + 40, y: y + 20 }]],
          ["touchMove", [{ x, y }]],
          ["touchEnd", []],
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
              { x: x - 40, y },
              { x: x + 40, y },
            ],
          ],
          ["touchEnd", []],
        ])
          await session.send("Input.dispatchTouchEvent", { type, touchPoints });
        expect((await diag(page)).annotationCount).toBe(2);
        expect((await diag(page)).camera).not.toEqual(before);
        if (mode === "measure")
          expect((await diag(page)).measuring?.picks || 0).toBe(0);
      }
      await session.detach();
    } finally {
      await context.close();
    }
  });
}

for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`R2 bug 2: Section leaves cube arrows clickable (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    await page.locator("#section-toggle").click();
    await screenshot(page, `bug2-section-${width}`);
    const arrow = page.locator(".navigation-arrow-left");
    expect(await unobscured(arrow)).toBe(true);
    const before = (await diag(page)).camera;
    await arrow.click({ timeout: 3000 });
    await settled(page);
    expect((await diag(page)).camera).not.toEqual(before);
  });
}
test("R2 bug 3: Display choices win over measurement options", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.locator('[data-mode="measure"]').click();
  for (const style of ["hidden", "xray"]) {
    await page.locator("#display-toggle").click();
    await screenshot(page, `bug3-display-${style}`);
    const choice = page.locator(`[data-style="${style}"]`);
    expect(await unobscured(choice)).toBe(true);
    await choice.click({ timeout: 3000 });
    await expect(choice).toHaveAttribute("aria-checked", "true");
  }
});
for (const locale of ["en", "zh-Hans", "zh-Hant", "ja", "de", "fr"]) {
  for (const theme of ["light", "dark"]) {
    test(`R2 bug 4: narrow toolbar fits with Parts (${locale}, ${theme})`, async ({
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
      await expect(page.locator("#parts-panel")).toBeVisible();
      await screenshot(page, `bug4-toolbar-${locale}-${theme}`);
      for (const button of await page
        .locator(".toolbar button:visible")
        .all()) {
        expect
          .soft(
            await unobscured(button),
            await button.getAttribute("data-command"),
          )
          .toBe(true);
      }
      expect(
        await page.locator(".toolbar").evaluate((toolbar) => {
          const bounds = toolbar
            .closest(".viewer-shell")
            .getBoundingClientRect();
          const buttons = [...toolbar.querySelectorAll("button")].filter(
            (b) => b.getClientRects().length,
          );
          return buttons.every((b) => {
            const r = b.getBoundingClientRect();
            return (
              r.left >= bounds.left &&
              r.right <= bounds.right &&
              [...b.querySelectorAll("span")].every((s) => {
                const text = s.getBoundingClientRect();
                return text.left >= r.left && text.right <= r.right;
              })
            );
          });
        }),
      ).toBe(true);
    });
  }
}
