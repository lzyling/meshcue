import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import { clickControl } from "./b1u-shell-helpers.mjs";
import fs from "node:fs";
import path from "node:path";

let environment;
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(error.stack));
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
  });
});
test.afterEach(async () => environment?.stop());
const open = async (page) =>
  scenarioKit(page, environment).open(environment.url);
const choose = async (page, _menu, selector) => clickControl(page, selector);
const settings = async (page) => page.locator("#settings-button").click();
const closeSettings = async (page) => page.locator("#close-settings").click();
const noOverlap = (a, b) =>
  a.x + a.width <= b.x + 1 ||
  b.x + b.width <= a.x + 1 ||
  a.y + a.height <= b.y + 1 ||
  b.y + b.height <= a.y + 1;

test("overflow menus navigate and close; direct tools keep stable faces", async ({
  page,
}) => {
  await open(page);
  for (const menu of ["view", "display"]) {
    const arrow = page.locator(`#${menu}-menu-button`),
      popup = page.locator(
        menu === "display" ? "#display-options" : `#${menu}-menu`,
      );
    await arrow.click();
    await expect(popup).toBeVisible();
    await page.keyboard.press("End");
    await expect(
      popup.locator('[role^="menuitem"]:visible').last(),
    ).toBeFocused();
    await page.keyboard.press("Home");
    await expect(
      popup.locator('[role^="menuitem"]:visible').first(),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      popup.locator('[role^="menuitem"]:visible').nth(1),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(arrow).toBeFocused();
    await arrow.click();
    await page.locator(".brand").click();
    await expect(popup).toBeHidden();
  }
  await page.locator("#view-mode-toggle").click();
  await expect(page.locator("#view-mode-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await page.waitForFunction(
    () => window.__reviewDiagnostics?.().viewer.meshes > 0,
  );
  // No remembered last-action face: reset view/fit remain directly available.
  await expect(page.locator("#view-mode-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator('.toolbar [data-command="home"]')).toBeVisible();
  await page.locator("#view-mode-toggle").click();
  await expect(page.locator('[data-mode="pan"]')).toHaveClass(/active/);
  await choose(page, "mark", '[data-mode="fill"]');
  await expect(page.locator("#fill-control")).toBeVisible();
  await choose(page, "inspect", "#section-toggle");
  await expect(page.locator("#section-options")).toBeVisible();
  await expect(
    page.locator('[data-command="navigation-projection"]'),
  ).toHaveCount(1);
  await choose(page, "view", "#navigation-projection");
  await expect
    .poll(() =>
      page.evaluate(() => window.__navigationDiagnostics().projection),
    )
    .toBe("orthographic");
});

test("settings persist, Parts hides hand-over and hints can be restored", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("#version-tabs")).toBeHidden();
  await expect(page.locator("#sidebar-parts")).toBeVisible();
  await expect(page.locator(".tool-hint-box")).toBeVisible();
  await page.locator("#dismiss-tool-hint").click();
  await choose(page, "mark", '[data-mode="label"]');
  await expect(page.locator(".tool-hint-box")).toBeVisible();
  await choose(page, "view", '[data-mode="orbit"]');
  await choose(page, "mark", '[data-mode="label"]');
  await expect(page.locator(".tool-hint-box")).toBeHidden();
  await settings(page);
  await expect(page.locator("#setting-parts")).toHaveCount(0);
  await page.locator("#setting-viewCube").uncheck();
  await page.locator("#setting-performance").check();
  await page.locator("#reset-tool-hints").click();
  await page.locator("#settings-features summary").click();
  await expect(page.locator("#settings-features dl")).toContainText("Ctrl/⌘+Z");
  await closeSettings(page);
  await expect(page.locator(".tool-hint-box")).toBeVisible();
  await expect(page.locator(".orient")).toBeHidden();
  await expect(page.locator("#perf-panel")).toBeVisible();
  await expect(page.locator("#perf-details")).toBeHidden();
  await page.locator("#perf-summary").click();
  await expect(page.locator("#perf-copy")).toBeVisible();
  await page.locator("#view-menu-button").click();
  await expect(page.locator("#perf-panel")).toBeHidden();
  await expect(page.locator(".tool-hint-box")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#perf-panel")).toBeVisible();
  await page.locator("#sidebar-parts").click();
  await expect(page.locator("#parts-panel")).toBeVisible();
  await expect(page.locator("#parts-close")).toHaveCount(0);
  const disabled = await page.locator("#submit-feedback").isDisabled();
  await page.locator("#toggle-annotations").click();
  await expect(page.locator("#submit-feedback")).toBeHidden();
  expect(await page.locator("#submit-feedback").isDisabled()).toBe(disabled);
  await page.reload();
  await page.waitForFunction(
    () => window.__reviewDiagnostics?.().viewer.meshes > 0,
  );
  await expect(page.locator(".annotations-panel")).toHaveClass(/collapsed/);
  await expect(page.locator(".orient")).toBeHidden();
  await expect(page.locator("#perf-panel")).toBeVisible();
});

/* This continues the case above from the state its reload proved persistent.
   As one case it was some sixty interactions, many of them over a modal
   dialog whose blurred backdrop sits on a canvas still drawing every frame:
   about 15 s here, about 55 s on a software-rendered CI runner, where the
   first test to pass that line timed out with nothing wrong. Starting from
   the stored preferences keeps every step and leaves each half its own
   minute instead of raising the limit for both. */
test("the sidebar strip expands Marks to submit and settings switch back off", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    for (const [id, value] of Object.entries({
      parts: true,
      viewCube: false,
      performance: true,
      sidebarCollapsed: true,
    }))
      localStorage.setItem(`meshcue.settings.${id}`, JSON.stringify(value));
  });
  await page.reload();
  await page.waitForFunction(
    () => window.__reviewDiagnostics?.().viewer.meshes > 0,
  );
  await expect(page.locator(".annotations-panel")).toHaveClass(/collapsed/);
  await expect(page.locator(".orient")).toBeHidden();
  await expect(page.locator("#perf-panel")).toBeVisible();
  await page.locator("#sidebar-marks").click();
  await expect(page.locator("#annotations-list")).toBeVisible();
  // Folding hides hand-over; expanding Marks restores the same guarded button.
  await choose(page, "mark", '[data-mode="label"]');
  const canvas = await page.locator("#viewer").boundingBox();
  await page.mouse.click(
    canvas.x + canvas.width * 0.55,
    canvas.y + canvas.height * 0.45,
  );
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await expect(page.locator("#submit-feedback")).toBeEnabled();
  await page.locator("#toggle-annotations").click();
  await expect(page.locator("#submit-feedback")).toBeHidden();
  await page.locator("#sidebar-marks").click();
  await expect(page.getByRole("button", { name: /Send to/ })).toBeEnabled();
  await page.locator("#submit-feedback").click();
  await expect(page.locator("#feedback-line")).toContainText("Marks sent");
  await page.locator("#sidebar-marks").click();
  await settings(page);
  await expect(page.locator("#setting-parts")).toHaveCount(0);
  await page.locator("#setting-performance").uncheck();
  await page.locator("#setting-viewCube").check();
  await closeSettings(page);
  await expect(page.locator("#sidebar-parts")).toBeVisible();
  await expect(page.locator("#perf-panel")).toHaveCount(0);
  await expect(page.locator(".orient")).toBeVisible();
  await settings(page);
  await page.locator("#theme-choice").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#locale-choice").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("single-version tabs stay hidden and earlier-version banners survive multiple versions", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("#version-tabs")).toBeHidden();
  const first = await page.evaluate(
    () => window.__reviewDiagnostics().versionId,
  );
  fs.copyFileSync(
    "tmp/samples/bunny-figurine.glb",
    path.join(environment.workspace, "bunny.glb"),
  );
  await environment.ipc("/publish", {
    file: "bunny.glb",
    name: "Second model",
    version: "v2",
  });
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await page.locator(`[data-version-id="${first}"]`).click();
  await expect(page.locator("#pending-banner")).toBeVisible();
  await page.locator("#go-latest").click();
  await expect(page.locator("#pending-banner")).toBeHidden();
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.screenshot({
      path: `tmp/b1u-s/evidence/after-${theme}-versions.png`,
    });
  }
});

