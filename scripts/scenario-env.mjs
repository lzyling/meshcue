import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentSocketPath } from "../server/instance.mjs";
import { browserServerUrl } from "../tests/helpers/browser-server.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));

export async function startScenario({
  fixture,
  dist = path.join(repo, "dist"),
  runRoot = path.join(repo, "tmp/scenarios"),
}) {
  if (!fixture) throw new Error("A fixture model path is required");
  fs.mkdirSync(runRoot, { recursive: true });
  const run = fs.mkdtempSync(path.join(runRoot, "run-"));
  const workspace = path.join(run, "workspace"),
    data = path.join(run, "data");
  fs.mkdirSync(workspace);
  fs.mkdirSync(data);
  const model = path.join(workspace, path.basename(fixture));
  fs.copyFileSync(path.resolve(fixture), model);
  // Managed socket names are short even in deeply nested worktrees on macOS.
  // This is only an isolated fixture identity; no real host or notifier is used.
  const instance = {
    schema: 1,
    id: crypto.randomUUID(),
    projectId: crypto.randomBytes(16).toString("hex"),
  };
  fs.writeFileSync(
    path.join(data, "config.json"),
    JSON.stringify({ instance }),
  );
  const log = fs.openSync(path.join(data, "server.log"), "a");
  const child = spawn(process.execPath, [path.join(repo, "server/index.mjs")], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: "0",
      REVIEW_HOST: "127.0.0.1",
      REVIEW_WORKSPACE: workspace,
      REVIEW_DATA_DIR: data,
      REVIEW_MEDIA_DIR: path.join(data, "models"),
      REVIEW_DIST_DIR: path.resolve(dist),
      REVIEW_BRIDGE: "off",
      REVIEW_UPDATE_CHECK: "off",
      REVIEW_ACCESS: "",
      REVIEW_SESSION_KEY: "",
      REVIEW_LOG_LEVEL: "info",
    },
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  let stopping;
  const stop = () =>
    (stopping ||= (async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    })());
  const ipc = (route, body) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath: agentSocketPath(data, instance),
          path: route,
          method: body ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          let text = "";
          res.on("data", (part) => (text += part));
          res.on("end", () => {
            try {
              const value = JSON.parse(text);
              if (res.statusCode !== 200) throw new Error(`${route}: ${text}`);
              resolve(value);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on("error", reject);
      req.setTimeout(30000, () =>
        req.destroy(new Error("Scenario IPC timed out")),
      );
      req.end(body ? JSON.stringify(body) : undefined);
    });
  try {
    const url = await browserServerUrl(child, data, instance);
    await ipc("/publish", {
      file: path.basename(model),
      name: "Scenario fixture",
      version: "fixture",
    });
    fs.writeFileSync(
      path.join(run, "environment.json"),
      JSON.stringify(
        {
          url,
          run,
          workspace,
          data,
          fixture: path.resolve(fixture),
          dist: path.resolve(dist),
        },
        null,
        2,
      ),
    );
    return { url, run, workspace, data, stop, ipc };
  } catch (error) {
    await stop();
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [fixture, dist] = process.argv.slice(2);
  const environment = await startScenario({ fixture, dist });
  console.log(`Review URL: ${environment.url}\nEvidence: ${environment.run}`);
  const stop = async () => {
    await environment.stop();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
