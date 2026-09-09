import express from "express";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ReviewStore, ReviewError, atomicJson } from "./store.mjs";
import { importModel, MAX_TRIANGLES } from "./models.mjs";
import { OpenClawBridge } from "./bridge.mjs";

export const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const workspace = path.resolve(repo, "../..");
const runtime = path.resolve(
  process.env.REVIEW_DATA_DIR || path.join(repo, "runtime"),
);
const mediaDir = path.resolve(
  process.env.REVIEW_MEDIA_DIR ||
    path.join(workspace, "media/3d/3d-agent-review"),
);
fs.mkdirSync(runtime, { recursive: true });
const instanceFile = path.join(runtime, "instance.lock");
if (fs.existsSync(instanceFile)) {
  const previous = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
  let live = false;
  try {
    process.kill(previous.pid, 0);
    live = true;
  } catch {}
  if (live) throw new Error("此審閱服務已在運行，請勿重複啟動。");
  fs.unlinkSync(instanceFile);
}
const instanceHandle = fs.openSync(instanceFile, "wx", 0o600);
fs.writeFileSync(instanceHandle, JSON.stringify({ pid: process.pid }));
fs.closeSync(instanceHandle);
process.on("exit", () => {
  try {
    if (JSON.parse(fs.readFileSync(instanceFile, "utf8")).pid === process.pid)
      fs.unlinkSync(instanceFile);
  } catch {}
});
const configFile = path.join(runtime, "config.json");
const config = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};
const bridge = new OpenClawBridge(
  process.env.REVIEW_SESSION_KEY || config.sessionKey || "",
  {
    enabled:
      process.env.REVIEW_BRIDGE !== "off" &&
      !!(process.env.REVIEW_SESSION_KEY || config.sessionKey),
  },
);
const store = new ReviewStore(runtime);
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-review-client"] !== "1"
  )
    return res.status(403).json({ error: "請使用審閱工作台操作。" });
  next();
});
app.use(express.json({ limit: "16mb" }));
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const vec3 = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const annotation = z.discriminatedUnion("type", [
  z
    .object({
      id,
      type: z.literal("pin"),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      meshId: id,
      faceIndex: z.number().int().min(0),
      sourceFaceIndex: z.number().int().min(0).optional(),
      position: vec3,
      normal: vec3,
      barycentric: vec3,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("region"),
      coverage: z.enum(["brush-v1", "source-v1"]).optional(),
      label: z.string().max(12),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      faces: z.record(id, z.array(z.number().int().min(0)).max(MAX_TRIANGLES)),
      surfacePatches: z
        .array(
          z
            .object({
              meshId: id,
              faceIndex: z.number().int().min(0),
              sourceFaceIndex: z.number().int().min(0),
              vertices: z.tuple([vec3, vec3, vec3]),
            })
            .strict(),
        )
        .max(MAX_TRIANGLES)
        .optional(),
    })
    .strict(),
]);
const owner = z.object({ versionId: id, clientId: id });
const camera = z.object({ position: vec3, target: vec3 }).nullable();
const draftSchema = owner.extend({
  revision: z.number().int().min(0),
  labelCursor: z.number().int().min(0).max(1000000).optional(),
  annotations: z.array(annotation).max(200),
  camera,
});
function stateFor(clientId, full = false) {
  const state = store.publicState(clientId);
  delete state.messages;
  if (!full && state.draft)
    state.draft = {
      ...state.draft,
      annotations: undefined,
      camera: undefined,
      annotationCount: state.draft.annotations.length,
    };
  return {
    ...state,
    bridgeEnabled: bridge.enabled,
    limits: { maxTriangles: MAX_TRIANGLES, maxBytes: 80 * 1024 * 1024 },
  };
}
function saveManifest(versionId, meshes) {
  const valid = z
    .array(
      z
        .object({
          id,
          name: z.string().max(200),
          triangles: z.number().int().positive().max(MAX_TRIANGLES),
          sourceTriangles: z.number().int().positive().max(MAX_TRIANGLES),
          surfaceAlgorithm: z.literal("midpoint-v1-edge0.07"),
          matrixWorld: z.array(z.number().finite()).length(16),
        })
        .strict(),
    )
    .min(1)
    .max(2000)
    .parse(meshes);
  if (
    new Set(valid.map((x) => x.id)).size !== valid.length ||
    valid.reduce((n, x) => n + x.triangles, 0) > MAX_TRIANGLES
  )
    throw new ReviewError("模型網格超出限制。", 400);
  atomicJson(path.join(runtime, "manifests", `${versionId}.json`), {
    versionId,
    meshes: valid,
  });
}
function validateAnnotations(versionId, annotations) {
  const manifestFile = path.join(runtime, "manifests", `${versionId}.json`);
  if (!fs.existsSync(manifestFile))
    throw new ReviewError("模型尚未完成載入。", 409, "NOT_READY");
  const meshes = new Map(
    JSON.parse(fs.readFileSync(manifestFile, "utf8")).meshes.map((m) => [
      m.id,
      m,
    ]),
  );
  const usedIds = new Set();
  let faceCount = 0,
    patchCount = 0;
  for (const a of annotations) {
    if (usedIds.has(a.id)) throw new ReviewError("標注識別碼重複。", 400);
    usedIds.add(a.id);
    const groups = a.type === "pin" ? { [a.meshId]: [a.faceIndex] } : a.faces;
    for (const [meshId, faces] of Object.entries(groups)) {
      if (
        !meshes.has(meshId) ||
        faces.some(
          (f) =>
            f >=
            (a.type === "region" && a.coverage === "source-v1"
              ? meshes.get(meshId).sourceTriangles
              : meshes.get(meshId).triangles),
        )
      )
        throw new ReviewError(
          "標注與目前模型網格不符，沒有覆蓋草稿。",
          400,
          "BAD_GEOMETRY",
        );
      faceCount += faces.length;
    }
    if (
      a.type === "pin" &&
      a.sourceFaceIndex !== undefined &&
      a.sourceFaceIndex >= meshes.get(a.meshId).sourceTriangles
    )
      throw new ReviewError("點標籤的來源面不符。", 400, "BAD_GEOMETRY");
    if (a.type === "region") {
      const patches = a.surfacePatches || [];
      const selected = new Set(
        Object.entries(a.faces).flatMap(([meshId, faces]) =>
          faces.map((f) => `${meshId}:${f}`),
        ),
      );
      if (
        (!["brush-v1", "source-v1"].includes(a.coverage) &&
          patches.length !== selected.size) ||
        new Set(patches.map((p) => `${p.meshId}:${p.faceIndex}`)).size !==
          selected.size ||
        patches.some(
          (p) =>
            !selected.has(`${p.meshId}:${p.faceIndex}`) ||
            p.sourceFaceIndex >= meshes.get(p.meshId).sourceTriangles ||
            (a.coverage === "source-v1" && p.faceIndex !== p.sourceFaceIndex),
        )
      )
        throw new ReviewError(
          "塗選表面資料不完整，草稿沒有被覆蓋。",
          400,
          "BAD_GEOMETRY",
        );
    }
    patchCount += a.surfacePatches?.length || 0;
    if (patchCount > 40000)
      throw new ReviewError("本輪筆跡已達上限，請分批提交。", 400);
    if (faceCount > 20000)
      throw new ReviewError("本輪標注上限為 2 萬個審閱面，請分批提交。", 400);
  }
}
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    app: "3d-agent-review",
    version: "0.3.0",
    pid: process.pid,
  }),
);
app.get("/api/state", (req, res) =>
  res.json(stateFor(String(req.query.clientId || ""), req.query.full === "1")),
);
app.get("/api/models/:filename", (req, res) => {
  if (!/^[a-f0-9]{64}\.(glb|stl)$/.test(req.params.filename))
    throw new ReviewError("找不到模型。", 404);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(req.params.filename, { root: mediaDir });
});
app.post("/api/ready", (req, res) => {
  const p = owner
    .extend({
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      meshes: z.array(z.unknown()),
    })
    .parse(req.body);
  store.assertVersion(p.versionId);
  if (p.sha256 !== store.state.active.sha256)
    throw new ReviewError("載入檔案與 Agent 交付不符。", 409, "HASH_MISMATCH");
  saveManifest(p.versionId, p.meshes);
  store.state.viewerReceipts ||= {};
  store.state.viewerReceipts[p.clientId] = {
    versionId: p.versionId,
    sha256: p.sha256,
    loadedAt: Date.now(),
  };
  store.save();
  res.json({ ready: true });
});
app.post("/api/review/begin", (req, res) => {
  const p = owner.parse(req.body);
  if (store.state.viewerReceipts?.[p.clientId]?.versionId !== p.versionId)
    throw new ReviewError("請等模型完成載入及版本核對。", 409, "NOT_READY");
  store.acquire(p.versionId, p.clientId);
  res.json(stateFor(p.clientId, true));
});
app.post("/api/review/heartbeat", (req, res) => {
  const p = z.object({ clientId: id }).parse(req.body);
  store.heartbeat(p.clientId);
  res.json({ ok: true });
});
app.post("/api/review/resume", (req, res) => {
  const p = owner.parse(req.body);
  store.resume(p.versionId, p.clientId);
  res.json(stateFor(p.clientId, true));
});
app.put("/api/draft", (req, res) => {
  const p = draftSchema.parse(req.body);
  validateAnnotations(p.versionId, p.annotations);
  res.json(store.updateDraft(p));
});
app.post("/api/review/finish", (req, res) => {
  const p = owner.parse(req.body);
  store.finish(p.versionId, p.clientId);
  res.json(stateFor(p.clientId, true));
});
const feedbackFlights = new Map();
app.post("/api/feedback", async (req, res) => {
  const p = owner
    .extend({ revision: z.number().int().min(0), submissionId: id })
    .parse(req.body);
  let item = store.createSubmission(p);
  if (!item.meshManifest) {
    item.meshManifest = JSON.parse(
      fs.readFileSync(
        path.join(runtime, "manifests", `${p.versionId}.json`),
        "utf8",
      ),
    );
    store.submissionStatus(item.id, item.status);
  }
  if (item.status === "accepted")
    return res.json({ ...item, annotations: undefined });
  if (!feedbackFlights.has(item.id)) {
    feedbackFlights.set(
      item.id,
      (async () => {
        const localFile = path.join(runtime, "submissions", `${item.id}.json`);
        const summary = item.annotations
          .map((a) =>
            a.type === "pin"
              ? `${a.label}：點標籤，${a.meshId}／面 ${a.faceIndex}`
              : `${a.color} 塗抹區域（區域識別 ${a.id}）：${["brush-v1", "source-v1"].includes(a.coverage) ? "實際表面筆跡" : "舊版整面標記"}；不是編號點標籤，按顏色及位置辨認`,
          )
          .join("\n");
        const message = `[3D 審閱標記提交 ${item.id}]\n模型：${item.model.name}／${item.model.version}；版本 ${item.versionId}；SHA256 ${item.model.sha256}。\n${summary}\n\n完整三維標注與相機資料已保存於 ${localFile}。Agent 操作說明：${path.join(repo, "AGENT-INTERFACE.md")}。\n這是使用者按下「交畀 Agent」提交的一批位置標記，不等於修改指令。請先用 node ${path.join(repo, "scripts/reviewctl.mjs")} read ${item.id} 讀取完整提交並回傳讀取回執，再確認收到；若原會話尚未有對應說明，詢問各標記含意及修改要求，不自行猜測。不要發 Telegram 或其他外部訊息。使用者尚未結束審閱，不能強行替換模型。`;
        store.submissionStatus(item.id, "sending");
        try {
          const result = await bridge.send(message, `3d-feedback-${item.id}`);
          store.submissionStatus(item.id, "accepted", {
            runId: result.runId || null,
            acceptedAt: Date.now(),
          });
          try {
            const history = await bridge.history(item.createdAt - 5000);
            if (
              history.messages.some(
                (m) =>
                  m.role === "user" &&
                  m.text.includes(`[3D 審閱標記提交 ${item.id}]`),
              )
            )
              store.submissionStatus(item.id, "accepted", {
                deliveredAt: Date.now(),
              });
          } catch {
            /* Acceptance is real, but delivery remains unconfirmed. */
          }
          const { annotations, ...receipt } = item;
          return receipt;
        } catch {
          store.submissionStatus(item.id, "unconfirmed", {
            error: "尚未確認交到 OpenClaw；標注已保存在本機。",
          });
          throw new ReviewError(
            "未能確認送達；標注已保存。恢復連線後可用同一提交重試，不會重建標記。",
            502,
            "DELIVERY_UNCONFIRMED",
          );
        }
      })().finally(() => feedbackFlights.delete(item.id)),
    );
  }
  res.json(await feedbackFlights.get(item.id));
});
app.get("/api/submissions/:id", (req, res) => {
  const submissionId = id.parse(req.params.id);
  const file = path.join(runtime, "submissions", `${submissionId}.json`);
  if (!fs.existsSync(file)) throw new ReviewError("找不到提交。", 404);
  res.download(`${submissionId}.json`, `3d-review-${submissionId}.json`, {
    root: path.join(runtime, "submissions"),
  });
});
app.get("/api/download/:filename", (req, res) => {
  const filename = z
    .string()
    .regex(/^[a-f0-9]{64}\.(glb|stl)$/)
    .parse(req.params.filename);
  const model = Object.values(store.state.models).find(
    (m) => m?.filename === filename,
  );
  if (!model) throw new ReviewError("找不到此已發布版本。", 404);
  // Same immutable source bytes as the viewer, never a modified review mesh.
  res.download(filename, `${model.name}-${model.version}.${model.format}`, {
    root: mediaDir,
  });
});
// Conversation history and input belong exclusively to the origin session.
app.all("/api/chat", (req, res) =>
  res.status(410).json({ error: "請返回發起審閱的原會話對話。" }),
);

