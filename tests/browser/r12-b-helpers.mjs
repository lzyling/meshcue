// Lane B's explicit entry points for the r4-r11 menus; shared lane A helper
// intentionally stays untouched during the parallel test refresh.
import {
  clickControl as legacyClick,
  revealControl as legacyReveal,
} from "./b1u-shell-helpers.mjs";
export { selectSetting, showParts } from "./b1u-shell-helpers.mjs";
export async function revealControl(page, selector) {
  if (selector === "#neutral-view") {
    if (!(await page.locator("#display-menu").isVisible()))
      await page.locator("#display-toggle").click();
    return;
  }
  await legacyReveal(page, selector);
}
export async function clickControl(page, selector, method = "click") {
  if (selector === "#neutral-view") {
    await revealControl(page, selector);
    return page.locator('#display-menu [role="menuitemcheckbox"]')[method]();
  }
  const shortcut = {
    '[data-command="parts-hide"]': "y",
    '[data-command="parts-isolate"]': "Shift+I",
    '[data-command="parts-transparent"]': "Shift+T",
  }[selector];
  if (shortcut) return page.keyboard.press(shortcut);
  return legacyClick(page, selector, method);
}
