import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { acquireBrowserLock } from "./browser-lock.mjs";

const abort = new AbortController();
let child;
const stop = (signal) => {
  abort.abort();
  child?.kill(signal);
};
const onInt = () => stop("SIGINT"),
  onTerm = () => stop("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
let release = () => {};
try {
  release = await acquireBrowserLock({ signal: abort.signal });
  fs.mkdirSync("tmp", { recursive: true });
  const run = fs.mkdtempSync(path.resolve("tmp/browser-run-"));
  const env = {
    ...process.env,
    MESHCUE_BROWSER_RUN: run,
    REVIEW_TEST_DIST: path.join(run, "dist"),
  };
  const execute = (args) =>
    new Promise((resolve, reject) => {
      abort.signal.throwIfAborted();
      child = spawn(process.execPath, args, { env, stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        child = null;
        code === 0
          ? resolve()
          : reject(new Error(`Browser command exited ${signal || code}`));
      });
    });
  console.log(`Browser evidence: ${run}`);
  await execute(["scripts/check-i18n.mjs"]);
  await execute([
    "node_modules/vite/bin/vite.js",
    "build",
    "--outDir",
    env.REVIEW_TEST_DIST,
  ]);
  await execute([
    "node_modules/@playwright/test/cli.js",
    "test",
    ...process.argv.slice(2),
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  release();
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
}
