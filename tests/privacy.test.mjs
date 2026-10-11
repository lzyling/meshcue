import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  scanText,
  scanTree,
  scanRange,
  privateRules,
} from "../scripts/privacy-rules.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-privacy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function fixtureRepo(t) {
  const dir = temporary(t);
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(dir, "text.txt"), "Safe fixture\n");
  git("add", ".");
  git("commit", "-qm", "Safe baseline");
  return { dir, git };
}

test("tracked text contains no public privacy indicators", () => {
  const hits = scanTree(repo);
  assert.deepEqual(
    hits,
    [],
    hits.map((h) => `${h.file}:${h.line}: ${h.rule}`).join("\n"),
  );
});
test("public rules detect synthetic credentials, paths, chat ids and private IPs", () => {
  const text = [
    "safe",
    "/Users/fixture/private/",
    "-100" + "1234567890",
    "192.168.99.99",
    "ghp_" + "a".repeat(32),
    "message 54321",
  ].join("\n");
  const hits = scanText(text, "fixture.txt");
  assert.deepEqual(
    hits.map((h) => h.line),
    [2, 3, 4, 5, 6],
  );
  assert.ok(hits.every((h) => h.file === "fixture.txt" && h.rule));
});
test("documented fixtures and product examples are not privacy leaks", () => {
  const text =
    "203.0.113.7 192.0.2.8 198.51.100.9 192.168.1.22 43173 -100000001 .pop() 爆爆 Telegram OpenClaw ~/.openclaw/extensions/meshcue";
  assert.deepEqual(scanText(text, "fixture.txt"), []);
});
test("self and vendor exemptions do not exempt private indicators", () => {
  for (const file of [
    "tests/privacy.test.mjs",
    "scripts/privacy-rules.mjs",
    "server/gltf-vendor/license.txt",
    "tests/fixtures/gltf-meshopt-encoder.js",
  ]) {
    assert.deepEqual(scanText("/Users/fixture/private/", file), []);
    assert.equal(
      scanText("private-fixture", file, [["private-fixture", "private"]])
        .length,
      1,
    );
  }
  assert.equal(scanText("/Users/fixture/private/", "server/own.mjs").length, 1);
});
test("tree scanning handles tracked UTF-8, binary files and deleted files", (t) => {
  const { dir, git } = fixtureRepo(t);
  fs.writeFileSync(path.join(dir, "text.txt"), "safe\n192.168.99.99\n");
  fs.writeFileSync(path.join(dir, "binary.bin"), Buffer.from([0, 255]));
  fs.writeFileSync(path.join(dir, "deleted.txt"), "safe");
  git("add", ".");
  fs.unlinkSync(path.join(dir, "deleted.txt"));
  assert.deepEqual(
    scanTree(dir).map((h) => [h.file, h.line]),
    [["text.txt", 2]],
  );
});
test("range scanning includes only selected commits and their annotated tags", (t) => {
  const { dir, git } = fixtureRepo(t);
  git("tag", "-a", "old", "-m", "message 54321");
  const base = git("rev-parse", "HEAD").trim();
  git("commit", "--allow-empty", "-qm", "message 54321");
  git("tag", "-a", "selected", "-m", "192.168.99.99");
  git("tag", "lightweight");
  const hits = scanRange(dir, `${base}..HEAD`);
  assert.equal(hits.length, 2);
  assert.ok(hits.some((h) => h.file.startsWith("commit:")));
  assert.ok(hits.some((h) => h.file === "tag:refs/tags/selected"));
  assert.throws(() => scanRange(dir, "--all"));
});
test("CLI checks messages and external literal or regex indicators fail closed", (t) => {
  const dir = temporary(t);
  const file = path.join(dir, "indicators.txt");
  const message = path.join(dir, "message.txt");
  fs.writeFileSync(file, "private-fixture\n/fixture-[0-9]+/i\n");
  assert.equal(privateRules(file).length, 2);
  fs.writeFileSync(message, "private-fixture\nFIXTURE-123\n");
  const run = (args, env = {}) =>
    spawnSync(
      process.execPath,
      [path.join(repo, "scripts/privacy-check.mjs"), ...args],
      {
        encoding: "utf8",
        env: { ...process.env, MESHCUE_PRIVATE_INDICATORS: "", ...env },
      },
    );
  assert.equal(run(["--message", message]).status, 0);
  const result = run(["--message", message], {
    MESHCUE_PRIVATE_INDICATORS: file,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /commit message:2: private indicator 2/);
  fs.writeFileSync(message, "message 54321\n");
  assert.equal(run(["--message", message]).status, 1);
  fs.writeFileSync(file, "/[/\n");
  assert.equal(
    run(["--message", message], { MESHCUE_PRIVATE_INDICATORS: file }).status,
    1,
  );
  assert.equal(run(["--unknown"]).status, 1);
});
