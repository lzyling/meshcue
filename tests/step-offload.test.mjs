import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* `precheckModel` is synchronous on purpose: its PATH_SCOPE and MODEL_FORMAT
 * refusals are throws, and six tests plus every caller read them that way. So
 * the one thing sizing a STEP needs that it cannot do -- tessellate -- is handed
 * in, and each entry point gets it from `stepMeshFor` first.
 *
 * Which makes forgetting one a silent bug rather than a broken build, and the
 * bug it hides is not a small one. 1.3.0-dev shipped with the conversion
 * running in whatever process called it; for the OpenClaw adapter that process
 * is the Gateway, which it stopped for 8.5 seconds and left ~240 MB heavier,
 * permanently, for any STEP of any size. The suite stayed green because it
 * drove the CLI and the MCP server, and the adapter cannot be imported here at
 * all: it imports openclaw/plugin-sdk, which the host resolves.
 *
 * So the invariant is checked where it is visible without the host. This cannot
 * see an await that happens too late at runtime; it does see an entry point
 * measuring a file it never converted, which is the mistake that was actually
 * made and the one a fourth entry point would repeat.
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

test("every precheck entry point converts off-process for the file it measures", () => {
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
      /await stepMeshFor\s*\(/,
      `${rel} measures a model without converting it off-process first`,
    );
    const measured = argumentsOf(source, "precheckModel");
    const converted = argumentsOf(source, "stepMeshFor");
    assert.deepEqual(
      converted.at(-1),
      measured.at(1),
      `${rel} converts a different file than it measures`,
    );
  }
});

test("no long-lived process can reach the CAD kernel in line", () => {
  /* The kernel is loaded by `convertStep`, and the only file allowed to call it
     is the child that exists to be thrown away. Everything else -- the review
     server, the Gateway adapter, the MCP server, the sizing code they share --
     goes through `convertStepDetached`. This is what makes "it never runs here"
     a property of the code rather than of who remembered. */
  const callers = DIRECTORIES.flatMap((dir) => sources(dir)).filter((rel) =>
    /(?<!function )(?<![a-zA-Z])convertStep\s*\(/.test(
      fs.readFileSync(path.join(repo, rel), "utf8"),
    ),
  );
  assert.deepEqual(callers, [path.join("server", "step-child.mjs")]);
});
