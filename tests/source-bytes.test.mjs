import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* Twice now a NUL has been written into a source file as a raw byte instead of
 * the \0 escape — once in server/index.mjs and once in mcp/server.mjs, where it
 * separated two halves of a hash input. Node and esbuild accept it, so nothing
 * failed and nothing was reported.
 *
 * What it costs is search. `file` calls such a file binary, and grep skips
 * binary files in silence: no match, no warning, an exit status identical to
 * "that pattern is not in this repository". Both times the file went on being
 * greppable-looking while answering every question with "nothing here" — which
 * is worse than an error, because an audit that cannot say which files it
 * skipped reads exactly like one that found nothing.
 */
const DIRECTORIES = [
  "src",
  "server",
  "integration",
  "cli",
  "mcp",
  "adapters",
  "scripts",
  "tests",
  "skills",
];
const EXTENSIONS = new Set([".js", ".mjs", ".css", ".json", ".md", ".html"]);
// Tab, newline and carriage return are the ones text legitimately contains.
const ALLOWED = new Set([9, 10, 13]);

function* sources(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "tmp", ".git"].includes(entry.name)) continue;
      yield* sources(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

test("no source file hides a control byte that would make search skip it", () => {
  const offenders = [];
  for (const dir of DIRECTORIES) {
    if (!fs.existsSync(dir)) continue;
    for (const file of sources(dir)) {
      const bytes = fs.readFileSync(file);
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 32 && !ALLOWED.has(b)) {
          const line = bytes.subarray(0, i).toString("utf8").split("\n").length;
          offenders.push(`${file}:${line} byte 0x${b.toString(16)}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `write these as escapes — grep skips such files without saying so:\n${offenders.join("\n")}`,
  );
});
