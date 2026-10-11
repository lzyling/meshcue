import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Only generic patterns belong here. Host-specific indicators stay outside Git.
export const RULES = [
  [
    /\/Users\/(?!<)[^/\s"'`]+\/|\/home\/(?!runner\/|web_user\b|<)[a-z][^/\s"'`]*\/|[A-Z]:\\Users\\(?!<)[^\\\s"'`]+/,
    "absolute home path",
  ],
  [
    /~\/\.openclaw\/(?!extensions\/meshcue\b)|\.openclaw\/(?:workspace|agents|openclaw\.json)|\bopenclaw\.json\b/,
    "local host state",
  ],
  [
    /\bGateway generation\b|reloaded or disabled|\bsessions_spawn\b|\b(?:MEMORY|SOUL|USER|AGENTS)\.md\b/,
    "host operations log",
  ],
  [/(?<!\d)-100\d{10}(?!\d)/, "Telegram chat id"],
  [/(?:\b[A-Z][a-z]+|消息|\bmessage)\s?#?\d{5}(?!\d)/, "chat message number"],
  [
    /\btmp\/(?:wt-|candidate-\d|[\w-]+-plugin-|[\w-]+-\d{3}-|windows-lan-test|cc-home)/,
    "private workspace path",
  ],
  [
    /\b(?:opus|gpt|ai)-relay\b|\bgpt-\d+(?:\.\d+)?-sol\b/,
    "internal model alias",
  ],
  [
    /\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}/,
    "credential",
  ],
  [/\bP[O]P\b(?!3)/, "local agent identity"],
];
const PRIVATE_IP =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})\b/g;
// Existing synthetic fixtures and the network CIDR constant only. New examples
// should use RFC 5737 documentation addresses instead of extending this list.
const IP_ALLOW = new Set([
  "192.168.1.2",
  "192.168.1.22",
  "192.168.1.23",
  "192.168.4.12",
  "192.168.4.13",
  "192.168.50.7",
  "10.0.8.3",
  "10.1.2.3",
  "192.168.0.0",
]);
// Exact product examples/defaults, plus existing synthetic test directories.
// Fixture names are allowed only in tests, not in docs or commit/tag messages.
const PROJECT_ALLOW = new Set([
  "lamp",
  "phone-stand",
  "sample",
  "meshcue-state",
]);
const FIXTURE_PROJECT_ALLOW = new Set([
  "a",
  "allowed",
  "also-removed",
  "b",
  "bracket-a",
  "bracket-b",
  "bracket-step",
  "c",
  "cli",
  "disallowed",
  "elsewhere",
  "escape",
  "existing",
  "fixture",
  "forgotten",
  "idle-policy",
  "idle-signals",
  "lean",
  "lean-escape",
  "new",
  "old",
  "opened",
  "plate",
  "printed-and-forgotten",
  "refused",
  "removed",
  "signals",
  "somebody-elses",
  "stale-idle-signals",
  "the-one-being-opened",
]);
const WORKSPACE_PATH =
  /(?<![\p{L}\p{N}_.-])(documents|projects)[/\\]([\p{L}\p{N}_.-]+)/gu;
const SELF = new Set(["scripts/privacy-rules.mjs", "tests/privacy.test.mjs"]);
export function exempt(file) {
  return (
    SELF.has(file) ||
    file.startsWith("server/gltf-vendor/") ||
    file === "tests/fixtures/gltf-meshopt-encoder.js"
  );
}

// Each nonempty line is a literal, or /pattern/flags. Invalid regexes fail closed.
export function privateRules(file) {
  if (!file) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, i) => {
      const match = line.match(/^\/(.*)\/([imu]*)$/);
      return [
        match ? new RegExp(match[1], match[2]) : line,
        `private indicator ${i + 1}`,
      ];
    });
}
export function scanText(text, file, additional = []) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    // Exemptions apply only to public rules, never to private indicators.
    const rules = exempt(file) ? additional : [...RULES, ...additional];
    for (const [pattern, rule] of rules) {
      if (
        typeof pattern === "string"
          ? line.includes(pattern)
          : pattern.test(line)
      )
        hits.push({ file, line: index + 1, rule });
    }
    if (!exempt(file)) {
      for (const [, directory, name] of line.matchAll(WORKSPACE_PATH)) {
        if (
          directory === "projects" &&
          (PROJECT_ALLOW.has(name) ||
            (file.startsWith("tests/") && FIXTURE_PROJECT_ALLOW.has(name)))
        )
          continue;
        hits.push({ file, line: index + 1, rule: "private workspace path" });
      }
    }
    if (!exempt(file))
      for (const match of line.matchAll(PRIVATE_IP)) {
        const ip = match[0];
        if (
          ip.split(".").every((part) => Number(part) <= 255) &&
          !IP_ALLOW.has(ip)
        )
          hits.push({ file, line: index + 1, rule: "unapproved private IPv4" });
      }
  });
  return hits;
}
export function scanTree(root, additional = []) {
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const hits = [];
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || !fs.lstatSync(full).isFile()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    // Fatal UTF-8 decoding avoids treating binary assets as text.
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      continue;
    }
    hits.push(...scanText(text, file, additional));
  }
  return hits;
}
export function scanRange(root, range, additional = []) {
  if (!/^[^\s]+\.\.[^\s]+$/.test(range) || range.startsWith("-"))
    throw new Error("Expected --range <a>..<b>");
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const commits = git(["rev-list", range, "--"])
    .trim()
    .split("\n")
    .filter(Boolean);
  const selected = new Set(commits);
  const hits = [];
  for (const sha of commits)
    hits.push(
      ...scanText(
        git(["show", "-s", "--format=%B", sha]),
        `commit:${sha}`,
        additional,
      ),
    );
  hits.push(...scanTagsAt(root, selected, additional));
  return hits;
}
function gitAt(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}
export function scanTag(root, ref, additional = []) {
  if (!ref.startsWith("refs/tags/")) throw new Error("Expected a tag ref");
  // Resolve the exact ref, not the prefix matching used by for-each-ref.
  const sha = gitAt(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    ref,
  ]).trim();
  if (gitAt(root, ["cat-file", "-t", sha]).trim() !== "tag") return [];
  const object = gitAt(root, ["cat-file", "tag", sha]);
  return scanText(
    object.slice(object.indexOf("\n\n") + 2),
    `tag:${ref}`,
    additional,
  );
}
function scanTagsAt(root, selected, additional) {
  const tags = gitAt(root, ["for-each-ref", "refs/tags", "--format=%(refname)"])
    .trim()
    .split("\n")
    .filter(Boolean);
  return tags.flatMap((tag) => {
    const target = gitAt(root, ["rev-parse", `${tag}^{}`]).trim();
    return selected.has(target) ? scanTag(root, tag, additional) : [];
  });
}
export function scanHead(root, additional = []) {
  const sha = gitAt(root, ["rev-parse", "HEAD"]).trim();
  return [
    ...scanText(
      gitAt(root, ["show", "-s", "--format=%B", sha]),
      `commit:${sha}`,
      additional,
    ),
    ...scanTagsAt(root, new Set([sha]), additional),
  ];
}
