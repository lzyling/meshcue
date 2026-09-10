import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function startReview(
  t,
  { protectedAccess = false, origin, host = "127.0.0.1" } = {},
) {
  const repo = process.cwd();
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "http-review-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync(
    path.join(repo, "tests/fake-openclaw.mjs"),
    path.join(bin, "openclaw"),
  );
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  if (origin)
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ origin }));
  let port = "0";
  const launch = () =>
    spawn(process.execPath, ["server/index.mjs"], {
      cwd: repo,
      env: {
        ...process.env,
        PORT: port,
        REVIEW_HOST: host,
        REVIEW_DATA_DIR: dir,
        REVIEW_MEDIA_DIR: path.join(dir, "models"),
        REVIEW_SESSION_KEY: origin ? "" : "test-internal-http-session",
        REVIEW_BRIDGE: "on",
        REVIEW_ACCESS: protectedAccess ? "required" : "",
        REVIEW_ALLOWED_HOSTS: "review.test",
        REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
        REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
      stdio: "ignore",
    });
  let child = launch();
  async function stopChild() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  }
  t.after(async () => {
    await stopChild();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  function ipc(route, body) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath: path.join(dir, "agent.sock"),
          path: route,
          method: body === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          let data = "";
          res.on("data", (part) => {
            data += part;
          });
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              reject(new Error("Invalid fixture response"));
            }
          });
        },
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function waitReady() {
    let status;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("Isolated review failed to start");
      try {
        status = await ipc("/status");
        if (status.body.network?.port) break;
      } catch {
        /* starting */
      }
      await delay(30);
    }
    if (!status?.body?.network?.port)
      throw new Error("Isolated review readiness timed out");
    return status;
  }
  const status = await waitReady();
  port = String(status.body.network.port);
  const url = `http://${status.body.network.host}:${status.body.network.port}`;
  async function restart() {
    await stopChild();
    child = launch();
    await waitReady();
  }
  function api(route, { method = "GET", body, cookie, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        new URL(`${url}/api/${route}`),
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Review-Client": "1",
            ...(payload
              ? { "Content-Length": Buffer.byteLength(payload) }
              : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (part) => chunks.push(part));
          res.on("end", () => {
            const raw = Buffer.concat(chunks);
            const text = raw.toString();
            let value;
            try {
              value = JSON.parse(text);
            } catch {
              value = text;
            }
            const responseHeaders = new Headers();
            for (const [key, values] of Object.entries(res.headers))
              for (const value of Array.isArray(values) ? values : [values])
                if (value !== undefined) responseHeaders.append(key, value);
            resolve({
              status: res.statusCode,
              body: value,
              raw,
              headers: responseHeaders,
            });
          });
        },
      );
      req.setTimeout(5000, () =>
        req.destroy(new Error("Fixture HTTP request timed out")),
      );
      req.on("error", reject);
      req.end(payload);
    });
  }
  async function publish(
    version = "v1",
    name = "parametric-bracket.glb",
    originValue,
  ) {
    const r = await ipc("/publish", {
      file: `media/3d/3d-agent-review/samples/${name}`,
      name: "Isolated review",
      version,
      ...(originValue ? { origin: originValue } : {}),
    });
    if (r.status !== 200)
      throw new Error("Isolated fixture model failed to publish");
    return r.body.model;
  }
  return { repo, dir, url, ipc, api, publish, restart };
}
