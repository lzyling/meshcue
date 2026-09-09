import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(repo, "../..");
const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 1; i < args.length; i += 2)
  options[args[i].replace(/^--/, "")] = args[i + 1];
let endpoint, body;
if (command === "publish") {
  if (!args[0])
    throw new Error(
      "Usage: node scripts/reviewctl.mjs publish <GLB-or-STL> [--name title] [--version v1] [--source source-file] [--units mm]",
    );
  endpoint = "/publish";
  body = { file: path.relative(workspace, path.resolve(args[0])), ...options };
  if (body.source)
    body.source = path.relative(workspace, path.resolve(body.source));
} else if (command === "status") endpoint = "/status";
else if (command === "submissions") endpoint = "/submissions";
else if (command === "read") {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(args[0] || ""))
    throw new Error("Usage: read <submission-id>");
  endpoint = `/submissions/${args[0]}`;
} else if (command === "echo") {
  const file = fs.realpathSync(path.resolve(args[0] || ""));
  if (path.relative(workspace, file).startsWith(".."))
    throw new Error("回顯資料必須在工作區內。");
  body = JSON.parse(fs.readFileSync(file, "utf8"));
  endpoint = "/echo";
} else throw new Error("Commands: publish, status, submissions, read, echo");
const socketPath = path.join(
  path.resolve(process.env.REVIEW_DATA_DIR || path.join(repo, "runtime")),
  "agent.sock",
);
function call(route, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: route,
        method: payload ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const value = JSON.parse(data);
            if (res.statusCode >= 400)
              reject(new Error(value.error || "操作失敗"));
            else resolve(value);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", () => reject(new Error("審閱服務尚未啟動。")));
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
try {
  let result = await call(endpoint, body);
  if (command === "read") {
    // Read and parse the complete submission before emitting an explicit acknowledgment.
    result = await call("/read", {
      submissionId: result.id,
      versionId: result.versionId,
    });
  }
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
