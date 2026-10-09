import path from "node:path";
import crypto from "node:crypto";

// Test transport follows the host OS, independently of simulated product logic.
export function ipcAddress(runtime, name, platform = process.platform) {
  return platform === "win32"
    ? `\\\\.\\pipe\\meshcue-test-${crypto.randomBytes(32).toString("hex")}`
    : path.join(runtime, name);
}
