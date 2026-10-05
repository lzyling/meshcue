// Preloaded only by scripts/test-node.mjs, including in detached descendants.
// Recording in the server itself covers helpers, CLI/MCP and bundled managers
// without adding a test hook to production code or trusting a process scan.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function processIdentity(pid) {
  try {
    return execFileSync(
      "ps",
      ["-p", String(pid), "-o", "lstart=", "-o", "command="],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    return null;
  }
}
const run = process.env.MESHCUE_NODE_TEST_RUN;
const entry = process.argv[1]?.replaceAll("\\", "/") || "";
if (
  run &&
  process.env.REVIEW_DATA_DIR &&
  /\/(?:server\/index|runtime\/server)\.mjs$/.test(path.resolve(entry))
) {
  const record = path.join(run, `${process.pid}.json`);
  fs.writeFileSync(
    record,
    JSON.stringify({
      pid: process.pid,
      identity: processIdentity(process.pid),
      runtime: process.env.REVIEW_DATA_DIR,
    }),
    { mode: 0o600 },
  );
  process.on("exit", () => fs.rmSync(record, { force: true }));
}
