// A detached server can outlive node:test and turn a green suite into a leak.
// Keep a private run ledger, wait for normal shutdown, then fail and reclaim
// only matching processes from this run. The birth time plus command protects
// against a recorded PID being reused after its server was killed abruptly.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { processIdentity } from "../tests/helpers/track-servers.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync("tmp", { recursive: true });
const run = fs.mkdtempSync(path.resolve("tmp/node-run-"));
fs.chmodSync(run, 0o700);
const preload = pathToFileURL(
  path.resolve("tests/helpers/track-servers.mjs"),
).href;
const files = process.argv.slice(2);
// A guard regression invokes a nested run; Node refuses --test when this
// internal worker marker is inherited, silently leaving its fixtures unrun.
const { NODE_TEST_CONTEXT: _testContext, ...environment } = process.env;
const child = spawn(
  process.execPath,
  [
    "--test",
    ...(files.length
      ? files
      : fs
          .readdirSync("tests")
          .filter((f) => f.endsWith(".test.mjs"))
          .map((f) => `tests/${f}`)),
  ],
  {
    stdio: "inherit",
    env: {
      ...environment,
      MESHCUE_NODE_TEST_RUN: run,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${preload}`,
    },
  },
);
let interrupted;
const stop = (signal) => {
  interrupted = signal;
  child.kill(signal);
};
const onInt = () => stop("SIGINT"),
  onTerm = () => stop("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
try {
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = interrupted ? 1 : code;
} finally {
  const matching = () =>
    fs
      .readdirSync(run)
      .filter((f) => f.endsWith(".json"))
      .flatMap((file) => {
        let record;
        try {
          record = JSON.parse(fs.readFileSync(path.join(run, file), "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
        return record.identity &&
          processIdentity(record.pid) === record.identity
          ? [record]
          : [];
      });
  let leaked = matching();
  for (let i = 0; leaked.length && i < 30; i++) {
    await delay(100);
    leaked = matching();
  }
  if (leaked.length) {
    process.exitCode = 1;
    console.error(
      `MeshCue server leak: ${leaked.length} process(es) survived the test run.`,
    );
    for (const record of leaked) {
      console.error(`  PID ${record.pid}: ${record.runtime}`);
      try {
        process.kill(record.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    for (let i = 0; matching().length && i < 30; i++) await delay(100);
    for (const record of matching()) {
      try {
        process.kill(record.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    for (let i = 0; matching().length && i < 30; i++) await delay(100);
    if (matching().length)
      console.error(`Server cleanup did not finish; inspect ${run}`);
  } else console.log("MeshCue server guard: no leftover servers.");
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
  fs.rmSync(run, { recursive: true, force: true });
}
