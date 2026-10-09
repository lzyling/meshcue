import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const failure = (code) =>
  Object.assign(
    new Error(
      code === "ENOENT"
        ? "the openclaw command was not found"
        : "the openclaw command is not a supported npm shim",
    ),
    { code },
  );

// Recognize only npm cmd-shim's quoted Node invocation with one JS entry and
// %*. Never interpret batch, expand arbitrary variables, or pass argv to cmd.
export function npmShimEntry(text, shim, pathApi = path.win32) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^(?:\s*@?\s*|endLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & )"(?:%_prog%|%dp0%[\\/]node\.exe|%~dp0[\\/]node\.exe|node)"[ \t]+"(%dp0%[\\/][^"\r\n]+|%~dp0[\\/][^"\r\n]+)"[ \t]+%\*\s*$/i,
    );
    if (!match) continue;
    const relative = match[1].replace(/^%(?:dp0%|~dp0)[\\/]/i, "");
    if (relative.includes("%") || !/\.(?:mjs|cjs|js)$/i.test(relative))
      throw failure("OPENCLAW_UNSUPPORTED_SHIM");
    entries.push(
      pathApi.resolve(
        pathApi.dirname(shim),
        relative.replace(/[\\/]/g, pathApi.sep),
      ),
    );
  }
  if (!entries.length || new Set(entries).size !== 1)
    throw failure("OPENCLAW_UNSUPPORTED_SHIM");
  return entries[0];
}

export function resolveOpenClaw({
  platform = process.platform,
  env = process.env,
  cwd = process.cwd(),
  pathApi = platform === "win32" ? path.win32 : path,
  node = process.execPath,
} = {}) {
  if (platform !== "win32") return { file: "openclaw", prefix: [] };
  const variable = (name) =>
    Object.entries(env).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1];
  const extensions = (variable("PATHEXT") || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter((ext) => /^\.[a-z0-9]+$/i.test(ext));
  for (let directory of (variable("PATH") || "").split(";")) {
    directory = directory.replace(/^"(.*)"$/, "$1");
    if (!directory) continue;
    for (const extension of extensions) {
      const file = pathApi.resolve(
        cwd,
        directory,
        `openclaw${extension.toLowerCase()}`,
      );
      let stat;
      try {
        stat = fs.statSync(file);
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
        throw failure("OPENCLAW_UNSUPPORTED_SHIM");
      }
      if (!stat.isFile()) continue;
      if (/^\.(exe|com)$/i.test(extension)) return { file, prefix: [] };
      if (!/^\.cmd$/i.test(extension))
        throw failure("OPENCLAW_UNSUPPORTED_SHIM");
      let entry;
      try {
        entry = npmShimEntry(fs.readFileSync(file, "utf8"), file, pathApi);
        if (!fs.statSync(entry).isFile())
          throw failure("OPENCLAW_UNSUPPORTED_SHIM");
      } catch {
        throw failure("OPENCLAW_UNSUPPORTED_SHIM");
      }
      return { file: node, prefix: [entry] };
    }
  }
  // No negative cache: an install or a changed PATH can recover the next call.
  throw failure("ENOENT");
}

export async function execOpenClaw(argv, options = {}, resolution = {}) {
  const command = resolveOpenClaw({
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
    ...resolution,
  });
  return exec(command.file, [...command.prefix, ...argv], {
    ...options,
    shell: false,
  });
}

export function execOpenClawSync(argv, options = {}, resolution = {}) {
  const command = resolveOpenClaw({
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
    ...resolution,
  });
  return execFileSync(command.file, [...command.prefix, ...argv], {
    ...options,
    shell: false,
  });
}
