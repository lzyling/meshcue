import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cacheRelease } from "../integration/release.mjs";

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
  for (const name of ["LICENSE", "NOTICE"])
    assert.equal(
      fs.readFileSync(path.join(repo, result.output, name), "utf8"),
      fs.readFileSync(path.join(repo, name), "utf8"),
      `the shared OpenClaw and Claude Code package must carry ${name}`,
    );
  const notice = fs.readFileSync(
    path.join(repo, result.output, "NOTICE"),
    "utf8",
  );
  assert.match(notice, /Copyright/);
  assert.match(notice, /https:\/\/github\.com\/lzyling\/meshcue/);
  // The Draco worker adapts three.js code, and MIT asks that its copyright and
  // permission notice travel with every copy. The built asset is the copy that
  // ships, here and in npm's dist/, and only a legal comment survives the build.
  const legal = fs
    .readFileSync(path.join(repo, "src/viewer/draco-worker.js"), "utf8")
    .match(/^\/\*![\s\S]*?\*\//)?.[0];
  assert.match(legal ?? "", /Copyright © 2010-2026 three\.js authors/);
  assert.match(legal, /The above copyright notice and this permission notice/);
  const assets = path.join(repo, result.output, "web/assets");
  const workers = fs
    .readdirSync(assets)
    .filter((name) => /^draco-worker-.*\.js$/.test(name));
  assert.equal(workers.length, 1);
  assert.ok(
    fs.readFileSync(path.join(assets, workers[0]), "utf8").includes(legal),
    "the built Draco worker must keep the three.js MIT notice",
  );
  // npm's files whitelist also governs github: installs. LICENSE is automatic;
  // NOTICE is not, so pin its explicit inclusion and both root files. Avoid
  // npm pack: npm 10 still runs prepare with --ignore-scripts --dry-run, while
  // npm 11 does not, making its JSON stdout lifecycle-dependent.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, "package.json"), "utf8"),
  );
  assert.ok(
    manifest.files.includes("NOTICE"),
    "npm and github: installs must explicitly include NOTICE",
  );
  for (const name of ["LICENSE", "NOTICE"])
    assert.ok(
      fs.statSync(path.join(repo, name)).isFile(),
      `npm and github: installs must have a root ${name} file to include`,
    );
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

/* MIT, ISC and BSD ask that the copyright line and the licence text travel with
   every copy, and a minified bundle keeps neither: Vite strips every comment,
   three's `@license` line with the rest, and esbuild's bundles never had them.
   So each bundle has a THIRD_PARTY_LICENSES.md beside it, written from the
   modules the bundler included. Pinned here for the packages each one is known
   to fold in, text and all, so a build that stops writing the file, writes it
   empty, or credits meshoptimizer's decoder to three, is caught. The web build
   is the same Vite build npm ships as dist/. */
