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
// `ta`/`TA` read a sentence about the Agent: `key`, or `key.named` once the
// page knows the Agent's name. Asking for one is asking for both.
const AGENT_CALL = /\b(?:ta|TA)\(\s*"([^"]+)"/g;
// Being asked for is looser than being called directly: keys also arrive
// through a ternary or a lookup table (`colorKeys`, `CUBE_KEYS`), and a
// catalogue entry reachable that way is not dead.
const LITERAL = /"([\w.]+)"/g;
const called = new Set(),
  agentCalled = new Set(),
  mentioned = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(CALL)) called.add(m[1]);
  for (const m of text.matchAll(AGENT_CALL)) agentCalled.add(m[1]);
  for (const m of text.matchAll(LITERAL)) mentioned.add(m[1]);
}
const NAMED = ".named";
const unknown = [...called, ...agentCalled].filter((k) => !(k in en));
if (unknown.length) fail("call sites using unknown keys", unknown.join(", "));
const unused = Object.keys(en).filter((k) =>
  k.endsWith(NAMED)
    ? !mentioned.has(k.slice(0, -NAMED.length))
    : !mentioned.has(k),
);
if (unused.length) fail("catalogue keys nothing calls", unused.join(", "));

/* 6 · The page calls the Agent by the name it gave, and says "the Agent" in
   its own words only when it has none. So every sentence that speaks of an
   agent has a twin, `key.named`, with the name in it as {agent}; the plain
   `key` never has the slot, because it is what is shown when there is no name
   to put there. A sentence about the Agent read with `t` would keep saying
   "the Agent" to a reviewer who knows it as 爆爆, so those go through `ta`.
   (Written here in the English source: a twin is how every language gets one,
   and the key check above holds the others to the same set.) */
for (const key of Object.keys(en)) {
  if (key.endsWith(NAMED)) {
    const base = key.slice(0, -NAMED.length);
    if (!(base in en)) fail(`${key} has no sentence to stand in for`, "");
    if (!slots(en[key]).includes("agent"))
      fail(`${key} does not put the name in`, "it needs {agent}");
    if ([...called].includes(base))
      fail(
        `${base} is read without the Agent's name`,
        "read it with ta() or TA(), which choose the named sentence",
      );
    continue;
  }
  if (slots(en[key]).includes("agent"))
    fail(`${key} has {agent} but is shown when there is no name`, "");
  if (/\bagents?\b/i.test(en[key]) && !(`${key}${NAMED}` in en))
    fail(
      `${key} speaks of the Agent without a named twin`,
      `add "${key}${NAMED}" with {agent} where the name goes`,
    );
}
/* A name takes no article and no case ending, which is the reason the named
   sentences were written afresh instead of filled in. Two ways a translator
   could slip back: an article left in front of the name ("den {agent}"), and in
   French "de"/"que" before it, which a name beginning with a vowel turns into
   d'/qu' — "ce que OpenClaw a compris" is wrong where "ce qu'a compris
   OpenClaw" is not. German spells its relative pronouns like its articles,
   and a relative clause always follows a comma ("Die Markierungen, die
   {agent} erhält"), so a word straight after one is not taken for an article. */
const BEFORE_A_NAME = {
  en: /\b(the|a|an|your) \{agent\}/i,
  de: /(?<!, )\b(der|den|dem|des|die|das|ein|einen|einem|eines|ihr|ihren|ihrem|ihres) \{agent\}/i,
  fr: /\b(le|la|les|l'|du|de|des|que|votre) ?\{agent\}/i,
};
for (const [locale, pattern] of Object.entries(BEFORE_A_NAME)) {
  const table = locale === SOURCE_LOCALE ? en : await load(`${locale}.js`);
  for (const key of Object.keys(table))
    if (key.endsWith(NAMED) && pattern.test(table[key]))
      fail(
        `${locale}: ${key} treats the name as a noun`,
        String(table[key]).match(pattern)[0],
      );
}

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

/* 5 · A region is saved under the name the page gives it, in the reviewer's
   language, and the service holds that name to a length. Twelve characters
   fitted every name but German and French purple, so those reviewers met a
   failed save and nothing on the page said why. Every name is checked here
   against the service's own limit. The colours are the page's palette in
   `src/main.js`; a `color.*` key this list does not know fails, so a sixth
   colour cannot arrive without being measured. */
const { MAX_REGION_LABEL } = await import(
  pathToFileURL(path.join(repo, "server", "budget.mjs")).href
);
const REGION_COLOURS = ["red", "yellow", "green", "blue", "purple"];
const unmeasured = Object.keys(en).filter(
  (k) =>
    k.startsWith("color.") &&
    k !== "color.choose" &&
    !REGION_COLOURS.includes(k.slice(6)),
);
if (unmeasured.length)
  fail("colours with no region-name check", unmeasured.join(", "));
for (const locale of LOCALES) {
  const table = locale === SOURCE_LOCALE ? en : await load(`${locale}.js`);
  for (const colour of REGION_COLOURS) {
    const name = String(table["marks.regionName"]).replace(
      "{color}",
      table[`color.${colour}`],
    );
    if (name.length > MAX_REGION_LABEL)
      fail(
        `${locale}: the ${colour} region is named longer than the service keeps`,
        `"${name}" is ${name.length} characters; the limit is ${MAX_REGION_LABEL}`,
      );
  }
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
