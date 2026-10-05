import test from "node:test";
import assert from "node:assert/strict";
import { mergeCatalogueFeatures } from "../src/i18n/merge.js";
import { loadFeatures } from "../src/i18n/node-features.js";
import { CATALOGUES, LOCALES } from "../src/i18n/index.js";

test("feature keys merge flat and collisions fail even when the words agree", () => {
  assert.deepEqual(
    mergeCatalogueFeatures({
      "./en/core.js": { a: "A" },
      "./en/new.js": { b: "B" },
    }),
    { en: { a: "A", b: "B" } },
  );
  assert.throws(
    () =>
      mergeCatalogueFeatures({
        "./en/core.js": { a: "A" },
        "./en/new.js": { a: "A" },
      }),
    /Duplicate i18n key en:a/,
  );
});
test("Node discovers the same complete catalogues consumed by documentation", async () => {
  assert.deepEqual(mergeCatalogueFeatures(await loadFeatures()), CATALOGUES);
  assert.equal(Object.keys(CATALOGUES).length, 6);
  assert.deepEqual(LOCALES, ["en", "zh-Hans", "zh-Hant", "de", "fr", "ja"]);
  assert.equal(Object.keys(CATALOGUES.en).length, 335);
});
