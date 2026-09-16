import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* `build:integration` ends by asking the host to bless the package, which needs
   a global `openclaw` on PATH. CI has none, and giving it one means a global
   npm install on a runner — the supply-chain surface this repository spent a
   night reducing. So that last step can be skipped, and these pin the two
   things that make skipping safe: the skip is asked for rather than inferred,
   and it skips only the host step, not the guards CI is there for. */

const barePath = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":");
function build(out, env = {}) {
  return execFileSync(
    process.execPath,
    ["scripts/build-integration.mjs", out],
    {
      cwd: repo,
      env: { PATH: barePath, HOME: os.homedir(), ...env },
      encoding: "utf8",
    },
  );
}
const candidate = (t, name) => {
  const out = path.join("tmp", `${name}-${process.pid}-${Date.now()}`);
  t.after(() =>
    fs.rmSync(path.join(repo, out), { recursive: true, force: true }),
  );
  return out;
};

test("without the host build, the package still builds and says so", (t) => {
  const result = JSON.parse(
    build(candidate(t, "ci-skip"), { MESHCUE_SKIP_HOST_BUILD: "1" }),
  );
  assert.equal(result.hostBuild, false);
  assert.equal(result.bundledSkill, true);
});

test("a missing host command is still an error, not a quiet skip", (t) => {
  // The failure that would otherwise be indistinguishable from the skip: a
  // build deciding for itself that the step was optional.
  assert.throws(
    () => build(candidate(t, "ci-noskip")),
    /ENOENT|openclaw/,
    "an absent openclaw must fail rather than be assumed away",
  );
});

test("skipping the host build does not skip the version guard", (t) => {
  /* The guard exists because 0.13.1 shipped with one of its four manifests
     left behind, and nothing said so for a day. If the skip carried it away,
     CI would go green on exactly that. */
  const manifest = path.join(repo, "adapters/openclaw/package.json");
  const original = fs.readFileSync(manifest, "utf8");
  t.after(() => fs.writeFileSync(manifest, original));
  fs.writeFileSync(
    manifest,
    original.replace(/"version":\s*"[^"]+"/, '"version": "0.0.1-drift"'),
  );
  assert.throws(
    () => build(candidate(t, "ci-drift"), { MESHCUE_SKIP_HOST_BUILD: "1" }),
    /0\.0\.1-drift|version/,
  );
});

test("the workflow asks for the skip rather than relying on a bare runner", () => {
  const workflow = fs.readFileSync(
    path.join(repo, ".github/workflows/ci.yml"),
    "utf8",
  );
  assert.match(workflow, /MESHCUE_SKIP_HOST_BUILD:\s*"1"/);
});
