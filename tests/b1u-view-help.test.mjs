import test from "node:test";
import assert from "node:assert/strict";

test("View help in every locale explains clearing a selection and double-click recentering", async () => {
  for (const [locale, doubleClick] of [
    ["en", /double-click/i],
    ["de", /Doppelklick/],
    ["fr", /double-clic/],
    ["ja", /ダブルクリック/],
    ["zh-Hans", /双击/],
    ["zh-Hant", /按兩下/],
  ]) {
    const { default: help } = await import(`../src/i18n/${locale}/help.js`);
    const { default: core } = await import(`../src/i18n/${locale}/core.js`);
    assert.match(help["help.p1"], /Esc/, locale);
    assert.match(core["hint.orbit"], doubleClick, locale);
  }
});
