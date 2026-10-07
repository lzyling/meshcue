import { newId } from "../browser-crypto.js";
import { t, ta } from "../i18n/index.js";
import { letterLabel, letterNumber } from "../annotation-edits.js";
export function installDraft(review) {
  function draftKey() {
    return `${review.DRAFT_PREFIX}${review.loadedId}-${review.loadedReviewId}`;
  }

  // Every version keeps its own cached draft, and a new review generation starts
  // another set, so the keys only ever accumulate. Exhausting the quota is not
  // cosmetic here: it is exactly what puts the page into the mode that stops
  // editing to protect an unsynced draft. Age cannot decide what goes — an older
  // review's draft is precisely what the kept-draft promise covers.
  // Being unsynced can: a cache that matches what the server already holds costs
  // a reload to rebuild and nothing to lose. Recovery backups are never touched;
  // they exist because something was already at risk.
  function sweepDraftCache() {
    const mine = review.draftKey();
    const spent = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(review.DRAFT_PREFIX) || key === mine) continue;
      if (key.slice(review.DRAFT_PREFIX.length).includes("-recovery-"))
        continue;
      try {
        if (JSON.parse(localStorage.getItem(key))?.dirty === true) continue;
      } catch {
        // Unreadable is not recoverable either way, and it still costs quota.
      }
      spent.push(key);
    }
    for (const key of spent) localStorage.removeItem(key);
  }

  function cacheDraft() {
    if (review.recoveryBlocked) return false;
    try {
      localStorage.setItem(
        review.draftKey(),
        JSON.stringify({
          annotations: review.annotations,
          labelCursor: review.labelCursor,
          revision: review.revision,
          dirty: review.editSeq > review.savedSeq,
          editSeq: review.editSeq,
          savedSeq: review.savedSeq,
          pendingWrite: review.pendingWrite,
          camera: review.viewer.cameraState(),
        }),
      );
    } catch {
      review.toast(t("save.storageFull"));
      return false;
    }
    return true;
  }

  function historyPush() {
    review.undoStack.push(JSON.stringify(review.annotations));
    while (
      review.undoStack.length > 20 ||
      review.undoStack.reduce((n, x) => n + x.length, 0) > 8_000_000
    )
      review.undoStack.shift();
    review.redoStack = [];
  }

  function nextLabel() {
    return letterLabel(++review.labelCursor);
  }

  function changed() {
    review.editSeq++;
    if (review.disconnected) review.offlineDraftPending = true;
    review.submissionKey = null;
    review.cacheDraft();
    review.renderAnnotations();
    review.$("#save-status").textContent = t("save.saving");
    clearTimeout(review.saveTimer);
    review.saveTimer = setTimeout(
      () => review.flushDraft().catch((e) => review.toast(e.message)),
      500,
    );
    review.updateButtons();
  }

  async function beginEdit() {
    if (
      !review.loadedId ||
      !review.viewer.enabled ||
      review.submitting ||
      review.recoveryBlocked ||
      review.accessBlocked
    )
      return false;
    if (review.beginFlight) return review.beginFlight;
    review.beginFlight = (async () => {
      const result = await review.api("review/begin", review.owner());
      review.state = { ...review.state, ...result };
      review.historyPush();
      review.updateButtons();
      return true;
    })();
    try {
      return await review.beginFlight;
    } finally {
      review.beginFlight = null;
    }
  }

  async function flushDraft() {
    if (review.saveFlight) {
      await review.saveFlight;
      if (review.editSeq > review.savedSeq) return flushDraft();
      return;
    }
    if (review.editSeq === review.savedSeq || !review.loadedId) return;
    // An uncertain write must be replayed unchanged: the server may have saved it
    // before its response was lost, while the user has already made another edit.
    review.pendingWrite ||= {
      revision: review.revision,
      labelCursor: review.labelCursor,
      /* Bounds travel with the mark so the service can describe it without
       holding geometry, and so the agent can be told where a mark is without
       being handed every coordinate in it.

       They are attached on the way out and dropped on the way back in
       (`withoutBounds`). Bounds are a projection of the faces, not a second
       fact about the mark, and the page always has the geometry to recompute
       them. Keeping them only on the wire is what makes a mark read back equal
       to the mark that was made — which it was not, for exactly one release. */
      annotations: review.clone(review.annotations).map((a) => {
        const bounds = review.viewer.annotationBounds(a);
        return bounds ? { ...a, bounds } : a;
      }),
      camera: review.viewer.cameraState(),
      seq: review.editSeq,
    };
    review.cacheDraft();
    const seq = review.pendingWrite.seq,
      modelId = review.loadedId,
      payload = {
        ...review.owner(),
        revision: review.pendingWrite.revision,
        labelCursor: review.pendingWrite.labelCursor ?? review.labelCursor,
        annotations: review.viewer.serializeAnnotations(
          review.pendingWrite.annotations,
        ),
        camera: review.pendingWrite.camera,
      };
    review.saveFlight = (async () => {
      try {
        const draft = await review.api("draft", payload, "PUT");
        if (review.loadedId !== modelId) return;
        review.revision = draft.revision;
        review.savedSeq = seq;
        review.pendingWrite = null;
        review.state.draft = {
          ...draft,
          annotations: undefined,
          annotationCount: review.annotations.length,
        };
        // Refresh permissions on the same round trip. Otherwise the first mark
        // leaves the buttons grey until the next poll, and re-deriving them here
        // would put the decision back in the browser, where it went wrong.
        if (draft.capabilities) review.state.capabilities = draft.capabilities;
        review.cacheDraft();
        review.$("#save-status").textContent =
          review.editSeq === review.savedSeq
            ? t("save.saved")
            : t("save.saving");
      } catch (e) {
        review.$("#save-status").textContent =
          e.code === "CONNECTION_LOST" ? e.message : t("save.unsynced");
        throw e;
      } finally {
        review.saveFlight = null;
        review.updateButtons();
      }
    })();
    await review.saveFlight;
    if (review.editSeq > review.savedSeq) return flushDraft();
  }

  async function travelHistory(redo = false) {
    const from = redo ? review.redoStack : review.undoStack,
      to = redo ? review.undoStack : review.redoStack;
    if (!from.length) return;
    try {
      const savedUndo = [...review.undoStack],
        savedRedo = [...review.redoStack];
      if (!(await review.beginEdit())) return;
      review.undoStack = savedUndo;
      review.redoStack = savedRedo;
      const actualFrom = redo ? review.redoStack : review.undoStack,
        actualTo = redo ? review.undoStack : review.redoStack;
      actualTo.push(JSON.stringify(review.annotations));
      review.annotations = JSON.parse(actualFrom.pop());
      review.selectedId = null;
      review.changed();
      await review.flushDraft();
    } catch (e) {
      review.toast(e.message);
    }
  }

  function showRecovery(backup) {
    if (review.recoveryUrl) URL.revokeObjectURL(review.recoveryUrl);
    review.recoveryUrl = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    review.$("#download-recovery").href = review.recoveryUrl;
    review.$("#download-recovery").download =
      `meshcue-${review.loadedId}-unsynced.json`;
    review.$("#recovery-banner").hidden = false;
  }

  async function restoreDraft(draft) {
    review.annotations = review.withoutBounds(review.clone(draft?.annotations));
    review.labelCursor = Math.max(
      draft?.labelCursor || 0,
      ...review.annotations
        .filter((a) => ["pin", "edge", "part"].includes(a.type))
        .map((a) => letterNumber(a.label)),
    );
    review.revision = draft?.revision || 0;
    review.editSeq = 0;
    review.savedSeq = 0;
    review.pendingWrite = null;
    review.recoveryBlocked = false;
    review.viewer.restoreCamera(draft?.camera, { fit: true });
    let cached;
    try {
      cached = JSON.parse(localStorage.getItem(review.draftKey()));
      if (!cached && review.state.legacyDraftCache)
        cached = JSON.parse(
          localStorage.getItem(`3d-review-draft-${review.loadedId}`),
        );
      const backupKey = localStorage.getItem(
        `${review.draftKey()}-recovery-latest`,
      );
      if (backupKey) {
        const backup = JSON.parse(localStorage.getItem(backupKey));
        if (backup) review.showRecovery(backup);
      }
    } catch {}
    // Take the round before anything can return early, and take it unconditionally.
    // This used to sit below the clean-cache exit and behind an ownership test, so
    // a reviewer whose draft was fully saved never claimed it back and had no way
    // to reach it: no banner, no button, and the page offered no explanation.
    // Claiming also returns a draft newer than the poll this load started from.
    try {
      review.state = await review.api("review/begin", review.owner());
      draft = review.state.draft;
      review.annotations = review.withoutBounds(
        review.clone(draft?.annotations),
      );
      review.labelCursor = Math.max(
        draft?.labelCursor || 0,
        ...review.annotations
          .filter((a) => ["pin", "edge", "part"].includes(a.type))
          .map((a) => letterNumber(a.label)),
      );
      review.revision = draft?.revision || 0;
    } catch (e) {
      if (e.code !== "NOT_READY") throw e;
    }
    if (!cached?.dirty) return;
    const uncertainWriteMatches =
      cached.pendingWrite?.revision === review.revision - 1 &&
      review.sameValue(
        review.viewer.serializeAnnotations(cached.pendingWrite.annotations),
        draft?.annotations,
      ) &&
      review.sameValue(cached.pendingWrite.camera, draft?.camera);
    if (cached.revision === review.revision || uncertainWriteMatches) {
      review.annotations = cached.annotations;
      review.labelCursor = Math.max(
        review.labelCursor,
        cached.labelCursor || 0,
        ...review.annotations
          .filter((a) => ["pin", "edge", "part"].includes(a.type))
          .map((a) => letterNumber(a.label)),
      );
      review.viewer.restoreCamera(cached.camera, { fit: true });
      review.editSeq = cached.editSeq || 1;
      review.savedSeq = cached.savedSeq || 0;
      review.pendingWrite = cached.pendingWrite || null;
      review.toast(t("recovery.restored"));
      return;
    }
    // A genuine concurrent conflict is not an acknowledgement retry. Keep the
    // complete local draft under a separate durable key before allowing edits.
    const backup = { versionId: review.loadedId, ...cached };
    review.showRecovery(backup);
    try {
      const key = `${review.draftKey()}-recovery-${newId()}`;
      localStorage.setItem(key, JSON.stringify(backup));
      const superseded = localStorage.getItem(
        `${review.draftKey()}-recovery-latest`,
      );
      localStorage.setItem(`${review.draftKey()}-recovery-latest`, key);
      // Write, repoint, then drop: a crash never strands the pointer. Only the
      // latest backup is ever offered, so keeping older copies just consumes the
      // quota that has to protect the next unsynced draft.
      if (superseded && superseded !== key) localStorage.removeItem(superseded);
      review.cacheDraft();
      review.toast(ta("recovery.backedUp"));
    } catch {
      review.recoveryBlocked = true;
      review.toast(ta("recovery.paused"));
    }
  }

  function sameValue(left, right) {
    if (left === right) return true;
    if (
      !left ||
      !right ||
      typeof left !== "object" ||
      typeof right !== "object"
    )
      return false;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
      )
    );
  }

  Object.assign(review, {
    draftKey,
    sweepDraftCache,
    cacheDraft,
    historyPush,
    nextLabel,
    changed,
    beginEdit,
    flushDraft,
    travelHistory,
    showRecovery,
    restoreDraft,
    sameValue,
  });
}

