import fs from "node:fs";
import path from "node:path";
import { processIdentity } from "./track-servers.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A test owns its fresh project and must reclaim its child even if an assertion
// left presence busy or normal stop failed. Read the lock before touching any
// fixture files, retain process identity, and never conceal the stop error.
export async function stopManagedReview(manager, project) {
  const p = manager.project(project);
  const lock = path.join(p.runtime, "instance.lock");
  if (!fs.existsSync(lock)) return;
  const { pid } = JSON.parse(fs.readFileSync(lock, "utf8"));
  const identity = processIdentity(pid);
  const alive = () => identity && processIdentity(pid) === identity;
  try {
    await manager.execute({ action: "stop", project });
  } finally {
    if (alive()) {
      process.kill(pid, "SIGTERM");
      for (let i = 0; alive() && i < 30; i++) await delay(100);
      if (alive()) {
        process.kill(pid, "SIGKILL");
        for (let i = 0; alive() && i < 30; i++) await delay(100);
      }
      if (alive()) throw new Error(`Test server ${pid} did not exit`);
    }
  }
}
