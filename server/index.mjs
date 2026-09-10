import express from "express";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ReviewStore, ReviewError, atomicJson } from "./store.mjs";
import { log, errorDetail } from "./log.mjs";
import { claimLock, readLock, releaseLock, processAlive } from "./lockfile.mjs";
import { importModel, MAX_TRIANGLES } from "./models.mjs";
import { OpenClawBridge } from "./bridge.mjs";
import { originSchema, normalizeOrigin } from "./origin.mjs";
import { listenerConfig, privateIPv4 } from "./network.mjs";
import {
  readInstance,
  instanceCookieName,
  agentSocketPath,
  prepareSocketDirectory,
  INTEGRATION_API,
} from "./instance.mjs";
import {
  ReviewAccess,
  AccessError,
  sessionCookie as parseSessionCookie,
  accessCookie as formatAccessCookie,
  browserInfo,
} from "./access.mjs";

export const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const workspace = fs.realpathSync(
  path.resolve(process.env.REVIEW_WORKSPACE || path.resolve(repo, "../..")),
);
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
  const previous = readLock(instanceFile);
  if (processAlive(previous?.pid))
    throw new Error("此審閱服務已在運行，請勿重複啟動。");
  if (!previous)
    log.warn("service", "discarding an unreadable instance lock", {
      file: instanceFile,
    });
  fs.unlinkSync(instanceFile);
}
try {
  claimLock(instanceFile, { startedAt: Date.now() });
} catch (error) {
  if (error.code === "EEXIST")
    throw new Error("此審閱服務已在運行，請勿重複啟動。");
  throw error;
}
process.on("exit", () => releaseLock(instanceFile));
const configFile = path.join(runtime, "config.json");
const config = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};
const instance = readInstance(config);
let maintenanceUntil = 0;
const managedEnabled = () =>
  !config.managed ||
  (Date.now() >= maintenanceUntil &&
    !fs.existsSync(path.join(runtime, "disabled.json")) &&
    (!config.installRoot ||
      fs.existsSync(path.join(config.installRoot, "openclaw.plugin.json"))));
