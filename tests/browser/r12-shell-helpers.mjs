// Actions follow the approved r4–r11 shell without changing command contracts.
import {
  clickControl as legacyClick,
  selectSetting,
  showParts,
} from "./b1u-shell-helpers.mjs";
export { selectSetting, showParts };
export async function revealControl(page, selector) {
  if (selector === "#neutral-view")
    selector = '#display-menu [role="menuitemcheckbox"]';
  const control = page.locator(selector);
  if (await control.isVisible()) return;
  if (
    selector.includes('data-mode="label"') ||
    selector.includes('data-mode="orbit"') ||
    selector.includes('data-mode="pan"')
  ) {
    await page
      .locator(
        selector.includes("label") ? "#mark-mode-toggle" : "#view-mode-toggle",
      )
      .click();
  } else if (selector === '#display-menu [role="menuitemcheckbox"]') {
    await page.locator("#display-toggle").click();
  } else {
    const menu = await control.evaluate((el) => el.closest(".shell-menu")?.id);
    if (menu) await page.locator(`[aria-controls="${menu}"]`).click();
  }
}
export async function clickControl(page, selector, method = "click") {
  if (selector === "#navigation-projection") {
    const current = await page.evaluate(
      () => window.__navigationDiagnostics().projection,
    );
    await page.locator(selector)[method]();
    await page
      .locator(
        `[data-command="navigation-projection-${current === "perspective" ? "orthographic" : "perspective"}"]`,
      )
      .click();
    return;
  }
  if (
    selector === "#perf-toggle" ||
    selector.includes('data-command="parts-panel"')
  )
    return legacyClick(page, selector, method);
  await revealControl(page, selector);
  await page
    .locator(
      selector === "#neutral-view"
        ? '#display-menu [role="menuitemcheckbox"]'
        : selector,
    )
    [method]();
}
