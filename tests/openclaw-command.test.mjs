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
const shim = (entry = "entry.mjs") =>
  `@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\${entry}" %*\r\n`;

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
test("npm modern and legacy shims resolve quoted JS entry, including spaces", () => {
  const file = "C:\\Program Files\\npm\\openclaw.cmd";
  const expected =
    "C:\\Program Files\\npm\\node_modules\\openclaw\\openclaw.mjs";
  assert.equal(
    npmShimEntry(shim("node_modules\\openclaw\\openclaw.mjs"), file),
    expected,
  );
  assert.equal(
    npmShimEntry(
      shim("node_modules\\openclaw\\openclaw.mjs").replace(
        '"%_prog%" ',
        '"%_prog%"  ',
      ),
      file,
    ),
    expected,
  );
  const old =
    '@"%~dp0\\node.exe" "%~dp0\\node_modules\\openclaw\\openclaw.mjs" %*\r\n"node" "%~dp0\\node_modules\\openclaw\\openclaw.mjs" %*';
  assert.equal(npmShimEntry(old, file), expected);
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
