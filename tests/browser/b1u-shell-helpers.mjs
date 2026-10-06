/* Existing feature tests still exercise the same actions, through their new
   visible entry points. Keep the menu/settings opening explicit at call sites. */
export async function revealControl(page, selector) {
  if (
    selector === "#toggle-marks" &&
    !(await page.locator(selector).isVisible())
  )
    await page.locator("#sidebar-marks").click();
  const control = page.locator(selector);
  const menu = await control.evaluate((el) => el.closest(".shell-menu")?.id);
  if (menu && !(await control.isVisible()))
    await page.locator(`[aria-controls="${menu}"]`).click();
}
export async function clickControl(page, selector, method = "click") {
  if (selector === "#perf-toggle") {
    await page.locator("#settings-button").click();
    const checkbox = page.locator("#setting-performance");
    const enabling = !(await checkbox.isChecked());
    await checkbox.click();
    await page.locator("#close-settings").click();
    if (enabling) await page.locator("#perf-summary").click();
    return;
  }
  if (
    selector === "#display-toggle" &&
    (await page.locator("#display-menu").isVisible())
  ) {
    await page.keyboard.press("Escape");
    return;
  }
  if (selector.includes('data-command="parts-panel"'))
    return page.locator("#sidebar-parts")[method]();
  await revealControl(page, selector);
  await page.locator(selector)[method]();
}
export async function selectSetting(page, selector, value) {
  await page.locator("#settings-button").click();
  await page.locator(selector).selectOption(value);
  if (selector !== "#locale-choice")
    await page.locator("#close-settings").click();
}
export async function showParts(page) {
  await page.locator("#sidebar-parts").click();
}
