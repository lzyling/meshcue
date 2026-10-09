import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../fake-openclaw.mjs", import.meta.url));
export function installFakeOpenClaw(bin, platform = process.platform) {
  const entry = path.join(
    bin,
    platform === "win32" ? "fake-openclaw.mjs" : "openclaw",
  );
  if (platform === "win32") {
    fs.copyFileSync(source, entry);
    fs.writeFileSync(
      path.join(bin, "openclaw.cmd"),
      [
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
        "  SET PATHEXT=%PATHEXT:;.JS;=;%",
        ")",
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\fake-openclaw.mjs" %*',
        "",
      ].join("\r\n"),
    );
  } else {
    fs.copyFileSync(source, entry);
    fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  }
  return entry;
}
