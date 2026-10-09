// Verbatim Node/no-shebang-args .cmd templates from npm/cmd-shim:
// 8.0.0: lib/index.js (bundled with npm in Node 24.18.0)
// 9.0.2: https://github.com/npm/cmd-shim/blob/v9.0.2/lib/index.js
// Keep the blank lines, indentation and two spaces before the target: these
// reproduce writeShim_ with prog="node", args="", variables="".
export function npmNodeShim(entry, version = "9.0.2") {
  if (!["8.0.0", "9.0.2"].includes(version))
    throw new Error("Unknown cmd-shim fixture version");
  const head =
    "@ECHO off\r\n" +
    "GOTO start\r\n" +
    ":find_dp0\r\n" +
    "SET dp0=%~dp0\r\n" +
    "EXIT /b\r\n" +
    ":start\r\n" +
    "SETLOCAL\r\n" +
    "CALL :find_dp0\r\n";
  return (
    head +
    "\r\n" +
    'IF EXIST "%dp0%\\node.exe" (\r\n' +
    '  SET "_prog=%dp0%\\node.exe"\r\n' +
    ") ELSE (\r\n" +
    '  SET "_prog=node"\r\n' +
    (version === "8.0.0" ? "  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n" : "") +
    ")\r\n" +
    "\r\n" +
    "endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & " +
    (version === "9.0.2" ? "set PATHEXT=%PATHEXT:;.JS;=;% & " : "") +
    `"%_prog%"  "%dp0%\\${entry}" %*\r\n`
  );
}
