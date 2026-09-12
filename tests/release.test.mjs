import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheRelease, cachedRelease } from "../integration/release.mjs";
import { pruneReleases } from "../integration/manager.mjs";

// The version cache is what an upgrade rolls back to. Nothing here was covered,
// so a package that had been altered on disk could have been launched anyway.
function fixture(t, { id = "meshcue", extra = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const install = path.join(root, "install"),
    runtime = path.join(root, "runtime");
  const write = (relative, content) => {
    const target = path.join(install, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  fs.mkdirSync(runtime, { recursive: true });
  write("openclaw.plugin.json", JSON.stringify({ id, version: "0.0.0-test" }));
  write(
    "package.json",
    JSON.stringify({ name: "@meshcue/openclaw", version: "0.0.0-test" }),
  );
  write("runtime/server.mjs", "export const server = 1;\n");
  write("AGENT-INTERFACE.md", "# interface\n");
  write("web/index.html", "<!doctype html><title>MeshCue</title>");
  write("web/assets/app.js", "console.log(1);\n");
  for (const [relative, content] of Object.entries(extra))
    write(relative, content);
  return { root, install, runtime, write };
}

test("a cached release is content addressed, reusable and complete", (t) => {
  const f = fixture(t);
  const first = cacheRelease(f.install, f.runtime);
  assert.match(first.id, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(first.serverEntry), true);
  assert.equal(fs.existsSync(path.join(first.distRoot, "index.html")), true);
  // The server derives its version from this file instead of restating it. A
  // release that left it behind started and served, but reported "unknown" from
  // inside a numbered package — the drift the derivation was meant to end.
  assert.equal(
    JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(first.serverEntry), "..", "package.json"),
        "utf8",
      ),
    ).version,
    "0.0.0-test",
  );
  // No staging directory may survive next to the cache.
  assert.deepEqual(fs.readdirSync(path.join(f.runtime, "releases")), [
    first.id,
  ]);
  // Caching the same bytes again resolves to the same release, not a rebuild.
  assert.deepEqual(cacheRelease(f.install, f.runtime).id, first.id);

  const other = fixture(t, {});
  other.write("web/assets/app.js", "console.log(2);\n");
  assert.notEqual(cacheRelease(other.install, other.runtime).id, first.id);
});

test("an altered cache is refused rather than launched", (t) => {
  const f = fixture(t);
  const release = cacheRelease(f.install, f.runtime);
  fs.writeFileSync(release.serverEntry, "export const server = 666;\n");

  // Re-caching the same install notices its verified copy no longer matches.
  assert.throws(() => cacheRelease(f.install, f.runtime), {
    code: "CACHE_CHANGED",
  });
  // And so does resolving it directly, which is the rollback path.
  assert.throws(() => cachedRelease(f.runtime, release.id), {
    code: "CACHE_CHANGED",
  });
});

test("a bundled skill is part of the package identity, not a loose file", (t) => {
  // The host loads a bundled skill from the install root, so swapping it there
  // changes what the Agent is told to do while every other check still passes.
  const skill = "skills/meshcue-review/SKILL.md";
  const f = fixture(t, {
    extra: { [skill]: "---\nname: meshcue-review\n---\n" },
  });
  const release = cacheRelease(f.install, f.runtime);
  assert.equal(fs.existsSync(path.join(release.root, skill)), true);

  const bare = fixture(t);
  assert.notEqual(
    release.id,
    cacheRelease(bare.install, bare.runtime).id,
    "a package with a skill must not share an identity with one without",
  );

  // Its contents count, not just its presence: a reworded skill is a new package.
  const reworded = fixture(t, {
    extra: { [skill]: "---\nname: meshcue-review\n---\nreworded\n" },
  });
  assert.notEqual(
    release.id,
    cacheRelease(reworded.install, reworded.runtime).id,
  );

  // And editing it inside the verified cache is refused like any other file.
  fs.writeFileSync(path.join(release.root, skill), "---\nedited\n---\n");
  assert.throws(() => cachedRelease(f.runtime, release.id), {
    code: "CACHE_CHANGED",
  });
});

test("a release identity must be a real digest and a real directory", (t) => {
  const f = fixture(t);
  const release = cacheRelease(f.install, f.runtime);
  assert.equal(cachedRelease(f.runtime, release.id).id, release.id);
  for (const id of ["", null, "../escape", "not-a-digest", "a".repeat(63)])
    assert.throws(() => cachedRelease(f.runtime, id), {
      code: "PACKAGE_INVALID",
    });
  assert.throws(() => cachedRelease(f.runtime, "b".repeat(64)), {
    code: "NOT_FOUND",
  });
});

test("a package that is not MeshCue, or not plain files, does not start", (t) => {
  const foreign = fixture(t, { id: "something-else" });
  assert.throws(() => cacheRelease(foreign.install, foreign.runtime), {
    code: "PACKAGE_INVALID",
  });

  const linked = fixture(t);
  fs.symlinkSync(
    path.join(linked.install, "web/index.html"),
    path.join(linked.install, "web/alias.html"),
  );
  assert.throws(() => cacheRelease(linked.install, linked.runtime), {
    code: "PACKAGE_INVALID",
  });
});

// Every upgrade copies a whole runtime into releases/ and nothing removed the
// old ones, so a project grew a few megabytes per version for the life of the
// review. Only the running release and the rollback target are ever launched.
test("superseded releases are removed, and only real release ids are touched", (t) => {
  const f = fixture(t);
  const current = cacheRelease(f.install, f.runtime).id;
  f.write("runtime/server.mjs", "export const server = 2;\n");
  const upgraded = cacheRelease(f.install, f.runtime).id;
  f.write("runtime/server.mjs", "export const server = 3;\n");
  const newest = cacheRelease(f.install, f.runtime).id;
  assert.equal(new Set([current, upgraded, newest]).size, 3);
  // Anything in here that is not a content hash was not put there by us.
  const foreign = path.join(f.runtime, "releases", "not-a-release-id");
  fs.mkdirSync(foreign, { recursive: true });
  assert.deepEqual(pruneReleases(f.runtime, [newest, upgraded]), [current]);
  assert.deepEqual(
    fs.readdirSync(path.join(f.runtime, "releases")).sort(),
    [...[newest, upgraded].sort(), "not-a-release-id"].sort(),
  );
  // The one still running has to survive a keep list with holes in it.
  assert.deepEqual(pruneReleases(f.runtime, [newest, undefined]), [upgraded]);
  assert.equal(cachedRelease(f.runtime, newest).id, newest);
  assert.equal(fs.existsSync(foreign), true);
});