test("every bundle carries the licences of the packages folded into it", (t) => {
  const out = candidate(t, "ci-licences");
  build(out, { MESHCUE_SKIP_HOST_BUILD: "1" });
  const pkg = path.join(repo, out);
  const own = (dir) => {
    const name = fs
      .readdirSync(dir)
      .sort()
      .find((file) => /^(licen[cs]e|copying)/i.test(file));
    return fs.readFileSync(path.join(dir, name), "utf8").trim();
  };
  const npm = (name) => {
    const dir = path.join(repo, "node_modules", name);
    const { version } = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    return { name, version, text: own(dir) };
  };
  const decoder = fs.readFileSync(
    path.join(
      repo,
      "node_modules/three/examples/jsm/libs/meshopt_decoder.module.js",
    ),
    "utf8",
  );
  const meshopt = {
    name: "meshoptimizer",
    version: decoder.match(/Built from meshoptimizer ([\d.]+)/)[1],
    text: fs
      .readFileSync(
        path.join(repo, "server/gltf-vendor/LICENSE.meshopt.txt"),
        "utf8",
      )
      .trim(),
  };
  assert.match(meshopt.text, /Copyright \(c\) 2016-2026 Arseny Kapoulkine/);
  const expected = {
    "web/THIRD_PARTY_LICENSES.md": [
      npm("three"),
      npm("three-mesh-bvh"),
      npm("@noble/hashes"),
      meshopt,
    ],
    "THIRD_PARTY_LICENSES.md": [
      npm("three"),
      npm("express"),
      npm("zod"),
      npm("image-size"),
      meshopt,
    ],
  };
  for (const [file, packages] of Object.entries(expected)) {
    const notice = fs.readFileSync(path.join(pkg, file), "utf8");
    for (const { name, version, text } of packages) {
      const at = notice.indexOf(`\n### ${name} ${version} (`);
      assert.ok(at >= 0, `${file} must list ${name} ${version}`);
      const next = notice.indexOf("\n#", at + 1);
      assert.ok(
        notice.slice(at, next < 0 ? undefined : next).includes(text),
        `${file} must carry the licence text of ${name} under its own heading`,
      );
    }
  }
  // An installed package does not run from here: each project runs its own
  // cached copy, which outlives an install root the host replaces. The notice
  // for the server's bundled code has to be in that copy, not only here.
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "meshcue-ci-cache-"));
  t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
  const release = cacheRelease(pkg, runtime);
  for (const file of Object.keys(expected))
    assert.deepEqual(
      fs.readFileSync(path.join(release.root, file)),
      fs.readFileSync(path.join(pkg, file)),
      `the release a project runs carries ${file}`,
    );
  // The meshopt chunk is in the web build at all, so its entry is not padding.
  assert.ok(
    fs
      .readdirSync(path.join(pkg, "web/assets"))
      .some((name) => name.startsWith("meshopt_decoder")),
  );
  // The icons and adapted code are not npm packages; the web app carries their
  // hand-kept notices as well.
  const web = fs.readFileSync(
    path.join(pkg, "web/THIRD_PARTY_LICENSES.md"),
    "utf8",
  );
  assert.match(web, /### Lucide icons[\s\S]*Copyright \(c\) 2026 Lucide Icons/);
  assert.match(web, /Copyright \(c\) 2013-present Cole Bemis/);
  assert.ok(
    JSON.parse(
      fs.readFileSync(path.join(repo, "package.json"), "utf8"),
    ).files.includes("dist/"),
    "npm and github: installs ship dist/ and the licence file inside it",
  );
});

/* The one class of failure the rest of the suite cannot see. Everything else
   runs from the source tree, where the tessellator resolves out of node_modules
   and works; the package resolves it from `vendor/`, and the first build of it
   loaded the identical bytes — same file, same hash — as ESM instead of
   CommonJS, because the nearest package.json to `vendor/` is the plugin's and
   it declares `"type": "module"`. Requiring it returned a namespace object
   where a factory function was expected, and nothing said so until a STEP was
   published from an installed plugin.

   So this runs the packaged converter, from the packaged layout, on a real
   file. */
test("the packaged converter runs from the package, not from node_modules", async (t) => {
  const out = candidate(t, "ci-step");
  build(out, { MESHCUE_SKIP_HOST_BUILD: "1" });
  const pkg = path.join(repo, out);
  assert.ok(
    fs.existsSync(path.join(pkg, "vendor/occt-import-js.wasm")),
    "the library travels with the package as its own file",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(pkg, "vendor/package.json"), "utf8"))
      .type,
    "commonjs",
    "without this the plugin's own module type reaches the library and changes what it exports",
  );
  const source = fs.readFileSync(path.join(repo, "tests/fixtures/plate.step"));
  /* Driven the way the server drives it -- its own process, the model on stdin,
     the frame on descriptor 3 -- because the packaged copy is where the last two
     STEP bugs lived and neither was reachable from the source tree. */
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(pkg, "runtime/step-child.mjs"), "packaged"],
      { stdio: ["pipe", "ignore", "ignore", "pipe"] },
    );
    const chunks = [];
    child.stdio[3].on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const answer = Buffer.concat(chunks);
      if (answer.length < 4)
        return reject(new Error(`no frame from the packaged child (${code})`));
      resolve(JSON.parse(answer.subarray(4, 4 + answer.readUInt32LE(0))));
    });
    child.stdin.end(source);
  });
  assert.ok(result.ok, "the packaged converter converted nothing");
  assert.ok(result.triangles > 100);
  assert.ok(result.brepFaces > 0);
});
