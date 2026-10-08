import { clickControl } from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import fs from "node:fs";
import { scenarioKit } from "../scenarios/kit.mjs";

const evidence = "tmp/b1-fix/evidence";
let environment, kit;
test.afterEach(async () => environment?.stop());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics?.());
async function open(page) {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST,
  });
  kit = scenarioKit(page, environment);
  await kit.open(environment.url);
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
      // r5 makes model axes optional and hidden by default. Enable them as a
      // reader would, then retain the original Section/axes clearance checks.
      await expect(page.locator(".navigation-triad")).toBeHidden();
      await page.locator("#settings-button").tap();
      await page.locator("#setting-axes").check();
      await page.locator("#close-settings").tap();
      await expect(page.locator(".navigation-triad")).toBeVisible();
      await screenshot(page, `bug1-${locale}-toolbar`);
      for (const button of await page
        .locator(".toolbar button:visible")
        .all()) {
        expect
          .soft(await unobscured(button), await button.getAttribute("id"))
          .toBe(true);
      }
      await clickControl(page, "#section-toggle", "tap");
      // Touch reveals the cube controls with a real tap, not a forced click
      // or a CSS class injected by the test. Section must leave every target
      // reachable once this optional affordance is open.
      await page.locator(".orient-stage").tap();
      await screenshot(page, `bug1-${locale}-section`);
      for (const control of await page
        .locator(".navigation-arrow, .navigation-roll")
        .all()) {
        await expect(control).toBeVisible();
        expect.soft(await unobscured(control)).toBe(true);
      }
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
      await clickControl(page, '[data-mode="measure"]', "tap");
      await page.locator("#measure-advanced summary").tap();
      // A full-width measurement strip must also leave its own controls and
      // both toolbar rows tappable, including the longest German captions.
      for (const control of await page
        .locator(
          "#measure-options button, #measure-advanced summary, .toolbar button:visible",
        )
        .all()) {
        await expect(control).toBeVisible();
        expect.soft(await unobscured(control)).toBe(true);
      }
      await screenshot(page, `bug1-${locale}-measure-expanded`);
      await page.locator("#measure-advanced summary").tap();
      await clickControl(page, "#display-toggle", "tap");
      await expect(page.locator("#display-menu")).toBeVisible();
      await clickControl(page, "#display-toggle", "tap");
      await clickControl(page, '[data-command="parts-panel"]', "tap");
      await expect(page.locator("#parts-panel")).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

async function addPin(page) {
  await clickControl(page, '[data-mode="label"]');
  const count = (await diag(page)).annotationCount;
  // Project a solid point on the plate, independent of panel-aware framing.
  await kit.clickModelPoint([-0.35 + count * 0.05, 0, 0.2]);
  await expect(page.locator("#annotation-count")).toHaveText(String(count + 1));
}

test("Bug 2: phone empty guidance and selected mark actions fit beside the note", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await open(page);
  await screenshot(page, "bug2-empty");
  expect.soft(await unobscured(page.locator(".annotation-empty"))).toBe(true);
  await addPin(page);
  await screenshot(page, "bug2-selected");
  for (const selector of [
    ".annotation-row.selected",
    ".annotation-row.selected .annotation-select",
    ".annotation-row.selected .delete-annotation",
    "#mark-note-text",
  ]) {
    expect.soft(await unobscured(page.locator(selector)), selector).toBe(true);
  }
  for (const button of await page
    .locator(".annotation-row.selected .annotation-action")
    .all())
    expect.soft(await unobscured(button)).toBe(true);
  await page.locator("#mark-note-text").fill("Keep this note visible");
  await expect(page.locator("#mark-note-text")).toHaveValue(
    "Keep this note visible",
  );
});

