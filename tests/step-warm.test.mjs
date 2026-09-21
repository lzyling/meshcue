import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* `precheckModel` is synchronous on purpose: its PATH_SCOPE and MODEL_FORMAT
 * refusals are throws, and six tests plus every caller read them that way. The
 * one await STEP needs was pushed out to the entry points instead, each of which
 * calls `warmStepFor` before measuring.
 *
 * Which made forgetting one a silent bug rather than a broken build. 1.3.0-dev
 * shipped with two of the three entry points warmed; the third was the OpenClaw
 * adapter -- the only one a person actually reaches. Every STEP precheck through
 * the Gateway answered `STEP support was used before warmStep() resolved`, and
 * the suite stayed green, because the suite drove the CLI and the MCP server and
 * the adapter cannot be imported here at all: it imports openclaw/plugin-sdk,
 * which is external to this repo and resolved by the host.
 *
 * So the invariant is checked where it is visible without the host. This cannot
 * see a warm that happens too late at runtime; it does see an entry point that
 * measures a file the kernel was never loaded for, which is the mistake that
 * was actually made and the one a fourth entry point would repeat.
 */
const repo = path.resolve(import.meta.dirname, "..");
const DIRECTORIES = ["server", "integration", "cli", "mcp", "adapters"];

function sources(dir, found = []) {
  const here = path.join(repo, dir);
  if (!fs.existsSync(here)) return found;
  for (const entry of fs.readdirSync(here, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(rel, found);
    else if (entry.name.endsWith(".mjs")) found.push(rel);
  }
  return found;
}

/* The arguments of the first `name(` call, split on the commas that are not
   inside a nested call, object or array. Callers here span several lines and
   pass an inline context object, so a regex over one line finds nothing. */
function argumentsOf(source, name) {
  const open = source.indexOf(`${name}(`);
  if (open < 0) return null;
  let depth = 0,
    current = "",
    args = [];
  for (let i = open + name.length; i < source.length; i++) {
    const char = source[i];
    if (char === "(" || char === "{" || char === "[") depth++;
    else if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (!depth) break;
    }
    if (depth === 1 && char === ",") {
      args.push(current.trim());
      current = "";
    } else if (!(depth === 1 && char === "(" && i === open + name.length))
      current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args.map((arg) => arg.replace(/^\(/, "").trim());
}

test("every precheck entry point warms the CAD kernel for the file it measures", () => {
  const callers = DIRECTORIES.flatMap((dir) => sources(dir)).filter((rel) =>
    fs.readFileSync(path.join(repo, rel), "utf8").includes("precheckModel("),
  );
  /* A rename or a move that drops the adapter out of this list would make the
     assertions below pass by checking nothing. */
  assert.ok(
    callers.includes(path.join("adapters", "openclaw", "index.mjs")),
    `the OpenClaw adapter is the entry point this test exists for, and it is not in ${JSON.stringify(callers)}`,
  );

  for (const rel of callers) {
    const source = fs.readFileSync(path.join(repo, rel), "utf8");
    if (rel === path.join("integration", "precheck.mjs")) continue; // its definition
    assert.match(
      source,
      /warmStepFor\s*\(/,
      `${rel} measures a model without warming STEP support first`,
    );
    const measured = argumentsOf(source, "precheckModel");
    const warmed = argumentsOf(source, "warmStepFor");
    assert.deepEqual(
      warmed,
      [measured.at(-1)],
      `${rel} warms for a different file than it measures`,
    );
  }
});
