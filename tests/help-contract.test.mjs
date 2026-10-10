import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const expected = {
  en: [
    "currently visible",
    "without deleting",
    "confirmation",
    "in the conversation",
  ],
  de: [
    "aktuell sichtbaren",
    "ohne ihre Daten zu löschen",
    "Bestätigung",
    "im Gespräch",
  ],
  fr: [
    "actuellement visibles",
    "sans supprimer",
    "confirmation",
    "dans la conversation",
  ],
  ja: ["現在表示対象", "データは削除されず", "確認を待って", "会話で渡します"],
  "zh-Hans": ["当前可见", "不会删除数据", "等你确认后", "在对话里交付"],
  "zh-Hant": ["目前可見", "不會刪除資料", "等你確認後", "在對話裡交付"],
};
for (const [lang, [visible, retained, confirm, delivery]] of Object.entries(
  expected,
)) {
  test(`${lang} reviewer help preserves visible versions, confirmation and STEP delivery`, async () => {
    const { default: help } = await import(`../src/i18n/${lang}/help.js`);
    for (const suffix of ["", ".named"]) {
      for (const n of [6, 8])
        assert.ok(help[`help.p${n}${suffix}`].includes(confirm));
      assert.ok(help[`help.p7${suffix}`].includes(visible));
      assert.ok(help[`help.p7${suffix}`].includes(retained));
      if (suffix)
        for (const n of [6, 7, 8])
          assert.ok(help[`help.p${n}${suffix}`].includes("{agent}"));
    }
    assert.ok(help["help.p9"].includes(delivery));
    assert.ok(help["help.p9"].includes("80 MiB"));
    assert.doesNotMatch(help["help.p9"], /80 (MB|Mo)/);
  });
}
test("simplification disclosure and no-batch confirmation remain explicit", () => {
  for (const file of ["skills/meshcue-review/SKILL.md", "AGENT-INTERFACE.md"]) {
    const body = fs.readFileSync(file, "utf8");
    assert.match(body, /before\/after face counts/);
    assert.match(body, /ratio used/);
    assert.match(body, /unknown/);
    assert.match(body, /do not call `echo` or invent a `submissionId`/);
    assert.doesNotMatch(body, /Known older help wording conflicts/);
  }
});
