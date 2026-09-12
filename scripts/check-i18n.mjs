#!/usr/bin/env node
/* Interface text is the one kind of change an eye cannot check. A wrong colour
 * is obvious; one string in a hundred and seventy that never made it into the
 * catalogue is not, and it only shows itself to the reader whose language it
 * was missing from. So the build checks it instead, and refuses to produce a
 * bundle with a hole in it.
 *
 * Run by `npm run build` and by `npm test`.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const srcDir = path.join(repo, "src");
const i18nDir = path.join(srcDir, "i18n");

const load = async (file) =>
  (await import(pathToFileURL(path.join(i18nDir, file)).href)).default;

const en = await load("en.js");
const { LOCALES, SOURCE_LOCALE } = await import(
  pathToFileURL(path.join(i18nDir, "index.js")).href
);

const problems = [];
const fail = (what, detail) => problems.push({ what, detail });

/* 1 · Every catalogue answers exactly the same questions. A missing key falls
   back to English, which reads as a bug in the product rather than a gap in a
   translation; an extra key is text nobody will ever see. */
const PLACEHOLDER = /\{(\w+)\}/g;
const slots = (text) =>
  [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

/* An empty translation is normally a hole. Not here: what goes between the
   sides of a compass direction is a hyphen in English and nothing at all in
   Chinese and Japanese, where 前頂右 is simply how it is written. */
const MAY_BE_EMPTY = new Set(["cube.sideJoin"]);

for (const locale of LOCALES) {
  if (locale === SOURCE_LOCALE) continue;
  const table = await load(`${locale}.js`);
  const missing = Object.keys(en).filter((k) => !(k in table));
  const extra = Object.keys(table).filter((k) => !(k in en));
  if (missing.length) fail(`${locale}: keys missing`, missing.join(", "));
  if (extra.length) fail(`${locale}: keys nobody reads`, extra.join(", "));

  /* 2 · A translation that drops {count} loses the number itself, and one that
     invents {name} prints the braces to the reader. */
  for (const key of Object.keys(en)) {
    if (!(key in table)) continue;
    const want = slots(en[key]).join(","),
      got = slots(table[key]).join(",");
    if (want !== got)
      fail(
        `${locale}: ${key} placeholders`,
        `source has [${want || "none"}], translation has [${got || "none"}]`,
      );
    if (!String(table[key]).trim() && !MAY_BE_EMPTY.has(key))
      fail(`${locale}: ${key} is empty`, "");
  }
}

/* 3 · Keys are written by hand at both ends. A typo in a call site silently
   prints the key itself; a key left behind after its call site was deleted is
   text five translators maintain for nobody. */
const sources = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== i18nDir) walk(full);
    } else if (entry.name.endsWith(".js")) sources.push(full);
  }
};
walk(srcDir);

// `t` reads a string; `T` is the same lookup escaped for markup. A key given
// straight to either has to exist.
const CALL = /\b[tT]\(\s*"([^"]+)"/g;
// Being asked for is looser than being called directly: keys also arrive
// through a ternary or a lookup table (`colorKeys`, `CUBE_KEYS`), and a
// catalogue entry reachable that way is not dead.
const LITERAL = /"([\w.]+)"/g;
const called = new Set(),
  mentioned = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(CALL)) called.add(m[1]);
  for (const m of text.matchAll(LITERAL)) mentioned.add(m[1]);
}
const unknown = [...called].filter((k) => !(k in en));
if (unknown.length) fail("call sites using unknown keys", unknown.join(", "));
const unused = Object.keys(en).filter((k) => !mentioned.has(k));
if (unused.length) fail("catalogue keys nothing calls", unused.join(", "));

/* 4 · The regression this file was written for: interface text typed straight
   into the source. Any letter outside ASCII in a source file is either text
   that skipped the catalogue or a comment; comments are allowed to be prose,
   string literals are not. */
const CJK = /[　-ヿ㐀-䶿一-鿿豈-﫿]/;
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
for (const file of sources) {
  const body = stripComments(readFileSync(file, "utf8"));
  body.split("\n").forEach((line, i) => {
    if (CJK.test(line))
      fail(
        `${path.relative(repo, file)}:${i + 1} has interface text in the source`,
        line.trim().slice(0, 80),
      );
  });
}

if (problems.length) {
  console.error(`i18n check failed — ${problems.length} problem(s):\n`);
  for (const p of problems)
    console.error(`  ✗ ${p.what}${p.detail ? `\n      ${p.detail}` : ""}`);
  process.exit(1);
}
console.log(
  `i18n ok — ${Object.keys(en).length} keys × ${LOCALES.length} languages, all used, none hard-coded`,
);
