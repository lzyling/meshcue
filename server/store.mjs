import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class ReviewError extends Error {
  constructor(message, status = 409, code = "CONFLICT") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
export class ReviewStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, "state.json");
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : {
          schemaVersion: 1,
          generation: 0,
          active: null,
          pending: null,
          lock: null,
          draft: null,
          submissions: [],
          messages: [],
          startedAt: Date.now(),
        };
    this.save();
  }
  save() {
    atomicJson(this.file, this.state);
  }
  publicState(clientId) {
    const s = this.state;
    return {
      generation: s.generation,
      active: s.active,
      pending: s.pending,
      locked: !!s.lock,
      owned: s.lock?.clientId === clientId,
      draft: s.draft,
      submissions: s.submissions.slice(-20).map(({ annotations, ...x }) => x),
      messages: s.messages.slice(-60),
      startedAt: s.startedAt,
    };
  }
  assertVersion(versionId) {
    if (!this.state.active || this.state.active.id !== versionId)
      throw new ReviewError(
        "模型版本已變更，請等目前版本載入完成。",
        409,
        "STALE_VERSION",
      );
  }
  acquire(versionId, clientId) {
    this.assertVersion(versionId);
    const s = this.state;
    if (s.lock && s.lock.clientId !== clientId)
      throw new ReviewError(
        "另一個視窗正在審閱；已保留草稿，請回到原視窗。",
        423,
        "LOCKED",
      );
    s.lock = { clientId, versionId, touchedAt: Date.now() };
    s.draft ||= {
      versionId,
      revision: 0,
      annotations: [],
      camera: null,
      submittedRevision: null,
    };
    this.save();
    return this.publicState(clientId);
  }
  assertOwner(versionId, clientId) {
    this.assertVersion(versionId);
    if (this.state.lock?.clientId !== clientId)
      throw new ReviewError(
        "尚未取得此輪審閱權，草稿未被覆蓋。",
        423,
        "LOCKED",
      );
  }
  updateDraft({ versionId, clientId, revision, annotations, camera }) {
    this.assertOwner(versionId, clientId);
    const draft = this.state.draft;
    if (revision !== draft.revision)
      throw new ReviewError(
        "草稿已更新，請重新載入已保存版本。",
        409,
        "STALE_DRAFT",
      );
    draft.revision += 1;
    draft.annotations = annotations;
    draft.camera = camera;
    this.state.lock.touchedAt = Date.now();
    this.save();
    return structuredClone(draft);
  }
  publish(model) {
    const s = this.state;
    if (s.active?.id === model.id || s.pending?.id === model.id)
      return {
        status: s.pending?.id === model.id ? "queued" : "active",
        model,
      };
    if (s.lock) {
      s.pending = model;
      this.save();
      return {
        status: "queued",
        model,
        reason: "使用者正在審閱，沒有更換目前模型。",
      };
    }
    s.active = model;
    s.pending = null;
    s.draft = null;
    s.generation += 1;
    this.save();
    return { status: "active", model };
  }
  createSubmission({ versionId, clientId, revision, submissionId }) {
    const old = this.state.submissions.find((x) => x.id === submissionId);
    if (old) {
      if (old.versionId !== versionId || old.revision !== revision)
        throw new ReviewError("提交識別碼已用於另一份草稿。");
      return old;
    }
    this.assertOwner(versionId, clientId);
    const d = this.state.draft;
    if (d.revision !== revision)
      throw new ReviewError("請等草稿保存完成後再提交。");
    if (!d.annotations.length)
      throw new ReviewError("請先加入點標籤或塗選區域。", 400, "EMPTY");
    const item = {
      id: submissionId,
      versionId,
      revision,
      createdAt: Date.now(),
      status: "saved",
      model: structuredClone(this.state.active),
      annotations: structuredClone(d.annotations),
      camera: d.camera,
    };
    this.state.submissions.push(item);
    atomicJson(path.join(this.dir, "submissions", `${item.id}.json`), item);
    this.save();
    return item;
  }
  submissionStatus(id, status, extra = {}) {
    const s = this.state.submissions.find((x) => x.id === id);
    if (!s) throw new ReviewError("找不到提交。", 404);
    Object.assign(s, { status }, extra);
    if (status === "accepted" && this.state.draft?.versionId === s.versionId)
      this.state.draft.submittedRevision = s.revision;
    atomicJson(path.join(this.dir, "submissions", `${s.id}.json`), s);
    this.save();
    return s;
  }
  finish(versionId, clientId) {
    this.assertOwner(versionId, clientId);
    const s = this.state;
    const d = s.draft;
    if (d.annotations.length && d.submittedRevision !== d.revision)
      throw new ReviewError(
        "仲有未提交標注，請先提交；草稿已保留。",
        409,
        "UNSUBMITTED",
      );
    if (s.pending) {
      s.active = s.pending;
      s.pending = null;
      s.draft = null;
      s.generation += 1;
    }
    // Keep submitted markings when no new model exists. Starting another review preserves them.
    s.lock = null;
    this.save();
    return this.publicState(clientId);
  }
  resume(versionId, clientId) {
    this.assertVersion(versionId);
    if (
      this.state.lock &&
      this.state.lock.clientId !== clientId &&
      Date.now() - this.state.lock.touchedAt < 30000
    )
      throw new ReviewError(
        "原視窗仍在線，請先關閉原視窗，30 秒後再接續。",
        423,
        "LOCKED",
      );
    this.state.lock = { versionId, clientId, touchedAt: Date.now() };
    this.save();
    return this.publicState(clientId);
  }
  heartbeat(clientId) {
    if (this.state.lock?.clientId === clientId) {
      this.state.lock.touchedAt = Date.now();
      this.save();
    }
  }
}