const cookieName = instanceCookieName(instance);
function sessionCookie(headers) {
  const scoped = parseSessionCookie(headers, cookieName);
  if (scoped || !instance || config.legacyCookieMigration !== true)
    return scoped;
  if (
    (headers.cookie || "")
      .split(";")
      .some((x) => x.trim().startsWith(`${cookieName}=`))
  )
    return null;
  const legacy = parseSessionCookie(headers);
  if (!legacy) return null;
  // Migration is opt-in and can only exchange a verifier owned by this runtime.
  try {
    access.authenticate(legacy);
    return legacy;
  } catch {
    return null;
  }
}
function accessCookie(value, maxAge) {
  return formatAccessCookie(value, maxAge, cookieName);
}
const legacyOrigin = normalizeOrigin(
  process.env.REVIEW_SESSION_KEY || config.origin || config.sessionKey || null,
);
const store = new ReviewStore(runtime, { legacyOrigin });
const bridges = new Map();
function bridgeFor(origin) {
  const key = JSON.stringify(origin);
  if (!bridges.has(key)) {
    if (bridges.size >= 32) bridges.delete(bridges.keys().next().value);
    bridges.set(
      key,
      new OpenClawBridge(origin, {
        enabled: process.env.REVIEW_BRIDGE !== "off",
      }),
    );
  }
  return bridges.get(key);
}
const network = listenerConfig(
  process.env.REVIEW_HOST || config.host || "127.0.0.1",
);
const accessRequired = network.lan || process.env.REVIEW_ACCESS === "required";
const access = new ReviewAccess({
  scope: () => store.state.bindingId,
  file: accessRequired ? path.join(runtime, "browser-access.json") : null,
  protectedClient: () => store.state.lock?.clientId || null,
});
function rememberUse(req, res) {
  if (!accessRequired) return;
  const value = sessionCookie(req.headers);
  const browser = access.touch(
    value,
    browserInfo(req.headers, req.socket.remoteAddress),
  );
  res.setHeader(
    "Set-Cookie",
    accessCookie(value, browser.expiresAt - Date.now()),
  );
}
const allowedHosts = new Set([
  network.host,
  "localhost",
  "127.0.0.1",
  ...(config.allowedHosts || []),
  ...(process.env.REVIEW_ALLOWED_HOSTS || "").split(",").filter(Boolean),
]);
const app = express();
app.disable("x-powered-by");
// Keep route matching identical to the authorization boundary below.
app.set("case sensitive routing", true);
app.set("strict routing", true);
app.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) && !managedEnabled())
    return res.status(503).json({
      error: "MeshCue 擴充已停用；草稿保留，請在原會話接續。",
      code: "INTEGRATION_DISABLED",
    });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  let hostname;
  try {
    hostname = new URL(`http://${req.headers.host}`).hostname;
  } catch {
    /* rejected below */
  }
  if (!allowedHosts.has(hostname))
    throw new AccessError("請使用核對過的工作台入口。", 421, "BAD_HOST");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    ((req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site")
  )
    throw new AccessError("此請求不是來自目前工作台。", 403, "BAD_ORIGIN");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-review-client"] !== "1"
  )
    return res.status(403).json({ error: "請使用審閱工作台操作。" });
  next();
});
app.use(express.json({ limit: "16mb" }));
app.post("/api/access/claim", (req, res) => {
  if (!accessRequired) throw new AccessError("此入口不使用遠端授權。", 409);
  z.object({}).strict().parse(req.body);
  // Never use req.ip, forwarded headers or a browser-supplied address here.
  const session = access.claimAddress(
    req.socket.remoteAddress,
    sessionCookie(req.headers),
    browserInfo(req.headers, req.socket.remoteAddress),
  );
  res.setHeader(
    "Set-Cookie",
    accessCookie(session.value, session.expiresAt - Date.now()),
  );
  res.json({ authorized: true, expiresAt: session.expiresAt });
});
app.post("/api/access/exchange", (req, res) => {
  if (!accessRequired) throw new AccessError("此入口不使用遠端授權。", 409);
  const p = z
    .object({ grant: z.string().max(128) })
    .strict()
    .parse(req.body);
  const session = access.redeem(
    p.grant,
    sessionCookie(req.headers),
    browserInfo(req.headers, req.socket.remoteAddress),
  );
  res.setHeader(
    "Set-Cookie",
    accessCookie(session.value, session.expiresAt - Date.now()),
  );
  res.json({ authorized: true, expiresAt: session.expiresAt });
});
app.use((req, res, next) => {
  if (
    !accessRequired ||
    !req.path.startsWith("/api/") ||
    req.path === "/api/health"
  )
    return next();
  req.reviewAccess = access.authenticate(sessionCookie(req.headers));
  if (!["GET", "HEAD"].includes(req.method) && req.body?.clientId !== undefined)
    access.claimClient(req.reviewAccess, req.body.clientId);
  if (
    req.method === "GET" &&
    req.path === "/api/state" &&
    !access.ownsClient(req.reviewAccess, req.query.clientId)
  )
    req.reviewClientId = "";
  else req.reviewClientId = String(req.query.clientId || "");
  if (
    req.path.startsWith("/api/models/") ||
    req.path.startsWith("/api/download/")
  ) {
    const filename = req.path.split("/").pop();
    if (!store.modelInBinding(filename))
      throw new AccessError("找不到此輪審閱模型。", 404, "NOT_FOUND");
  }
  if (req.path.startsWith("/api/submissions/")) {
    const item = store.state.submissions.find(
      (s) => s.id === req.path.split("/").pop(),
    );
    if (!item || !store.submissionInBinding(item))
      throw new AccessError("找不到此輪提交。", 404, "NOT_FOUND");
  }
  if (req.path === "/api/feedback") {
    const item = store.state.submissions.find(
      (s) => s.id === req.body?.submissionId,
    );
    if (item && !store.submissionInBinding(item))
      throw new AccessError("提交不屬於此輪審閱。", 403, "WRONG_REVIEW");
  }
  next();
});
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
    bridgeEnabled: bridgeFor(store.state.reviewOrigin).enabled,
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
          surfaceAlgorithm: z.literal("midpoint-v2-edge0.07-rationed"),
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
// Derived, never restated: a bundled server used to report the project's
// version while the package it shipped in declared a different one.
const version = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"))
      .version;
  } catch (error) {
    log.warn("service", "version is unavailable from the package manifest", {
      ...errorDetail(error),
    });
    return "unknown";
  }
})();
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    app: "3d-agent-review", // Stable service identity for pre-rename launchers.
    product: "MeshCue",
    version,
    integrationApi: INTEGRATION_API,
    instance,
    pid: process.pid,
    accessRequired,
  }),
);
app.get("/api/state", (req, res) =>
  res.json(
    stateFor(
      req.reviewClientId ?? String(req.query.clientId || ""),
      req.query.full === "1",
    ),
  ),
);
app.post("/api/access/activity", (req, res) => {
  z.object({ clientId: id }).strict().parse(req.body);
  rememberUse(req, res);
  res.json({ remembered: true });
});
app.get("/api/models/:filename", (req, res) => {
  if (!/^[a-f0-9]{64}\.(glb|stl)$/.test(req.params.filename))
    throw new ReviewError("找不到模型。", 404);
  res.setHeader(
    "Cache-Control",
    accessRequired
      ? "private, no-store"
      : "public, max-age=31536000, immutable",
  );
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
  store.recordViewerReceipt(p.clientId, {
    versionId: p.versionId,
    sha256: p.sha256,
    loadedAt: Date.now(),
  });
  rememberUse(req, res);
  res.json({ ready: true });
});
app.post("/api/review/begin", (req, res) => {
  const p = owner.parse(req.body);
  if (store.state.viewerReceipts?.[p.clientId]?.versionId !== p.versionId)
    throw new ReviewError("請等模型完成載入及版本核對。", 409, "NOT_READY");
  store.acquire(p.versionId, p.clientId);
  rememberUse(req, res);
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
  rememberUse(req, res);
  res.json(stateFor(p.clientId, true));
});
app.put("/api/draft", (req, res) => {
  const p = draftSchema.parse(req.body);
  validateAnnotations(p.versionId, p.annotations);
  const draft = store.updateDraft(p);
  rememberUse(req, res);
  res.json(draft);
});
app.post("/api/review/finish", (req, res) => {
  const p = owner.parse(req.body);
  store.finish(p.versionId, p.clientId);
  if (req.reviewAccess && req.reviewAccess.scope !== store.state.bindingId)
    throw new AccessError(
      "此輪審閱已完成，請返回原對話取得下一輪入口。",
      409,
      "REVIEW_FINISHED",
    );
  rememberUse(req, res);
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
  res.json(await deliverFeedback(item));
});
function deliverFeedback(item) {
  if (!managedEnabled())
    throw new ReviewError(
      "擴充已停用，提交仍保留。",
      503,
      "INTEGRATION_DISABLED",
    );
  if (!feedbackFlights.has(item.id)) {
    feedbackFlights.set(
      item.id,
      (async () => {
        const localFile = path.join(runtime, "submissions", `${item.id}.json`);
        const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
        const readCommand =
          config.managed && config.projectPath
            ? `meshcue 工具 ${JSON.stringify({ action: "read", project: config.projectPath, submissionId: item.id })}`
            : `REVIEW_DATA_DIR=${shellQuote(runtime)} node ${shellQuote(path.join(repo, "scripts/reviewctl.mjs"))} read ${shellQuote(item.id)}`;
        const summary = item.annotations
          .map((a) =>
            a.type === "pin"
              ? `${a.label}：點標籤，${a.meshId}／面 ${a.faceIndex}`
              : `${a.color} 塗抹區域（區域識別 ${a.id}）：${["brush-v1", "source-v1"].includes(a.coverage) ? "實際表面筆跡" : "舊版整面標記"}；不是編號點標籤，按顏色及位置辨認`,
          )
          .join("\n");
        const message = `[3D 審閱標記提交 ${item.id}]\n模型：${item.model.name}／${item.model.version}；版本 ${item.versionId}；SHA256 ${item.model.sha256}。\n${summary}\n\n完整三維標注與相機資料已保存於 ${localFile}。Agent 操作說明：${path.join(repo, "AGENT-INTERFACE.md")}。\n這是使用者按下「交畀 Agent」提交的一批位置標記，不等於修改指令。請先用 ${readCommand} 讀取本次實例的完整提交並回傳讀取回執，再確認收到；若原會話尚未有對應說明，詢問各標記含意及修改要求，不自行猜測。請只在發起本批審閱的原會話回覆，不要轉發到其他話題或渠道。使用者尚未結束審閱，不能強行替換模型。`;
        store.submissionStatus(item.id, "sending", {
          lastAttemptAt: Date.now(),
          attempts: (item.attempts || 0) + 1,
        });
        try {
          const bridge = bridgeFor(store.submissionOrigin(item));
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
          } catch (error) {
            // Acceptance is real, but delivery remains unconfirmed.
            log.warn("feedback", "accepted but delivery unconfirmed", {
              submissionId: item.id,
              ...errorDetail(error),
            });
          }
          const { annotations, ...receipt } = item;
          return receipt;
        } catch (error) {
          log.error("feedback", "delivery to the origin session failed", {
            submissionId: item.id,
            attempts: (item.attempts || 0) + 1,
            ...errorDetail(error),
          });
          store.submissionStatus(item.id, "unconfirmed", {
            error: "尚未確認交到 OpenClaw；標注已保存在本機。",
            nextAttemptAt:
              Date.now() +
              Math.min(300000, 1000 * 2 ** Math.min(item.attempts || 1, 8)),
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
  return feedbackFlights.get(item.id);
}
// Only managed integration instances own an automatic durable outbox. Legacy
// trial behavior stays unchanged. Each batch keeps its frozen origin and key.
let drainingOutbox = false;
const outboxTimer = config.managed
  ? setInterval(
      async () => {
        if (drainingOutbox || !managedEnabled()) return;
        const next = store.state.submissions.find(
          (item) =>
            item.status !== "accepted" &&
            !feedbackFlights.has(item.id) &&
            (item.nextAttemptAt || 0) <= Date.now(),
        );
        if (!next) return;
        drainingOutbox = true;
        try {
          await deliverFeedback(next);
        } catch {
          /* deliverFeedback already logged the cause; status is the receipt */
        } finally {
          drainingOutbox = false;
        }
      },
      Math.max(1000, Number(process.env.REVIEW_OUTBOX_MS) || 30000),
    )
  : null;
outboxTimer?.unref();
app.get("/api/submissions/:id", (req, res) => {
  const submissionId = id.parse(req.params.id);
  const file = path.join(runtime, "submissions", `${submissionId}.json`);
  if (!fs.existsSync(file)) throw new ReviewError("找不到提交。", 404);
  res.download(`${submissionId}.json`, `meshcue-${submissionId}.json`, {
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
  rememberUse(req, res);
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
    origin: store.state.reviewOrigin,
    instance,
    integrationApi: INTEGRATION_API,
    pendingOrigin: store.state.pendingOrigin,
    codeRoot: repo,
    releaseId: process.env.REVIEW_RELEASE_ID || null,
    pending: store.state.pending,
    network: {
      host: network.host,
      port: server.address()?.port,
      lan: network.lan,
    },
    access: { ...access.metadata(), required: accessRequired },
  }),
);
agentApp.post("/maintenance", (req, res) => {
  if (!config.managed || req.body.instanceId !== instance?.id)
    throw new ReviewError("服務身份不符。", 409, "WRONG_INSTANCE");
  if (req.body.release === true) {
    maintenanceUntil = 0;
    return res.json({ paused: false });
  }
  const d = store.state.draft;
  if (
    store.state.lock ||
    (d &&
      (d.annotations.length || d.submittedRevision != null) &&
      d.submittedRevision !== d.revision)
  )
    throw new ReviewError(
      "使用者尚在審閱；未停止或升級服務。",
      423,
      "REVIEW_BUSY",
    );
  // Check and pause in the same event-loop turn: a browser cannot acquire a
  // new review between the manager's status check and the verified shutdown.
  // A crashed manager cannot leave the old service paused indefinitely.
  maintenanceUntil = Date.now() + 15000;
  res.json({ paused: true });
});
agentApp.post("/publish", (req, res) => {
  const p = z
    .object({
      file: z.string().min(1),
      name: z.string().max(160).optional(),
      version: z.string().max(80).optional(),
      source: z.string().optional(),
      units: z.string().max(30).optional(),
      origin: originSchema.optional(),
    })
    // Strict like every other write route: a caller that misnames a field must
    // hear about it rather than have the model published under a default.
    .strict()
    .parse(req.body);
  const model = importModel(p, { workspace, mediaDir });
  res.json(store.publish(model, p.origin));
});
agentApp.post("/access/issue", (req, res) => {
  if (!accessRequired || !store.state.active)
    throw new AccessError("尚未準備受保護審閱。", 409);
  // Host IPC response only. reviewctl deliberately has no grant-printing command.
  res.setHeader("Cache-Control", "no-store");
  res.json(access.issue());
});
agentApp.post("/access/admit", (req, res) => {
  if (!accessRequired || !store.state.active)
    throw new AccessError("尚未準備受保護審閱。", 409);
  const p = z
    .object({ address: z.string().max(64) })
    .strict()
    .parse(req.body);
  // Loopback admissions are for protected local fixtures, not LAN delivery.
  if (network.lan && !privateIPv4(p.address))
    throw new AccessError("請指定已核對的內網 IPv4 位址。", 400, "BAD_ADDRESS");
  res.setHeader("Cache-Control", "no-store");
  res.json(access.admitAddress(p.address));
});
agentApp.post("/access/revoke", (req, res) => {
  const p = z
    .object({ browserId: z.string().uuid().optional() })
    .strict()
    .parse(req.body);
  access.revoke(p.browserId);
  res.json({ revoked: true, browserId: p.browserId || null });
});
agentApp.get("/access/browsers", (req, res) =>
  res.json({ browsers: access.metadata().browsers }),
);
agentApp.post("/origin", (req, res) => {
  const p = z
    .object({ origin: originSchema, resumeGeneration: z.boolean().optional() })
    .strict()
    .parse(req.body);
  store.bindOrigin(p.origin, { resumeGeneration: p.resumeGeneration });
  res.json({
    origin: store.state.reviewOrigin,
    reviewId: store.state.reviewId,
  });
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
  const p = z
    .object({ submissionId: id, versionId: id })
    .strict()
    .parse(req.body);
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
  // 4xx are the documented contract and already fully described in the body.
  // A 5xx is the only case where the cause exists nowhere else.
  if (status >= 500)
    log.error("http", "request failed", {
      method: req.method,
      path: req.path,
      ...errorDetail(err),
    });
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
const socketPath = agentSocketPath(runtime, instance);
prepareSocketDirectory(socketPath, instance);
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
const server = app.listen(port, network.host, () =>
  log.info("service", "MeshCue listening", {
    host: network.host,
    port: server.address().port,
    pid: process.pid,
    instance: instance?.id,
    accessRequired,
  }),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close();
    agentServer.close(() => process.exit(0));
  });
