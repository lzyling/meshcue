import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(
  repo,
  process.argv[2] || "tmp/integration-build/package",
);
if (
  !path.relative(path.join(repo, "tmp"), out).startsWith("..") &&
  out !== path.join(repo, "tmp")
) {
  if (fs.existsSync(out))
    throw new Error(
      "Build output already exists; use a new candidate directory.",
    );
} else
  throw new Error(
    "Candidate build must use a new directory under project tmp/.",
  );
fs.mkdirSync(out, { recursive: true });
const banner = {
  js: 'import { createRequire as __meshcueRequire } from "node:module"; const require = __meshcueRequire(import.meta.url);',
};
await build({
  entryPoints: [path.join(repo, "server/index.mjs")],
  outfile: path.join(out, "runtime/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner,
});
await build({
  entryPoints: [path.join(repo, "scripts/reviewctl.mjs")],
  outfile: path.join(out, "scripts/reviewctl.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner,
});
await build({
  entryPoints: [path.join(repo, "adapters/openclaw/index.mjs")],
  outfile: path.join(out, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["openclaw/*"],
  banner,
});
execFileSync(
  process.execPath,
  [
    path.join(repo, "node_modules/vite/bin/vite.js"),
    "build",
    "--outDir",
    path.join(out, "web"),
  ],
  { cwd: repo, stdio: "pipe" },
);
for (const name of ["package.json", "openclaw.plugin.json"])
  fs.copyFileSync(
    path.join(repo, "adapters/openclaw", name),
    path.join(out, name),
  );
fs.copyFileSync(
  path.join(repo, "AGENT-INTERFACE.md"),
  path.join(out, "AGENT-INTERFACE.md"),
);
// Workshop is the only authoring source. A vetted export can be supplied for
// packaging; do not synthesize or patch SKILL.md in this build process.
if (process.env.MESHCUE_SKILL_EXPORT) {
  const source = fs.realpathSync(process.env.MESHCUE_SKILL_EXPORT);
  if (!fs.existsSync(path.join(source, "SKILL.md")))
    throw new Error("Workshop export has no SKILL.md");
  fs.cpSync(source, path.join(out, "skills/meshcue-review"), {
    recursive: true,
    dereference: false,
  });
  const manifestFile = path.join(out, "openclaw.plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.skills = ["./skills/meshcue-review"];
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}
execFileSync("openclaw", ["plugins", "build", "--root", out], {
  cwd: repo,
  stdio: "pipe",
});
console.log(
  JSON.stringify({
    output: path.relative(repo, out),
    bundledSkill: !!process.env.MESHCUE_SKILL_EXPORT,
  }),
);
