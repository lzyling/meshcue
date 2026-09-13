import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, systemTheme, resolveTheme, applyTheme } from "../src/theme.js";

const dark = { matches: true },
  light = { matches: false };

test("with no choice made, the system decides", () => {
  assert.equal(resolveTheme("system", dark), "dark");
  assert.equal(resolveTheme("system", light), "light");
  assert.equal(systemTheme(undefined), "light");
});

test("a choice overrules the system in both directions", () => {
  // The direction that could not be expressed before: a dark system and a
  // reviewer who wants light. A media query has no answer to that.
  assert.equal(resolveTheme("light", dark), "light");
  assert.equal(resolveTheme("dark", light), "dark");
});

test("anything unrecognised falls back to the system rather than to a guess", () => {
  for (const junk of ["", null, undefined, "solarized", "SYSTEM"])
    assert.equal(resolveTheme(junk, dark), "dark");
});

test("applying writes a resolved theme, never the word system", () => {
  const root = { dataset: {} };
  assert.equal(applyTheme("system", dark, root), "dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(applyTheme("light", dark, root), "light");
  assert.equal(root.dataset.theme, "light");
  assert.ok(
    !THEMES.includes(root.dataset.theme) || root.dataset.theme !== "system",
  );
});
