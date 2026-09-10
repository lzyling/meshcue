import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { normalizeOrigin } from "./origin.mjs";

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
  constructor(dir, { legacyOrigin = null } = {}) {
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
    // Keep immutable published assets downloadable even when an unsubmitted
    // view has not yet observed a newer active version.
    this.state.models ||= {};
    for (const model of [
      this.state.active,
      this.state.pending,
      ...this.state.submissions.map((s) => s.model),
    ]) {
      if (model) this.state.models[model.id] ||= model;
    }
    // Freeze legacy routing once, separately from immutable submission files.
    // A subsequent config edit must never redirect an old submission retry.
    if (!Object.hasOwn(this.state, "reviewOrigin"))
      this.state.reviewOrigin = normalizeOrigin(legacyOrigin);
    if (!this.state.reviewId) {
      this.state.reviewId = crypto.randomUUID();
      // Only the pre-0.4 active review may import a model-only browser cache.
      if (this.state.active)
        this.state.legacyDraftReviewId = this.state.reviewId;
    }
    if (!Object.hasOwn(this.state, "pendingOrigin"))
      this.state.pendingOrigin = this.state.pending
        ? structuredClone(this.state.reviewOrigin)
        : null;
    if (!Object.hasOwn(this.state, "legacySubmissionOrigins"))
      this.state.legacySubmissionOrigins = Object.fromEntries(
        this.state.submissions
          .filter((item) => !Object.hasOwn(item, "origin"))
          .map((item) => [item.id, normalizeOrigin(legacyOrigin)]),
      );
    this.state.bindingId ||= crypto.randomUUID();
    this.state.modelBindings ||= {};
    this.state.legacySubmissionBindings ||= Object.fromEntries(
      this.state.submissions
        .filter((item) => !item.bindingId)
        .map((item) => [
          item.id,
          isDeepStrictEqual(
            this.submissionOrigin(item),
            this.state.reviewOrigin,
          )
            ? this.state.bindingId
            : null,
        ]),
    );
    if (this.state.active)
      this.registerModelBinding(this.state.active.id, this.state.bindingId);
    if (this.state.pending) {
      this.state.pendingBindingId ||= isDeepStrictEqual(
        this.state.pendingOrigin,
        this.state.reviewOrigin,
      )
        ? this.state.bindingId
        : crypto.randomUUID();
      this.registerModelBinding(
        this.state.pending.id,
        this.state.pendingBindingId,
      );
    }
    this.save();
  }
  registerModelBinding(modelId, bindingId) {
    const bindings = (this.state.modelBindings[modelId] ||= []);
    if (!bindings.includes(bindingId)) bindings.push(bindingId);
  }
  modelInBinding(filename) {
    return Object.values(this.state.models).some(
      (model) =>
        model.filename === filename &&
        this.state.modelBindings[model.id]?.includes(this.state.bindingId),
    );
  }
  submissionInBinding(item) {
    return (
      (item.bindingId ?? this.state.legacySubmissionBindings[item.id]) ===
      this.state.bindingId
    );
  }
  save() {
    atomicJson(this.file, this.state);
  }
  publicState(clientId) {
    const s = this.state;
    return {
      generation: s.generation,
      reviewId: s.reviewId,
      legacyDraftCache: s.legacyDraftReviewId === s.reviewId,
      active: s.active,
      pending: s.pendingBindingId === s.bindingId ? s.pending : null,
      locked: !!s.lock,
      owned: s.lock?.clientId === clientId,
      draft: s.draft,
      echo:
        s.echo?.versionId === s.active?.id &&
        s.submissions.some(
          (item) =>
            item.id === s.echo.submissionId && this.submissionInBinding(item),
        )
          ? s.echo
          : null,
      submissions: s.submissions
        .filter((item) => this.submissionInBinding(item))
        .slice(-20)
        .map(({ annotations, origin, ...x }) => x),
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
  freshDraft(versionId) {
    // A content-addressed model can be published again later. Never reuse a
    // version/revision pair: the browser uses it to recover submission IDs.
    const revision = this.state.submissions.reduce(
      (n, s) => (s.versionId === versionId ? Math.max(n, s.revision) : n),
      0,
    );
    return {
      versionId,
      revision,
      annotations: [],
      camera: null,
      submittedRevision: null,
      labelCursor: 0,
    };
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
    s.draft ||= this.freshDraft(versionId);
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
  updateDraft({
    versionId,
    clientId,
    revision,
    annotations,
    camera,
    labelCursor,
  }) {
    this.assertOwner(versionId, clientId);
    const draft = this.state.draft;
    // The server may have saved a PUT whose response was lost. Accept only
    // the identical immediately previous write; other stale edits still fail.
    if (
      revision === draft.revision - 1 &&
      isDeepStrictEqual(annotations, draft.annotations) &&
      isDeepStrictEqual(camera, draft.camera) &&
      (labelCursor === undefined || labelCursor === draft.labelCursor)
    )
      return structuredClone(draft);
    if (revision !== draft.revision)
      throw new ReviewError(
        "草稿已更新，請重新載入已保存版本。",
        409,
        "STALE_DRAFT",
      );
    const letters = annotations
      .filter((a) => a.type === "pin" && /^[A-Z]+$/.test(a.label))
      .map((a) =>
        [...a.label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
      );
    draft.labelCursor = Math.max(
      draft.labelCursor || 0,
      labelCursor || 0,
      ...letters,
    );
    draft.revision += 1;
    draft.annotations = annotations;
    draft.camera = camera;
    this.state.lock.touchedAt = Date.now();
    this.save();
    return structuredClone(draft);
  }
  bindOrigin(value, { resumeGeneration = false } = {}) {
    const origin = normalizeOrigin(value);
    if (isDeepStrictEqual(origin, this.state.reviewOrigin)) return;
    const withoutGeneration = (o) =>
      o &&
      Object.fromEntries(
        Object.entries(o).filter(([key]) => key !== "sessionId"),
      );
    if (
      resumeGeneration &&
      origin?.sessionId &&
      isDeepStrictEqual(
        withoutGeneration(origin),
        withoutGeneration(this.state.reviewOrigin),
      )
    ) {
      const previous = this.state.reviewOrigin;
      this.state.reviewOrigin = origin;
      if (isDeepStrictEqual(this.state.pendingOrigin, previous))
        this.state.pendingOrigin = structuredClone(origin);
      // Explicit continuation of this project, not a new review. Browser trust,
      // tab ownership and drafts remain; immutable old batches keep old origins.
      this.save();
      return;
    }
    const d = this.state.draft;
    if (
      this.state.lock ||
      (d &&
        (d.annotations.length || d.submittedRevision != null) &&
        d.submittedRevision !== d.revision)
    )
      throw new ReviewError(
        "請先完成原會話的審閱；綁定與草稿沒有被改動。",
        423,
        "ORIGIN_BUSY",
      );
    this.state.reviewOrigin = origin;
    this.state.reviewId = crypto.randomUUID();
    this.state.bindingId = crypto.randomUUID();
    this.state.echo = null;
    if (this.state.active) {
      this.registerModelBinding(this.state.active.id, this.state.bindingId);
      this.state.draft = this.freshDraft(this.state.active.id);
    }
    this.state.generation += 1;
    this.save();
  }
  submissionOrigin(item) {
    return Object.hasOwn(item, "origin")
      ? item.origin
      : (this.state.legacySubmissionOrigins[item.id] ?? null);
  }
  publish(model, value = this.state.reviewOrigin) {
    const s = this.state;
    const origin = normalizeOrigin(value);
    if (s.active?.id === model.id || s.pending?.id === model.id) {
      const existing =
        s.pending?.id === model.id ? s.pendingOrigin : s.reviewOrigin;
      if (!isDeepStrictEqual(origin, existing))
        throw new ReviewError(
          "此模型已有原會話綁定，請先完成該輪審閱。",
          423,
          "ORIGIN_BUSY",
        );
      return {
        status: s.pending?.id === model.id ? "queued" : "active",
        model,
      };
    }
    s.models[model.id] = structuredClone(model);
    const bindingId = isDeepStrictEqual(origin, s.reviewOrigin)
      ? s.bindingId
      : crypto.randomUUID();
    this.registerModelBinding(model.id, bindingId);
    if (s.lock) {
      s.pending = model;
      s.pendingOrigin = origin;
      s.pendingBindingId = bindingId;
      this.save();
      return {
        status: "queued",
        model,
        reason: "使用者正在審閱，沒有更換目前模型。",
      };
    }
    s.active = model;
    s.pending = null;
    s.pendingOrigin = null;
    s.reviewOrigin = origin;
    s.bindingId = bindingId;
    s.pendingBindingId = null;
    s.reviewId = crypto.randomUUID();
    const draft = this.freshDraft(model.id);
    s.draft = draft.revision ? draft : null;
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
    if (!d.annotations.length && d.submittedRevision == null)
      throw new ReviewError("請先加入點標籤或塗選區域。", 400, "EMPTY");
    const item = {
      id: submissionId,
      versionId,
      revision,
      createdAt: Date.now(),
      status: "saved",
      reviewId: this.state.reviewId,
      bindingId: this.state.bindingId,
      origin: structuredClone(this.state.reviewOrigin),
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
    if (
      status === "accepted" &&
      this.submissionInBinding(s) &&
      this.state.draft?.versionId === s.versionId
    )
      this.state.draft.submittedRevision = Math.max(
        this.state.draft.submittedRevision ?? -1,
        s.revision,
      );
    atomicJson(path.join(this.dir, "submissions", `${s.id}.json`), s);
    this.save();
    return s;
  }
  acknowledgeRead(id, versionId) {
    const submission = this.state.submissions.find(
      (s) => s.id === id && s.versionId === versionId,
    );
    if (!submission) throw new ReviewError("提交或模型版本不符。", 404);
    // Explicit local Agent read acknowledgment, never inferred from chat.send.
    return this.submissionStatus(id, submission.status, {
      readAt: submission.readAt || Date.now(),
    });
  }
  setEcho({ submissionId, versionId, summary, annotations }) {
    this.assertVersion(versionId);
    const submission = this.state.submissions.find(
      (s) => s.id === submissionId && s.versionId === versionId,
    );
    if (!submission || !this.submissionInBinding(submission))
      throw new ReviewError("找不到此輪對應提交。", 404);
    this.state.echo = {
      id: crypto.randomUUID(),
      submissionId,
      versionId,
      revision: submission.revision,
      summary,
      annotations,
      createdAt: Date.now(),
    };
    this.save();
    return this.state.echo;
  }
  finish(versionId, clientId) {
    this.assertOwner(versionId, clientId);
    const s = this.state;
    const d = s.draft;
    if (
      (d.annotations.length || d.submittedRevision != null) &&
      d.submittedRevision !== d.revision
    )
      throw new ReviewError(
        "仲有未提交標注，請先提交；草稿已保留。",
        409,
        "UNSUBMITTED",
      );
    if (s.pending) {
      s.active = s.pending;
      s.pending = null;
      s.reviewOrigin = s.pendingOrigin;
      s.bindingId = s.pendingBindingId;
      s.pendingBindingId = null;
      s.pendingOrigin = null;
      s.reviewId = crypto.randomUUID();
      const draft = this.freshDraft(s.active.id);
      s.draft = draft.revision ? draft : null;
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