export function initializeDraftCache(review) {
  review.DRAFT_PREFIX = "3d-review-draft-";
}

export function initializeDraftSerialization(review) {
  // The other half of the note beside `bounds` in `flushDraft`: what the service
  // added for its own description is taken back off, so the page holds marks in
  // one shape whether it just made them or just read them.
  review.withoutBounds = (list) =>
    (list || []).map((a) => {
      if (!a?.bounds || a.type === "part") return a;
      const { bounds: _bounds, ...rest } = a;
      return rest;
    });
}

export function bindDraftUnload(review) {
  window.addEventListener("beforeunload", (e) => {
    if (review.editSeq > review.savedSeq) {
      review.cacheDraft();
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

export function bindResume(review) {
  review.$("#resume-review").addEventListener("click", async () => {
    if (review.submitting) return;
    review.submitting = true;
    review.updateButtons();
    try {
      review.state = await review.api("review/resume", review.owner());
      await review.restoreDraft(review.state.draft);
      review.selectedId = null;
      review.undoStack = [];
      review.redoStack = [];
      review.renderAnnotations();
      if (review.editSeq > review.savedSeq) await review.flushDraft();
      review.toast(t("resume.picked"));
    } catch (e) {
      review.toast(e.message);
    } finally {
      review.submitting = false;
      review.updateButtons();
    }
  });
}
