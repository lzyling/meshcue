import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
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
