import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmNodeShim } from "./npm-node-shim.mjs";

const source = fileURLToPath(new URL("../fake-openclaw.mjs", import.meta.url));
export function installFakeOpenClaw(bin, platform = process.platform) {
  const entry = path.join(
    bin,
    platform === "win32" ? "fake-openclaw.mjs" : "openclaw",
  );
  if (platform === "win32") {
    fs.copyFileSync(source, entry);
    fs.writeFileSync(
      path.join(bin, "openclaw.cmd"),
      npmNodeShim("fake-openclaw.mjs"),
    );
  } else {
    fs.copyFileSync(source, entry);
    fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  }
  return entry;
}
