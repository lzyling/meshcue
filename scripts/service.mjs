import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.resolve(
  process.env.REVIEW_DATA_DIR || path.join(repo, "runtime"),
);
const port = Number(process.env.PORT || 43173),
  pidFile = path.join(runtime, "server.pid");
const command = process.argv[2] || "status";
async function health() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await response.json();
    return data.app === "3d-agent-review" ? data : null;
  } catch {
    return null;
  }
}
async function stop() {
  const current = await health();
  if (!current) {
    console.log("審閱服務未在此連接埠運行。");
    return;
  }
  if (
    !fs.existsSync(pidFile) ||
    Number(fs.readFileSync(pidFile, "utf8")) !== current.pid
  )
    throw new Error("PID 不符；沒有停止任何進程。");
  process.kill(current.pid, "SIGTERM");
  for (let i = 0; i < 40; i++) {
    if (!(await health())) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("服務尚未完成停止，沒有強制中止。");
}
async function start() {
  if (await health()) {
    console.log(`審閱服務已啟動：http://127.0.0.1:${port}/`);
    return;
  }
  fs.mkdirSync(runtime, { recursive: true });
  const log = fs.openSync(path.join(runtime, "server.log"), "a", 0o600);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env: process.env,
    stdio: ["ignore", log, log],
    detached: true,
  });
  child.unref();
  fs.closeSync(log);
  fs.writeFileSync(pidFile, String(child.pid) + "\n", { mode: 0o600 });
  for (let i = 0; i < 60; i++) {
    if (await health()) {
      console.log(`審閱服務已啟動：http://127.0.0.1:${port}/`);
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("服務未啟動；請查看 runtime/server.log。");
}
if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "restart") {
  await stop();
  await start();
} else if (command === "status")
  console.log(JSON.stringify((await health()) || { ok: false }, null, 2));
else throw new Error("Commands: start, stop, restart, status");
