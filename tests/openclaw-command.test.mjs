import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  npmShimEntry,
  resolveOpenClaw,
  execOpenClaw,
  execOpenClawSync,
} from "../server/openclaw-command.mjs";
import { npmNodeShim } from "./helpers/npm-node-shim.mjs";
import { installFakeOpenClaw } from "./helpers/fake-openclaw.mjs";

function fixture(t) {
  fs.mkdirSync("tmp", { recursive: true });
  const dir = fs.mkdtempSync(path.resolve("tmp/openclaw-command-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    resolution: {
      platform: "win32",
      pathApi: path,
      env: { Path: dir, Pathext: ".EXE;.CMD" },
    },
  };
}
const shim = (entry = "entry.mjs") => npmNodeShim(entry);

test("POSIX leaves command lookup unchanged", () => {
  assert.deepEqual(resolveOpenClaw({ platform: "linux", env: {} }), {
    file: "openclaw",
    prefix: [],
  });
});
test("Windows searches PATH directories first and PATHEXT in order", (t) => {
  const { dir, resolution } = fixture(t);
  fs.writeFileSync(path.join(dir, "openclaw.exe"), "");
  fs.writeFileSync(path.join(dir, "openclaw.com"), "");
  fs.writeFileSync(path.join(dir, "openclaw.cmd"), shim());
  fs.writeFileSync(path.join(dir, "entry.mjs"), "");
  assert.equal(
    resolveOpenClaw(resolution).file,
    path.join(dir, "openclaw.exe"),
  );
  resolution.env.Pathext = ".COM;.EXE;.CMD";
  assert.equal(
    resolveOpenClaw(resolution).file,
    path.join(dir, "openclaw.com"),
  );
  resolution.env.Pathext = ".CMD;.EXE";
  assert.deepEqual(resolveOpenClaw(resolution).prefix, [
    path.join(dir, "entry.mjs"),
  ]);
  const second = path.join(dir, "second");
  fs.mkdirSync(second);
  fs.writeFileSync(path.join(second, "openclaw.exe"), "");
  resolution.env.Path = `"${dir}";${second}`;
  assert.deepEqual(resolveOpenClaw(resolution).prefix, [
    path.join(dir, "entry.mjs"),
  ]);
});
function assertNpmLayouts(version) {
  const file = "C:\\Program Files\\npm\\openclaw.cmd";
  assert.equal(
    npmShimEntry(
      npmNodeShim("node_modules\\openclaw\\openclaw.mjs", version),
      file,
    ),
    "C:\\Program Files\\npm\\node_modules\\openclaw\\openclaw.mjs",
  );
  assert.equal(
    npmShimEntry(
      npmNodeShim("..\\openclaw\\openclaw.mjs", version),
      "C:\\project\\node_modules\\.bin\\openclaw.cmd",
    ),
    "C:\\project\\node_modules\\openclaw\\openclaw.mjs",
  );
}
test("real cmd-shim 8.0.0 resolves global and local npm layouts", () => {
  assertNpmLayouts("8.0.0");
});
test("real cmd-shim 9.0.2 resolves global and local npm layouts", () => {
  assertNpmLayouts("9.0.2");
});
test("legacy single-line quoted Node shim resolves entry including spaces", () => {
  for (const node of ["%~dp0\\node.exe", "node"]) {
    assert.equal(
      npmShimEntry(
        `@"${node}" "%~dp0\\node_modules\\openclaw\\openclaw.mjs" %*\r\n`,
        "C:\\Program Files\\npm\\openclaw.cmd",
      ),
      "C:\\Program Files\\npm\\node_modules\\openclaw\\openclaw.mjs",
    );
  }
});
test("whole-file whitelist rejects extra commands and altered structure", () => {
  for (const version of ["8.0.0", "9.0.2"]) {
    const content = npmNodeShim("entry.mjs", version);
    for (const invalid of [
      '@echo off\r\nexit /b 1\r\n"node" "%dp0%\\..\\outside.mjs" %*',
      "exit /b 1\r\n" + content,
      content + "echo extra\r\n",
      content.replace("CALL :find_dp0", "CALL :find_dp0\r\nexit /b 1"),
      content.replace('SET "_prog=node"', 'SET "_prog=evil"'),
      content.replace("GOTO start", "GOTO elsewhere"),
      content.replace('"%_prog%"  ', '"%_prog%" --extra '),
    ])
      assert.throws(() => npmShimEntry(invalid, "C:\\npm\\openclaw.cmd"), {
        code: "OPENCLAW_UNSUPPORTED_SHIM",
      });
    assert.equal(
      npmShimEntry("\r\n" + content + "\r\n", "C:\\npm\\openclaw.cmd"),
      "C:\\npm\\entry.mjs",
    );
  }
});
test("rooted, UNC, drive and variable entry suffixes fail before resolve", () => {
  for (const entry of [
    "C:outside.mjs",
    "C:\\outside.mjs",
    "\\\\server\\share\\x.mjs",
    "\\x.mjs",
    "/x.mjs",
    "%EVIL%.mjs",
    "entry.txt",
  ]) {
    for (const version of ["8.0.0", "9.0.2"]) {
      assert.throws(
        () =>
          npmShimEntry(npmNodeShim(entry, version), "C:\\npm\\openclaw.cmd"),
        { code: "OPENCLAW_UNSUPPORTED_SHIM" },
      );
    }
  }
});
test("unrecognized, ambiguous, variable-based, missing-entry and batch shims fail closed", (t) => {
  const { dir, resolution } = fixture(t);
  const file = path.join(dir, "openclaw.cmd");
  fs.writeFileSync(path.join(dir, "entry.mjs"), "");
  fs.writeFileSync(path.join(dir, "openclaw.exe"), "");
  resolution.env.Pathext = ".CMD;.EXE";
  for (const content of [
    "@node entry.mjs %*",
    shim() + shim("other.js"),
    shim("%EVIL%.js"),
    shim("missing.js"),
    "@echo %*",
  ]) {
    fs.writeFileSync(file, content);
    assert.throws(() => resolveOpenClaw(resolution), {
      code: "OPENCLAW_UNSUPPORTED_SHIM",
    });
  }
  fs.writeFileSync(path.join(dir, "openclaw.bat"), "@echo %*");
  resolution.env.Pathext = ".BAT;.CMD;.EXE";
  assert.throws(() => resolveOpenClaw(resolution), {
    code: "OPENCLAW_UNSUPPORTED_SHIM",
  });
});
test("not found is ENOENT and next resolution recovers without a negative cache", (t) => {
  const { dir, resolution } = fixture(t);
  fs.writeFileSync(path.join(dir, "openclaw.ps1"), "");
  assert.throws(() => resolveOpenClaw(resolution), {
    code: "ENOENT",
    message: "the openclaw command was not found",
  });
  installFakeOpenClaw(dir, "win32");
  assert.deepEqual(resolveOpenClaw(resolution).prefix, [
    path.join(dir, "fake-openclaw.mjs"),
  ]);
});
test("Windows async/sync execution preserves shell metacharacters and newline as argv", async (t) => {
  const { dir, resolution } = fixture(t);
  fs.writeFileSync(path.join(dir, "openclaw.cmd"), shim());
  fs.writeFileSync(
    path.join(dir, "entry.mjs"),
    "console.log(JSON.stringify(process.argv.slice(2)))",
  );
  const argv = [
    "gateway",
    "--params",
    JSON.stringify({ message: '& | ^ % " < >\nline two' }),
    '& | ^ % " < >\nraw',
    "",
    "space here",
  ];
  const { stdout } = await execOpenClaw(argv, { shell: true }, resolution);
  assert.deepEqual(JSON.parse(stdout), argv);
  assert.deepEqual(
    JSON.parse(execOpenClawSync(argv, {}, resolution).toString()),
    argv,
  );
});
test("nonzero stdout and timeout remain available to callers without shell fallback", async (t) => {
  const { dir, resolution } = fixture(t);
  fs.writeFileSync(path.join(dir, "openclaw.cmd"), shim());
  const entry = path.join(dir, "entry.mjs");
  fs.writeFileSync(
    entry,
    'console.log(JSON.stringify({error:{code:"REFUSED",message:"host reason"}})); process.exitCode=2;',
  );
  await assert.rejects(
    execOpenClaw([], {}, resolution),
    (error) =>
      error.code === 2 &&
      JSON.parse(error.stdout).error.message === "host reason",
  );
  fs.writeFileSync(entry, "setTimeout(()=>{}, 10000)");
  await assert.rejects(
    execOpenClaw([], { timeout: 100 }, resolution),
    (error) => error.killed === true,
  );
});
