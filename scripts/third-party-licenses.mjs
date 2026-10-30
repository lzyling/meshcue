import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* MIT, ISC and BSD ask the same thing of whoever redistributes the code: keep
   the copyright line and the licence text with every copy. A minifier is under
   no such obligation. Vite drops every comment from a minified bundle, three's
   `@license` line included, and even the comments that survive name a licence
   without carrying its text. So the text travels as a file beside the bundle,
   and the list of what goes into it is read from the bundler's own record of
   the modules it included rather than from package.json: a dependency the
   bundle never reached owes nothing, and one it reached through another
   package owes as much as a direct one. */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const LICENSE_FILE = "THIRD_PARTY_LICENSES.md";

/* A package can carry another project inside itself. three ships meshoptimizer's
   decoder among its examples, and the nearest package.json to that file is
   three's, which would credit it to the wrong authors. Anything under three's
   `examples/jsm/libs/` is such a copy; one this table does not know stops the
   build rather than going out under three's name. */
const CARRIED = [
  {
    file: /\/three\/examples\/jsm\/libs\/meshopt_decoder\.module\.js$/,
    name: "meshoptimizer",
    license: "MIT",
    version: (source) => source.match(/Built from meshoptimizer ([\d.]+)/)?.[1],
    text: "server/gltf-vendor/LICENSE.meshopt.txt",
  },
];
const CARRIER = /\/three\/examples\/jsm\/libs\//;

function licenseText(dir) {
  const name = fs
    .readdirSync(dir)
    .sort()
    .find((file) => /^(licen[cs]e|copying)/i.test(file));
  return name ? fs.readFileSync(path.join(dir, name), "utf8").trim() : null;
}

/* Module ids as the bundler reports them: absolute paths, possibly with a query
   or a virtual-module prefix. Returns one entry per package and version. */
export function bundledPackages(moduleIds) {
  const found = new Map();
  for (const raw of moduleIds) {
    if (raw.startsWith("\0")) continue;
    const id = raw.split("?")[0].replaceAll("\\", "/");
    const at = id.lastIndexOf("/node_modules/");
    if (at < 0) continue;
    const carried = CARRIED.find((entry) => entry.file.test(id));
    if (carried) {
      const version = carried.version(fs.readFileSync(id, "utf8"));
      if (!version)
        throw new Error(`Cannot read the ${carried.name} version from ${id}.`);
      const key = `${carried.name}@${version}`;
      if (!found.has(key))
        found.set(key, {
          name: carried.name,
          version,
          license: carried.license,
          text: fs.readFileSync(path.join(repo, carried.text), "utf8").trim(),
          carriedBy: id.slice(at + "/node_modules/".length),
        });
      continue;
    }
    if (CARRIER.test(id))
      throw new Error(
        `The bundle includes ${id}, a copy of another project; add its licence to scripts/third-party-licenses.mjs.`,
      );
    const rest = id.slice(at + "/node_modules/".length).split("/");
    const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
    const dir = id.slice(0, at) + "/node_modules/" + name;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    const key = `${manifest.name}@${manifest.version}`;
    if (found.has(key)) continue;
    const text = licenseText(dir);
    if (!text)
      throw new Error(
        `${key} is bundled but ships no licence file to carry with it.`,
      );
    found.set(key, {
      name: manifest.name,
      version: manifest.version,
      license:
        typeof manifest.license === "string" ? manifest.license : "see text",
      text,
    });
  }
  return [...found.values()].sort((a, b) =>
    a.name === b.name
      ? a.version.localeCompare(b.version)
      : a.name.localeCompare(b.name),
  );
}

/* The notices for code copied into MeshCue's own sources (icons, adapted
   worker code, the Draco decoder) are kept by hand in THIRD_PARTY_NOTICES.md;
   the web app is where that code ends up, so its licence file carries them
   too, from the first section on (the introduction is about the repository). */
function copiedNotices() {
  return fs
    .readFileSync(path.join(repo, "THIRD_PARTY_NOTICES.md"), "utf8")
    .replace(/^[\s\S]*?(?=^## )/m, "")
    .replace(/^## /gm, "### ")
    .trim();
}

export function licenseFile(moduleIds, { scope, footer, copied = false }) {
  const packages = bundledPackages(moduleIds);
  const sections = [
    "# Third-party licences",
    `MeshCue is Apache-2.0 (see LICENSE and NOTICE in the MeshCue package). ${scope} also contains the third-party code below, under its own licences. The build writes this list from the modules it actually bundled.`,
    "## Bundled packages",
    ...packages.map(
      (p) =>
        `### ${p.name} ${p.version} (${p.license})\n\n` +
        (p.carriedBy
          ? `Carried inside another package as \`${p.carriedBy}\`.\n\n`
          : "") +
        p.text,
    ),
  ];
  if (copied)
    sections.push("## Code copied into MeshCue's sources", copiedNotices());
  if (footer) sections.push(footer);
  return { packages, text: sections.join("\n\n") + "\n" };
}
