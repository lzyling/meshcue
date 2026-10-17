import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);
async function fixture(t, mode) {
  const workspace = fs.mkdtempSync(path.resolve("tmp/cleanup-server-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  try {
    await execute(
      process.execPath,
      ["scripts/test-node.mjs", "tests/fixtures/server-cleanup.mjs"],
      {
        env: {
          ...process.env,
          MESHCUE_CLEANUP_FIXTURE: workspace,
          MESHCUE_CLEANUP_MODE: mode,
        },
        timeout: 20000,
      },
    );
    assert.fail("the controlled failing run must fail");
  } catch (error) {
    assert.equal(error.code, 1);
    return error.stdout + error.stderr;
  }
}

test("the Node run guard detects and reclaims its deliberately leaked server", async (t) => {
  const output = await fixture(t, "leak");
  assert.match(output, /MeshCue server leak: 1 process/);
  const pid = Number(output.match(/PID (\d+):/)[1]);
  // The detached server is not our child. On Linux its adopting init/subreaper
  // owns waitpid, so a killed server can remain a zombie even after the guard
  // has finished: kill(pid, 0) still succeeds, but no server code can run.
  // Allow a bounded exit delay, never accepting a live (including stopped)
  // process as cleanup. ps reports the reaping parent's PID for diagnostics.
  const deadline = performance.now() + 3000;
  let state = "unknown";
  while (true) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    try {
      const { stdout } = await execute("ps", [
        "-p",
        String(pid),
        "-o",
        "stat=",
        "-o",
        "ppid=",
      ]);
      state = stdout.trim();
      if (/^Z\S*\s+\d+$/.test(state)) {
        t.diagnostic(`Server PID ${pid} exited; zombie state/parent: ${state}`);
        return;
      }
    } catch (error) {
      // ps can race with the adopting parent's waitpid. Only ESRCH proves
      // disappearance; otherwise retain the error rather than hiding it.
      try {
        process.kill(pid, 0);
      } catch (probeError) {
        if (probeError.code === "ESRCH") return;
        throw probeError;
      }
      throw error;
    }
    assert.ok(
      performance.now() < deadline,
      `Server PID ${pid} is still live after cleanup (state/parent: ${state})`,
    );
    await delay(50);
  }
});

test("managed test servers exit after assertion failures and stop errors", async (t) => {
  for (const mode of ["assertion", "stop-error"]) {
    const output = await fixture(t, mode);
    assert.match(output, /deliberate assertion failure/);
    if (mode === "stop-error") assert.match(output, /deliberate stop failure/);
    assert.match(output, /MeshCue server guard: no leftover servers/);
    assert.doesNotMatch(output, /MeshCue server leak:/);
  }
});
