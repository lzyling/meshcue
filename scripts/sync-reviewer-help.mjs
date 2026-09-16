#!/usr/bin/env node
/* The reviewer reads the help panel; the agent reads AGENT-INTERFACE.md. Both
 * need the same facts -- that the bucket crosses a connected surface while the
 * brush does not, that marks never enter the model file -- and an agent that
 * learned them from a second, hand-written copy would eventually answer a
 * question differently from the page the person is looking at.
 *
 * So there is one source and it is the interface catalogue, not the document:
 * the panel is the only place these sentences are translated into six
 * languages, and a document cannot be the origin of a translation. This writes
 * the English catalogue into the document verbatim; tests/docs.test.mjs fails
 * the build when the two drift.
 *
 * Run `node scripts/sync-reviewer-help.mjs` to update, `--check` to verify.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const doc = path.join(repo, "AGENT-INTERFACE.md");

export const BEGIN =
  "<!-- reviewer-help:begin -- generated from src/i18n/en.js by scripts/sync-reviewer-help.mjs -->";
export const END = "<!-- reviewer-help:end -->";

const wrap = (text, width = 78) => {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
};

export async function render() {
  const en = (
    await import(pathToFileURL(path.join(repo, "src/i18n/en.js")).href)
  ).default;
  const paragraphs = Object.keys(en)
    .filter((key) => /^help\.p\d+$/.test(key))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
    .map((key) => en[key]);
  if (!paragraphs.length) throw new Error("no help.p* keys in src/i18n/en.js");
  return [
    BEGIN,
    "",
    wrap(
      `These are the words the reviewer is reading in the help panel, in the ` +
        `catalogue's own English. Answer from them rather than from memory: a ` +
        `tool that promises addresses instead of descriptions cannot afford to ` +
        `guess at its own controls. "${en["help.title"]}"`,
    ),
    "",
    ...paragraphs.flatMap((text) => [
      wrap(`- ${text}`).replace(/\n/g, "\n  "),
      "",
    ]),
    END,
  ].join("\n");
}

const replace = (source, block) => {
  const from = source.indexOf(BEGIN);
  const to = source.indexOf(END);
  if (from === -1 || to === -1)
    throw new Error(`AGENT-INTERFACE.md has no reviewer-help markers`);
  return source.slice(0, from) + block + source.slice(to + END.length);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const current = readFileSync(doc, "utf8");
  const next = replace(current, await render());
  if (process.argv.includes("--check")) {
    if (next !== current) {
      process.stderr.write(
        "AGENT-INTERFACE.md is behind src/i18n/en.js.\n" +
          "Run: node scripts/sync-reviewer-help.mjs\n",
      );
      process.exit(1);
    }
    process.stdout.write("reviewer help is in sync\n");
  } else {
    writeFileSync(doc, next);
    process.stdout.write("AGENT-INTERFACE.md updated from src/i18n/en.js\n");
  }
}
