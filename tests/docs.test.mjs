import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { render, BEGIN, END } from "../scripts/sync-reviewer-help.mjs";
import { docPaths, DOC_FILES } from "../integration/manager.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");

test("the agent reads the same reviewer help the panel shows", async () => {
  const doc = read("AGENT-INTERFACE.md");
  const from = doc.indexOf(BEGIN);
  const to = doc.indexOf(END);
  assert.notEqual(
    from,
    -1,
    "AGENT-INTERFACE.md lost its reviewer-help markers",
  );
  assert.equal(
    doc.slice(from, to + END.length),
    await render(),
    "AGENT-INTERFACE.md is behind src/i18n/en.js — run node scripts/sync-reviewer-help.mjs",
  );
});

/* The install line names a tag, which is the whole point: a bare github: URL
 * installs the default branch as it stands that second. A named tag is also the
 * one kind of documentation that goes quietly wrong on release day, so the
 * version bump has to drag it along. */
test("the documented install tag is this version", () => {
  const { version } = JSON.parse(read("package.json"));
  for (const file of ["README.md", "AGENT-INTERFACE.md"]) {
    const tags = [...read(file).matchAll(/meshcue#v([0-9]+\.[0-9]+\.[0-9]+)/g)];
    assert.ok(tags.length, `${file} documents no pinned install tag`);
    for (const [, tag] of tags)
      assert.equal(tag, version, `${file} still points at v${tag}`);
  }
});

/* An install root is the only place an agent can read from, and `inspect` is
 * the only thing that tells it where. A named path that does not open is worse
 * than a missing one: it looks exactly like an install that worked. */
test("inspect names only documents that are there", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-docs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(docPaths(root), {}, "an empty root has nothing to offer");
  fs.writeFileSync(path.join(root, "README.md"), "# readme\n");
  assert.deepEqual(docPaths(root), { readme: path.join(root, "README.md") });
  // A clone is itself an install root: `npx github:…` runs the repository.
  assert.deepEqual(
    Object.keys(docPaths(repo)).sort(),
    Object.keys(DOC_FILES).sort(),
  );
});

/* Both packaging routes have to carry all four, and until now neither one was
 * checked. npm fills a tarball from the files whitelist plus a README it adds
 * on its own, which covered every document without anyone arranging it; the
 * adapter build copies a list written by hand, and for two releases that list
 * named one file. `inspect` reported all four either way. The adapter side of
 * this is asserted against a real installation in tests/package-smoke.mjs. */
test("the npm package carries every document inspect can report", () => {
  const report = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // `prepare` builds before npm reports, onto the same stream; the report is
  // the trailing array.
  const at = report.lastIndexOf("\n[\n");
  const packed = new Set(
    JSON.parse(at === -1 ? report : report.slice(at))[0].files.map(
      (entry) => entry.path,
    ),
  );
  for (const relative of Object.values(DOC_FILES))
    assert.ok(packed.has(relative), `npm pack leaves out ${relative}`);
});
