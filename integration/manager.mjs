import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { atomicJson } from "../server/store.mjs";
import { log, errorDetail } from "../server/log.mjs";
import {
  claimLock,
  readLock,
  releaseLock,
  processAlive,
} from "../server/lockfile.mjs";
import {
  agentSocketPath,
  readInstance,
  INTEGRATION_API,
} from "../server/instance.mjs";
import { listenerConfig, privateIPv4 } from "../server/network.mjs";
import { cacheRelease, cachedRelease } from "./release.mjs";
import {
  workspaceContext,
  trustedOrigin,
  sameRoute,
  scopedPath,
  within,
  fail,
} from "./context.mjs";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => processAlive(pid);
// The child inherits this descriptor for its whole run, so rotation can only
// happen between runs. One generation back is enough to keep the log of the
// release that just failed while bounding a project at twice the cap.
export const LOG_LIMIT = 5 * 1024 * 1024;
// A release id is the content hash of the installed package, so anything that
// is not one is not ours to delete. Never widen this to "whatever is in there".
const RELEASE_ID = /^[0-9a-f]{64}$/;
export function pruneReleases(runtime, keep) {
  const directory = path.join(runtime, "releases");
  const kept = new Set(keep.filter(Boolean));
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return [];
  }
  const removed = [];
  for (const id of entries) {
    if (kept.has(id) || !RELEASE_ID.test(id)) continue;
    try {
      fs.rmSync(scopedPath(runtime, `releases/${id}`, { directory: true }), {
        recursive: true,
        force: true,
      });
      removed.push(id);
    } catch (error) {
      log.warn("integration", "could not remove a superseded release", {
        release: id,
        ...errorDetail(error),
      });
    }
  }
  return removed;
}
function rotateLog(runtime) {
  const file = path.join(runtime, "server.log");
  try {
    if (fs.statSync(file).size >= LOG_LIMIT) fs.renameSync(file, `${file}.1`);
  } catch (error) {
    if (error.code !== "ENOENT")
      log.warn("integration", "could not rotate the service log", {
        ...errorDetail(error),
      });
  }
  return file;
}
export async function ipc(runtime, instance, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: agentSocketPath(runtime, instance),
        path: route,
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 20 * 1024 * 1024)
            req.destroy(new Error("Response too large"));
        });
        res.on("end", () => {
          try {
            const value = JSON.parse(data);
            if (res.statusCode >= 400) {
              const err = new Error(value.error || "MeshCue request failed");
              err.code = value.code;
              reject(err);
            } else resolve(value);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error("MeshCue IPC timed out")));
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function locked(file, fn) {
  for (let i = 0; i < 100; i++) {
    try {
      claimLock(file);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readLock(file);
      // claimLock never publishes partial content, so an unreadable holder is
      // debris rather than a live claim: waiting on it would block the project
      // for good instead of for a moment.
      if (!owner)
        log.warn("integration", "discarding an unreadable lock", { file });
      if (!owner || !alive(owner.pid)) {
        fs.unlinkSync(file);
        continue;
      }
      if (i === 99) fail("INSTANCE_BUSY", "項目正在啟動，請稍後再試。");
      await delay(100);
    }
  }
  try {
    return await fn();
  } finally {
    releaseLock(file);
  }
}

export class InstanceManager {
  constructor(
    ctx,
    {
      installRoot,
      clientAddress,
      listenHost = "lan",
      serverEntry,
      distRoot,
      environment = {},
    } = {},
  ) {
    Object.assign(this, workspaceContext(ctx));
    this.ctx = ctx;
    this.installRoot = fs.realpathSync(installRoot);
    this.serverEntry =
      serverEntry || path.join(this.installRoot, "runtime/server.mjs");
    this.bundled = !serverEntry;
    this.distRoot = distRoot || path.join(this.installRoot, "web");
    this.environment = environment; // Constructor dependency for isolated tests; never a tool parameter.
    this.clientAddress = clientAddress;
    this.listenHost = listenHost;
    this.usedProjects = new Map();
  }
  project(project, create = false) {
    if (
      !/^projects\/[a-zA-Z0-9][^\x00-\x1f]*$/.test(project || "") ||
      project.startsWith("projects/meshcue-state")
    )
      fail(
        "PROJECT_REQUIRED",
        "請指定獨立建模項目，例如 projects/phone-stand；不會自動取上次項目。",
      );
    if (!within(this.allowed, path.resolve(this.workspace, project)))
      fail("PATH_SCOPE", "此工具未獲該項目的文件權限。");
    const projectRoot = scopedPath(this.workspace, project, {
      create,
      directory: true,
    });
    if (!within(this.allowed, projectRoot))
      fail("PATH_SCOPE", "此工具未獲該項目的文件權限。");
    const id = crypto
      .createHash("sha256")
      .update(JSON.stringify([this.workspace, this.agentId, projectRoot]))
      .digest("hex")
      .slice(0, 32);
    const relative = path.relative(
      this.workspace,
      path.join(projectRoot, ".meshcue", id),
    );
    const runtime = scopedPath(this.workspace, relative, {
      create,
      directory: true,
    });
    if (!within(this.allowed, runtime))
      fail("PATH_SCOPE", "運行目錄超出文件權限。");
    return {
      id,
      projectRoot,
      project: path.relative(this.workspace, projectRoot),
      runtime,
    };
  }
  async status(p, config) {
    const result = await ipc(p.runtime, readInstance(config), "/status");
    if (
      result.instance?.id !== config.instance.id ||
      result.instance?.projectId !== p.id ||
      result.integrationApi !== INTEGRATION_API
    )
      fail("WRONG_INSTANCE", "服務身份不符；沒有復用或停止此進程。");
    return result;
  }
  pauseOwned() {
    const unavailable = [];
    for (const { p, config } of this.usedProjects.values()) {
      try {
        const current = JSON.parse(
          fs.readFileSync(path.join(p.runtime, "config.json"), "utf8"),
        );
        if (current.instance?.id === config.instance.id)
          atomicJson(path.join(p.runtime, "disabled.json"), {
            disabledAt: Date.now(),
            instanceId: config.instance.id,
          });
      } catch (error) {
        log.warn("integration", "could not pause a managed project", {
          project: p.project,
          ...errorDetail(error),
        });
        unavailable.push(p.project);
      }
    }
    return unavailable;
  }
  async register(p, config) {
    const root = path.join(this.workspace, "projects/meshcue-state");
    if (!within(this.allowed, root))
      fail("PATH_SCOPE", "整合服務需要工作區內的項目登記目錄權限。");
    scopedPath(this.workspace, "projects/meshcue-state", {
      create: true,
      directory: true,
    });
    await locked(path.join(root, "registry.lock"), async () => {
      const file = path.join(root, "registry.json");
      const registry = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : { schema: 1, projects: {} };
      if (registry.schema !== 1)
        fail("REGISTRY_VERSION", "項目登記格式未受支援；未覆蓋。");
      registry.projects[p.id] = {
        project: p.project,
        runtime: path.relative(this.workspace, p.runtime),
        instanceId: config.instance.id,
        agentId: this.agentId,
        installRoot: this.installRoot,
      };
      atomicJson(file, registry);
    });
  }
  // Drafts survive a restart and are keyed by version, so an unfinished round
  // is no longer a reason to refuse — that is what let a round nobody could
  // finish block the upgrade that would have fixed it. Only somebody marking
  // right now is worth stopping for, and that evidence expires on its own.
  async stopOwned(p, config, state) {
    if (state.locked)
      fail(
        "REVIEW_BUSY",
        "使用者正在標記；未停止或升級服務，草稿已保存。請稍後重試。",
      );
    const health = await fetch(
      `http://${state.network.host}:${state.network.port}/api/health`,
      { signal: AbortSignal.timeout(2000) },
    ).then((r) => r.json());
    const owner = readLock(path.join(p.runtime, "instance.lock"));
    if (
      !owner ||
      health.instance?.id !== config.instance.id ||
      health.pid !== owner.pid
    )
      fail("WRONG_INSTANCE", "進程身份不符；沒有停止。");
    await ipc(p.runtime, config.instance, "/maintenance", {
      instanceId: config.instance.id,
    });
    try {
      process.kill(owner.pid, "SIGTERM");
      for (let i = 0; i < 60 && alive(owner.pid); i++) await delay(50);
      if (alive(owner.pid))
        fail("INSTANCE_BUSY", "服務尚未停止，沒有強制中止。");
    } catch (error) {
      await ipc(p.runtime, config.instance, "/maintenance", {
        instanceId: config.instance.id,
        release: true,
      }).catch((releaseError) =>
        log.warn("integration", "could not release the maintenance pause", {
          project: p.project,
          ...errorDetail(releaseError),
        }),
      );
      throw error;
    }
  }
  async ensure(p, config) {
    const release = this.bundled
      ? cacheRelease(this.installRoot, p.runtime)
      : {
          id: null,
          root: this.installRoot,
          serverEntry: this.serverEntry,
          distRoot: this.distRoot,
        };
    let running;
    try {
      running = await this.status(p, config);
    } catch (error) {
      if (error.code === "WRONG_INSTANCE") throw error;
    }
    if (running && running.releaseId === release.id) return running;
    if (running) await this.stopOwned(p, config, running);
    const previous = structuredClone(config);
    config.installRoot = this.installRoot;
    try {
      const state = await this.launch(p, config, release);
      if (release.id) config.lastGoodRelease = release.id;
      atomicJson(path.join(p.runtime, "config.json"), config);
      // Each release is a full copy of the runtime, and nothing ever removed
      // the superseded ones: a project accumulated a few megabytes per upgrade
      // for the lifetime of the review. Only the running one and the rollback
      // target are ever launched again.
      pruneReleases(p.runtime, [release.id, previous.lastGoodRelease]);
      return state;
    } catch (error) {
      if (previous.lastGoodRelease && previous.lastGoodRelease !== release.id) {
        const fallback = cachedRelease(p.runtime, previous.lastGoodRelease);
        Object.assign(config, previous, { installRoot: this.installRoot });
        await this.launch(p, config, fallback);
        atomicJson(path.join(p.runtime, "config.json"), config);
        fail(
          "UPGRADE_ROLLED_BACK",
          "新版啟動失敗；已恢復上一個可用版本，網址、模型與授權保持。",
        );
      }
      throw error;
    }
  }
  async launch(p, config, release) {
    try {
      return await this.status(p, config);
    } catch (error) {
      if (error.code === "WRONG_INSTANCE") throw error;
    }
    const runFile = path.join(p.runtime, "instance.lock");
    if (alive(readLock(runFile)?.pid))
      fail(
        "INSTANCE_BUSY",
        "項目進程仍在運行但未通過健康檢查；沒有重複啟動或殺掉進程。",
      );
    if (
      !fs.existsSync(release.serverEntry) ||
      !fs.existsSync(path.join(release.distRoot, "index.html"))
    )
      fail(
        "PACKAGE_INCOMPLETE",
        "安裝包缺少工作台資源；沒有要求臨時編譯或生成假網址。",
      );
    const network = listenerConfig(config.host);
    const mediaDir = scopedPath(this.workspace, `media/3d/meshcue/${p.id}`, {
      create: true,
      directory: true,
    });
    for (const directory of [p.runtime, mediaDir]) {
      try {
        fs.writeFileSync(path.join(directory, ".gitignore"), "*\n", {
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    atomicJson(path.join(p.runtime, "config.json"), config);
    const log = fs.openSync(rotateLog(p.runtime), "a", 0o600);
    const child = spawn(process.execPath, [release.serverEntry], {
      cwd: release.root,
      detached: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        ...this.environment,
        REVIEW_WORKSPACE: this.workspace,
        REVIEW_DATA_DIR: p.runtime,
        REVIEW_MEDIA_DIR: mediaDir,
        REVIEW_DIST_DIR: release.distRoot,
        REVIEW_RELEASE_ID: release.id || "",
        REVIEW_HOST: network.host,
        REVIEW_SESSION_KEY: "",
        REVIEW_ACCESS: "required",
        PORT: String(config.port || 0),
      },
    });
    fs.closeSync(log);
    child.unref();
    child.on("error", () => {});
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const state = await this.status(p, config);
        if (state.network.port) {
          config.port = state.network.port;
          config.host = state.network.host;
          atomicJson(path.join(p.runtime, "config.json"), config);
          return state;
        }
      } catch (error) {
        if (error.code === "WRONG_INSTANCE") throw error;
      }
      await delay(50);
    }
    // A registered port is part of browser localStorage identity. Do not choose
    // another port silently or kill its occupant and strand unsynced drafts.
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      for (
        let i = 0;
        i < 60 && child.exitCode === null && child.signalCode === null;
        i++
      )
        await delay(50);
    }
    fail(
      "START_FAILED",
      config.port
        ? "原連接埠未能啟動；保留原網址與瀏覽器草稿，請先排除埠衝突。"
        : "工作台未啟動；請檢查此項目日誌，沒有交付無效網址。",
    );
  }
  async execute(input) {
    const origin = trustedOrigin(this.ctx);
    if (
      !within(
        this.allowed,
        path.join(this.workspace, "projects/meshcue-state"),
      ) ||
      !within(this.allowed, path.join(this.workspace, "media/3d/meshcue"))
    )
      fail(
        "PATH_SCOPE",
        "整合服務需要此工作區的項目登記目錄權限；沒有越過目前文件權限。",
      );
    const opens = input.action === "open";
    // No empty viewer on first use: a source model must exist before a new instance.
    if (opens && input.file) {
      const source = scopedPath(this.workspace, input.file);
      if (!within(this.allowed, source))
        fail("PATH_SCOPE", "模型檔案超出此工具的文件權限。");
    }
    let p;
    try {
      p = this.project(input.project);
    } catch (error) {
      if (!opens || !input.file || error.code !== "NOT_FOUND") throw error;
      p = this.project(input.project, true);
    }
    return locked(path.join(p.runtime, "manager.lock"), async () => {
      const file = path.join(p.runtime, "config.json");
      const exists = fs.existsSync(file);
      if (!exists && (!opens || !input.file))
        fail("MODEL_REQUIRED", "請先建好初稿或選定已有模型，再開啟審閱。");
      const config = exists
        ? JSON.parse(fs.readFileSync(file, "utf8"))
        : {
            instance: { schema: 1, id: crypto.randomUUID(), projectId: p.id },
            host: input.host || this.listenHost,
            port: 0,
            origin,
            managed: true,
            installRoot: this.installRoot,
            projectPath: p.project,
          };
      if (readInstance(config)?.projectId !== p.id)
        fail("WRONG_INSTANCE", "保存的項目身份不符；未遷移資料。");
      this.usedProjects.set(p.runtime, { p, config });
      if (!exists) atomicJson(file, config);
      await this.register(p, config);
      let state;
      if (opens) {
        // Lift the pause before attempting the upgrade, not after it succeeds.
        // A paused instance refuses every write, so a user holding an
        // unsubmitted round cannot submit or finish it — and that unfinished
        // round is exactly what makes stopOwned refuse the upgrade. Clearing it
        // first breaks the cycle; managedEnabled() still gates on the installed
        // manifest, so a plugin that is really gone stays disabled.
        const disabled = path.join(p.runtime, "disabled.json");
        if (fs.existsSync(disabled)) fs.unlinkSync(disabled);
        state = await this.ensure(p, config);
      } else {
        try {
          state = await this.status(p, config);
        } catch (error) {
          if (error.code === "WRONG_INSTANCE") throw error;
          const lockFile = path.join(p.runtime, "instance.lock");
          if (alive(readLock(lockFile)?.pid))
            fail(
              "INSTANCE_UNVERIFIED",
              "項目進程仍存在，但未通過身份檢查；沒有宣稱停止或殺掉進程。",
            );
          if (["status", "stop"].includes(input.action))
            return {
              project: p.project,
              running: false,
              stopped: true,
              dataRetained: true,
            };
          fail("NOT_RUNNING", "此項目服務未運行，請先接續此項目。");
        }
      }
      if (!isDeepStrictEqual(state.origin, origin)) {
        if (!opens || !input.resume)
          fail(
            "RESUME_REQUIRED",
            "此項目屬於另一輪會話。明確繼續該項目後才接續，沒有改動草稿或回傳位置。",
          );
        await ipc(p.runtime, config.instance, "/origin", {
          origin,
          resumeGeneration: sameRoute(state.origin, origin),
        });
        config.origin = origin;
        atomicJson(file, config);
        state = await this.status(p, config);
      }
      if (opens) {
        let published;
        if (input.file)
          published = await ipc(p.runtime, config.instance, "/publish", {
            file: input.file,
            name: input.name,
            version: input.version,
            units: input.units,
            origin,
            // Publishing shows the new version by default, because showing it
            // costs the reviewer nothing now. Saying otherwise adds a tab and
            // leaves whatever they are looking at exactly where it is.
            ...(input.label ? { label: input.label } : {}),
            ...(input.activate === false ? { activate: false } : {}),
          });
        state = await this.status(p, config);
        if (!state.active)
          fail("MODEL_REQUIRED", "項目尚未有模型；沒有交付空白審閱頁。");
        const address = input.confirmedClientAddress || this.clientAddress;
        let admission = { status: "client_address_needed" };
        if (address) {
          if (!(
            privateIPv4(address) ||
            (!state.network.lan && address === "127.0.0.1")
          ))
            fail("BAD_ADDRESS", "請使用已由使用者核對的設備內網地址。");
          // Admission is scoped to this project. Existing browser credentials
          // continue to work; no global trust is granted to all projects.
          admission = await ipc(p.runtime, config.instance, "/access/admit", {
            address,
          });
        }
        return {
          project: p.project,
          instanceId: config.instance.id,
          url: `http://${state.network.host}:${state.network.port}/`,
          active: state.active,
          versions: state.versions,
          publication: published?.status || "unchanged",
          admission,
          accessPolicy: "30 days inactive; renew on use",
          sourceBound: true,
        };
      }
      if (input.action === "status") return { project: p.project, ...state };
      if (input.action === "read") {
        if (!/^[\w-]{1,160}$/.test(input.submissionId || ""))
          fail("SUBMISSION_REQUIRED", "請指定這批提交的 ID。");
        const batch = await ipc(
          p.runtime,
          config.instance,
          `/submissions/${input.submissionId}`,
        );
        if (!sameRoute(batch.origin, origin))
          fail("WRONG_ORIGIN", "此批標記屬於其他會話；沒有讀取回執或轉送。");
        // Full immutable payload is returned, not just a list summary.
        const receipt = await ipc(p.runtime, config.instance, "/read", {
          submissionId: batch.id,
          versionId: batch.versionId,
        });
        return { submission: batch, receipt };
      }
      if (input.action === "echo") {
        const batch = await ipc(
          p.runtime,
          config.instance,
          `/submissions/${input.submissionId}`,
        );
        if (!sameRoute(batch.origin, origin))
          fail("WRONG_ORIGIN", "此批標記屬於其他會話。");
        return ipc(p.runtime, config.instance, "/echo", {
          submissionId: batch.id,
          versionId: batch.versionId,
          summary: input.summary,
          annotations: input.annotations || [],
        });
      }
      // Choosing what the reviewer sees is presentation, and presentation is
      // the Agent's job. Every version keeps its own draft, so none of these
      // can destroy work that was in progress on another one.
      if (input.action === "activate") {
        const versionId =
          input.versionId ||
          state.versions?.find((v) => v.version === input.version)?.id;
        if (!versionId)
          fail(
            "VERSION_REQUIRED",
            "請指定要展示的 versionId，或用 status 先列出可選版本。",
          );
        const result = await ipc(p.runtime, config.instance, "/activate", {
          versionId,
        });
        return { project: p.project, active: result.active };
      }
      if (input.action === "finish") {
        const result = await ipc(p.runtime, config.instance, "/finish", {
          ...(input.versionId ? { versionId: input.versionId } : {}),
        });
        return { project: p.project, ...result };
      }
      if (input.action === "unlock") {
        const result = await ipc(p.runtime, config.instance, "/unlock", {
          ...(input.versionId ? { versionId: input.versionId } : {}),
        });
        return { project: p.project, ...result };
      }
      if (input.action === "stop") {
        await this.stopOwned(p, config, state);
        return {
          stopped: true,
          dataRetained: true,
          project: p.project,
        };
      }
      fail("BAD_ACTION", "Unsupported MeshCue action");
    });
  }
}

// Disable may execute in a fresh Gateway process, not in the worker that used
// the tool. Resolve durable, workspace-local records rather than in-memory PIDs.
// Pausing and resuming share this walk so they can never disagree about which
// projects this install is allowed to touch, or about how a runtime directory
// proves it still belongs to the instance the registry recorded.
function eachRegistered(workspace, installRoot, verb, act) {
  const root = fs.realpathSync(workspace);
  const file = path.join(root, "projects/meshcue-state/registry.json");
  if (!fs.existsSync(file)) return [];
  const checked = scopedPath(root, "projects/meshcue-state/registry.json");
  const registry = JSON.parse(fs.readFileSync(checked, "utf8"));
  if (registry.schema !== 1)
    fail("REGISTRY_VERSION", "項目登記格式未受支援；未覆蓋。");
  const unavailable = [];
  for (const item of Object.values(registry.projects)) {
    if (item.installRoot !== installRoot) continue;
    try {
      const runtime = scopedPath(root, item.runtime, { directory: true });
      const config = JSON.parse(
        fs.readFileSync(path.join(runtime, "config.json"), "utf8"),
      );
      if (config.instance?.id !== item.instanceId)
        throw new Error("Instance changed");
      act(runtime, item);
    } catch (error) {
      log.warn("integration", `could not ${verb} a registered project`, {
        project: item.project,
        ...errorDetail(error),
      });
      unavailable.push(item.project);
    }
  }
  return unavailable;
}
export function pauseRegistered(workspace, installRoot) {
  return eachRegistered(workspace, installRoot, "pause", (runtime, item) =>
    atomicJson(path.join(runtime, "disabled.json"), {
      disabledAt: Date.now(),
      instanceId: item.instanceId,
    }),
  );
}
// A Gateway shutdown reaches a plugin as a disable: the host picks the "restart"
// reason only when the plugin is still present in the next registry, and a
// process that is going away has no next registry. So the marker cannot be
// avoided at pause time — but it does not have to be. Loading at all proves the
// extension is enabled, which makes any marker left by the previous process
// stale regardless of which of the two wrote it. A plugin that really was
// disabled never registers again, so its marker is never reached here.
export function resumeRegistered(workspace, installRoot) {
  return eachRegistered(workspace, installRoot, "resume", (runtime) => {
    const marker = path.join(runtime, "disabled.json");
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  });
}