for (const theme of ["light", "dark"]) {
  test(`capture shell states in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    fs.mkdirSync("tmp/b1u-s/evidence", { recursive: true });
    const shot = (name) =>
      page.screenshot({
        path: `tmp/b1u-s/evidence/after-${theme}-${name}.png`,
      });
    await shot("overview");
    await page.locator("#dismiss-tool-hint").click();
    await shot("hints-dismissed");
    await settings(page);
    await page.locator("#reset-tool-hints").click();
    await closeSettings(page);
    await shot("hints-restored");
    for (const menu of ["view", "display"]) {
      await page.locator(`#${menu}-menu-button`).click();
      await shot(`${menu}-menu`);
      await page.keyboard.press("Escape");
    }
    await settings(page);
    await expect(page.locator("#setting-parts")).toHaveCount(0);
    await page.locator("#setting-performance").check();
    await shot("settings");
    await closeSettings(page);
    await page.locator("#sidebar-parts").click();
    await shot("parts");
    await page.locator("#perf-summary").click();
    await shot("performance");
    const before = await page.locator("#perf-panel").boundingBox();
    const grip = await page.locator("#perf-summary").boundingBox();
    await page.mouse.move(grip.x + 30, grip.y + 20);
    await page.mouse.down();
    await page.mouse.move(grip.x - 100, grip.y - 100, { steps: 6 });
    await page.mouse.up();
    const after = await page.locator("#perf-panel").boundingBox();
    expect(after.x).toBeLessThan(before.x);
    expect(noOverlap(after, await page.locator(".toolbar").boundingBox())).toBe(
      true,
    );
    await page.locator("#toggle-annotations").click();
    await shot("collapsed");
  });
}

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [390, 844],
  [768, 1024],
]) {
  test.describe(`viewport ${width}`, () => {
    test.use({ hasTouch: width <= 768, isMobile: width === 390 });
    for (const locale of ["de", "fr"]) {
      for (const theme of ["light", "dark"]) {
        test(`layout ${width}x${height} ${locale} ${theme}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ colorScheme: theme });
          await page.addInitScript(
            ({ locale }) => {
              localStorage.setItem("meshcue-locale", locale);
              localStorage.setItem("meshcue.settings.parts", "true");
            },
            { locale },
          );
          await open(page);
          if (width === 390) {
            await choose(page, "mark", '[data-mode="label"]');
            const canvas = await page.locator("#viewer").boundingBox();
            await page.mouse.click(
              canvas.x + canvas.width * 0.55,
              canvas.y + canvas.height * 0.45,
            );
            await expect(page.locator("#annotation-count")).toHaveText("1");
            await expect(page.locator("#mark-note")).toBeVisible();
          }
          const toolbar = await page.locator(".toolbar").boundingBox();
          const cube = await page.locator(".orient").boundingBox();
          expect(noOverlap(toolbar, cube)).toBe(true);
          expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(height);
          const controls = await page
            .locator(
              '.toolbar .toolbar-group, .toolbar [data-toolbar-slot="history"], .toolbar [data-toolbar-slot="reset"]',
            )
            .evaluateAll((els) =>
              els.map((el) => {
                const b = el.getBoundingClientRect();
                return { x: b.x, y: b.y, width: b.width, height: b.height };
              }),
            );
          expect(controls).toHaveLength(6);
          for (const button of await page
            .locator(".toolbar button:visible")
            .all()) {
            const box = await button.boundingBox();
            expect(box.width).toBeGreaterThanOrEqual(width <= 760 ? 44 : 32);
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
          for (let i = 0; i < controls.length; i++) {
            expect(controls[i].x).toBeGreaterThanOrEqual(0);
            expect(controls[i].x + controls[i].width).toBeLessThanOrEqual(
              width,
            );
            if (width > 760)
              expect(Math.abs(controls[i].y - controls[0].y)).toBeLessThan(2);
            if (i) expect(noOverlap(controls[i - 1], controls[i])).toBe(true);
          }
          await page.locator("#view-menu-button").click();
          const menu = await page.locator("#view-menu").boundingBox();
          expect(menu.x).toBeGreaterThanOrEqual(0);
          expect(menu.y).toBeGreaterThanOrEqual(0);
          expect(menu.x + menu.width).toBeLessThanOrEqual(width);
          expect(menu.y + menu.height).toBeLessThanOrEqual(height);
          expect(noOverlap(menu, toolbar)).toBe(true);
          await page.keyboard.press("Escape");
          if (width === 390) {
            await page.locator("#section-toggle").tap();
          } else await choose(page, "inspect", "#section-toggle");
          await expect(page.locator("#section-options")).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(() => window.__navigationDiagnostics().projection),
            )
            .toBe("perspective");
          await page.screenshot({
            path: `tmp/b1u-s/evidence/layout-${width}-${locale}-${theme}.png`,
          });
        });
      }
    }
  });
}