for (const locale of ["en", "zh-Hans", "zh-Hant", "ja", "de", "fr"]) {
  for (const theme of ["light", "dark"]) {
    test(`Bug 3: mark names, notes and actions do not overlap (${locale}, ${theme})`, async ({
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
      await addPin(page);
      await page
        .locator("#mark-note-text")
        .fill("Keep the highlighted mounting surface");
      await page.locator("#mark-note-text").blur();
      for (const [width, height] of [
        [1024, 768],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await screenshot(page, `bug3-${locale}-${theme}-${width}`);
        const layout = await page
          .locator(".annotation-row.selected")
          .evaluate((row) => {
            const text = row.querySelector(
              ".annotation-select > span:last-child",
            );
            const rect = text.getBoundingClientRect();
            const badge = row
              .querySelector(".annotation-badge")
              .getBoundingClientRect();
            const separate = [
              ...row.querySelectorAll(".annotation-action, .delete-annotation"),
            ].every((button) => {
              const r = button.getBoundingClientRect();
              return [rect, badge].every(
                (b) =>
                  r.left >= b.right ||
                  r.right <= b.left ||
                  r.top >= b.bottom ||
                  r.bottom <= b.top,
              );
            });
            return { width: rect.width, separate };
          });
        expect.soft(layout.width).toBeGreaterThanOrEqual(75);
        expect.soft(layout.separate).toBe(true);
      }
    });
  }
}

async function publish(page, fixture, version) {
  const file = fixture.split("/").at(-1);
  fs.copyFileSync(fixture, `${environment.workspace}/${file}`);
  const result = await environment.ipc("/publish", {
    file,
    name: "Version regression",
    version,
  });
  await expect
    .poll(async () => (await diag(page))?.versionId)
    .toBe(result.model.id);
  return result.model.id;
}

test("Bug 4: reload preserves the chosen older version and a newly active version takes over", async ({
  page,
}) => {
  await open(page);
  const first = (await diag(page))?.versionId;
  const second = await publish(page, "tmp/samples/bunny-figurine.glb", "v2");
  await page.locator(`.version-tab[data-version-id="${first}"]`).click();
  await expect.poll(async () => (await diag(page))?.versionId).toBe(first);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect.poll(async () => (await diag(page))?.versionId).toBe(first);
  const third = await publish(page, "tmp/samples/occlusion-check.glb", "v3");
  await page.reload();
  await expect.poll(async () => (await diag(page))?.versionId).toBe(third);
  // A deleted/stale browser choice must fall back to the active model.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("meshcue-view-"),
    );
    const saved = JSON.parse(localStorage.getItem(key));
    saved.viewingId = "missing-version";
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await expect.poll(async () => (await diag(page))?.versionId).toBe(third);
  // A new active model while the page is closed also outranks the saved choice.
  await page.locator(`.version-tab[data-version-id="${second}"]`).click();
  await expect.poll(async () => (await diag(page))?.versionId).toBe(second);
  await page.goto("about:blank");
  await environment.ipc("/activate", { versionId: first });
  await page.goto(environment.url);
  await expect.poll(async () => (await diag(page))?.versionId).toBe(first);
});

const continuedMarking = {
  en: "You can keep marking this version.",
  "zh-Hans": "您可以继续标记此版本。",
  "zh-Hant": "您可以繼續標記此版本。",
  de: "Sie können diese Version weiter markieren.",
  fr: "Vous pouvez continuer à annoter cette version.",
  ja: "このバージョンへのマーキングは続けられます。",
};
for (const [locale, message] of Object.entries(continuedMarking)) {
  test(`Bug 6: submitted toast agrees that marking remains available (${locale})`, async ({
    page,
  }) => {
    await page.addInitScript(
      (locale) => localStorage.setItem("meshcue-locale", locale),
      locale,
    );
    await open(page);
    await addPin(page);
    await page.locator("#submit-feedback").click();
    await expect(page.locator("#toast")).toBeVisible();
    await expect(page.locator("#toast")).toContainText(message, {
      timeout: 1500,
    });
    await expect(page.locator('[data-mode="label"]')).toBeEnabled();
    await expect(page.locator("#mark-note-text")).toBeEditable();
    await page.locator("#mark-note-text").fill("Still editable after sending");
    await expect
      .poll(async () => (await diag(page)).annotations[0].note)
      .toBe("Still editable after sending");
  });
}
