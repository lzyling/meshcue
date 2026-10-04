import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { agentSocketPath } from "../../server/instance.mjs";

/* Ask the private agent socket which port listen(0) received. Reserving a port
   in advance and closing that listener leaves a race for another worktree. */
export async function browserServerUrl(child, dir, instance = null) {
  const socketPath = agentSocketPath(dir, instance);
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `Browser fixture exited: ${fs.readFileSync(path.join(dir, "server.log"), "utf8")}`,
      );
    try {
      const status = await new Promise((resolve, reject) => {
        const req = http.get({ socketPath, path: "/status" }, (res) => {
          let text = "";
          res.on("data", (part) => (text += part));
          res.on("end", () => {
            try {
              resolve(JSON.parse(text));
            } catch (error) {
              reject(error);
            }
          });
        });
        req.on("error", reject);
        req.setTimeout(1000, () =>
          req.destroy(new Error("Fixture readiness timed out")),
        );
      });
      if (status.network?.port)
        return `http://127.0.0.1:${status.network.port}`;
    } catch {
      /* Socket and HTTP listener start on adjacent turns. */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Browser fixture did not become ready: ${dir}`);
}

export function browserOrigin(url) {
  if (!process.env.REVIEW_BROWSER_ORIGIN) return url;
  const wanted = new URL(process.env.REVIEW_BROWSER_ORIGIN);
  wanted.port = new URL(url).port;
  return wanted.origin;
}
