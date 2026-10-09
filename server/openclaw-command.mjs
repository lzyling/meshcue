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

// Whole-file whitelist: npm cmd-shim 8/9's Node/no-args header and IF
// block, with PATHEXT in the corresponding version's location; or one
// legacy quoted Node invocation. Blank lines are harmless. No batch is run.
export function npmShimEntry(text, shim, pathApi = path.win32) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const head = [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ") ELSE (",
    '  SET "_prog=node"',
  ];
  let match;
  if (lines.length === 1) {
    // Deliberately only a single, complete legacy invocation, not a scan
    // for a plausible invocation hidden inside an arbitrary batch file.
    match = lines[0].match(
      /^@?"(?:%~dp0\\node\.exe|node)"[ \t]+"%~dp0\\([^"\r\n]+)"[ \t]+%\*$/i,
    );
  } else if (
    head.every(
      (line, index) => lines[index]?.toLowerCase() === line.toLowerCase(),
    )
  ) {
    const tail = lines.slice(head.length);
    const version8 =
      tail[0]?.toUpperCase() === "  SET PATHEXT=%PATHEXT:;.JS;=;%";
    if (version8) tail.shift();
    if (tail.length === 2 && tail[0] === ")") {
      match = tail[1].match(
        version8
          ? /^endLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & "%_prog%"[ \t]+"%dp0%\\([^"\r\n]+)"[ \t]+%\*$/i
          : /^endLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"[ \t]+"%dp0%\\([^"\r\n]+)"[ \t]+%\*$/i,
      );
    }
  }
  const relative = match?.[1];
  // Reject rooted/UNC/drive paths and unresolved batch variables BEFORE
  // resolve can reinterpret them. Parent segments are valid for local .bin.
  if (
    !relative ||
    /^[\\/]/.test(relative) ||
    /[%:]/.test(relative) ||
    !/\.(?:mjs|cjs|js)$/i.test(relative)
  )
    throw failure("OPENCLAW_UNSUPPORTED_SHIM");
  return pathApi.resolve(
    pathApi.dirname(shim),
    relative.replace(/[\\/]/g, pathApi.sep),
  );
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
