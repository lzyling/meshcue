import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";

let environment;
test.beforeEach(async () => {
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
  });
});
test.afterEach(async () => environment?.stop());

test("registered shortcuts respect typing and modal focus and retain undo, redo and Escape", async ({
  page,
}) => {
  const kit = scenarioKit(page, environment);
  await kit.open(environment.url);
  await page.locator('[data-mode="label"]').click();
  const box = await page.locator("#viewer").boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  const count = () =>
    page.evaluate(() => window.__reviewDiagnostics().annotationCount);
  await expect.poll(count).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().dirty))
    .toBe(false);
  await page.evaluate(() => {
    const editable = document.createElement("div");
    editable.id = "shortcut-editable";
    editable.contentEditable = "true";
    editable.textContent = "Typing here must not undo a mark";
    document.body.append(editable);
  });
  for (const selector of [
    "#mark-note-text",
    "#section-offset",
    "#theme-choice",
    "#shortcut-editable",
  ]) {
    // The section number input is hidden until its viewing aid is enabled.
    if (selector === "#section-offset")
      await page.locator("#section-toggle").click();
    /* Focus only lands on what is shown. The note box appears once the new
       mark is selected, and on a slower runner that can come after the click
       returns: focusing it early left focus on a toolbar button, where Ctrl+Z
       rightly undoes, and the test blamed the shortcut. Wait for the field,
       and prove it holds focus, before pressing the key. */
    await expect(page.locator(selector)).toBeVisible();
    await page.locator(selector).focus();
    await expect(page.locator(selector)).toBeFocused();
    await kit.key("Control+z");
    expect(await count()).toBe(1);
  }
  await page.locator("#help-button").click();
  await kit.key("Meta+z");
  expect(await count()).toBe(1);
  await kit.key("Escape");
  await expect(page.locator("#help-dialog")).not.toBeVisible();
  await page.locator('[data-mode="orbit"]').click();
  await kit.key("Control+z");
  await expect.poll(count).toBe(0);
  await kit.key("Meta+Shift+z");
  await expect.poll(count).toBe(1);
  await page.locator(".annotation-action.edit-action").click();
  await page.locator("#shortcut-editable").focus();
  await kit.key("Escape");
  await expect(page.locator('[data-mode="orbit"]')).not.toHaveClass(/active/);
  await page.evaluate(() => document.activeElement.blur());
  await kit.key("Escape");
  await expect(page.locator('[data-mode="orbit"]')).toHaveClass(/active/);
});