// Browser routes intentionally cannot publish models. Agent control is local IPC only.
const agentApp = express();
agentApp.use(express.json({ limit: "16mb" }));
agentApp.get("/status", (req, res) =>
  res.json({
    ...stateFor("", true),
    viewerReceipts: store.state.viewerReceipts || {},
  }),
);
agentApp.post("/publish", (req, res) => {
  const p = z
    .object({
      file: z.string().min(1),
      name: z.string().max(160).optional(),
      version: z.string().max(80).optional(),
      source: z.string().optional(),
      units: z.string().max(30).optional(),
    })
    .parse(req.body);
  const model = importModel(p, { workspace, mediaDir });
  res.json(store.publish(model));
});
agentApp.get("/submissions", (req, res) => res.json(store.state.submissions));
agentApp.get("/submissions/:id", (req, res) => {
  const submission = store.state.submissions.find(
    (s) => s.id === id.parse(req.params.id),
  );
  if (!submission) throw new ReviewError("找不到提交。", 404);
  res.json(submission);
});
agentApp.post("/read", (req, res) => {
  const p = z.object({ submissionId: id, versionId: id }).parse(req.body);
  res.json(store.acknowledgeRead(p.submissionId, p.versionId));
});
agentApp.post("/echo", (req, res) => {
  const p = z
    .object({
      submissionId: id,
      versionId: id,
      summary: z.string().min(1).max(1000),
      annotations: z.array(annotation).max(20),
    })
    .strict()
    .parse(req.body);
  if (p.annotations.some((a) => a.type !== "region"))
    throw new ReviewError(
      "理解回顯需要明確表面範圍，不能以點標籤冒充範圍。",
      400,
    );
  validateAnnotations(p.versionId, p.annotations);
  res.json(store.setEcho(p));
});

function errorHandler(err, req, res, next) {
  const schemaError = err instanceof z.ZodError;
  const status = schemaError ? 400 : err.status || 500;
  res.status(status).json({
    error: schemaError
      ? "輸入資料格式不正確。"
      : status >= 500
        ? "服務暫時未能完成請求，草稿會保留。"
        : err.message,
    code: err.code || "ERROR",
  });
}
agentApp.use(errorHandler);
const socketPath = path.join(runtime, "agent.sock");
if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
const agentServer = http.createServer(agentApp);
agentServer.listen(socketPath, () => fs.chmodSync(socketPath, 0o600));
app.use(
  express.static(
    path.resolve(process.env.REVIEW_DIST_DIR || path.join(repo, "dist")),
  ),
);
app.get("/{*path}", (req, res) =>
  res.sendFile("index.html", {
    root: path.resolve(process.env.REVIEW_DIST_DIR || path.join(repo, "dist")),
  }),
);
app.use(errorHandler);
const port = Number(process.env.PORT || 43173);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`3D review listening on 127.0.0.1:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close();
    agentServer.close(() => process.exit(0));
  });
