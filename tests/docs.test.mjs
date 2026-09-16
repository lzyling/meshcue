import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, BEGIN, END } from "../scripts/sync-reviewer-help.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(repo, file), "utf8");

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
