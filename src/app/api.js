import { t, ta } from "../i18n/index.js";
export function installApi(review) {
  /* The header keeps one small mark for the connection, beside Help and
   Settings, because whether the Agent can still collect is something a
   reviewer needs before they spend ten minutes marking, not after they open a
   dialog to look. Three states, each a different shape as well as a colour --
   a filled dot, a hollow ring, a struck-out ring -- so the difference survives
   colour blindness, a grey-scale screen and a glance. "Reconnecting" is every
   failure the page will keep polling its way out of; "offline" is only the two
   it will not (access gone, review closed), where waiting does not help. The
   words are its accessible name and tooltip, followed by the longer sentence
   the settings dialog still shows, so nothing that was readable there is lost
   here. */
  const CONNECTION_KEYS = {
    connecting: "conn.connecting",
    online: "shell.online",
    reconnecting: "shell.reconnecting",
    offline: "shell.offline",
  };
  function showConnection(state) {
    review.$(".connection-dot").classList.toggle("online", state === "online");
    const dot = review.$("#connection-indicator");
    const words = t(CONNECTION_KEYS[state]),
      detail = review.$("#connection-status").textContent;
    const label = detail && detail !== words ? `${words} · ${detail}` : words;
    dot.dataset.state = state;
    dot.setAttribute("aria-label", label);
    dot.title = label;
  }

  function connectionMessage() {
    if (!review.loadedId || !review.initialDraftRestored)
      return ta("conn.unreachable");
    // Saving a recovered draft is not submitting it. Remember its version
    // across the save/poll race so reconnecting cannot move Send to a different
    // model before the reviewer has handed over these edits.
    if (review.editSeq > review.savedSeq) review.offlineDraftPending = true;
    return t(review.cacheDraft() ? "conn.offlineSaved" : "conn.offlineMemory");
  }

  async function api(path, data, method = "POST") {
    const options =
      data === undefined
        ? {}
        : {
            method,
            headers: {
              "Content-Type": "application/json",
              "X-Review-Client": "1",
            },
            body: JSON.stringify(data),
          };
    let res;
    try {
      res = await fetch(review.endpoint(`api/${path}`), options);
    } catch {
      // Fetch rejects before there is a server response. Keep server refusals
      // on their existing path, and make no promise about disk storage until
      // the current draft has actually been written to this browser's cache.
      review.disconnected = true;
      const message = connectionMessage();
      review.$("#connection-status").textContent = t("conn.paused");
      showConnection(review.accessBlocked ? "offline" : "reconnecting");
      review.$("#save-status").textContent = message;
      review.updateButtons();
      const error = new Error(message);
      error.code = "CONNECTION_LOST";
      throw error;
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error(t("conn.dropped"));
    }
    if (!res.ok) {
      const err = new Error(review.serverMessage(json));
      err.code = json.code;
      if (res.status === 401 || json.code === "REVIEW_FINISHED") {
        review.accessBlocked = true;
        clearTimeout(review.saveTimer);
        if (review.loadedId && review.initialDraftRestored) {
          review.cacheDraft();
          if (review.editSeq > review.savedSeq)
            review.showRecovery({
              versionId: review.loadedId,
              reviewId: review.loadedReviewId,
              annotations: review.annotations,
              camera: review.viewer.cameraState(),
              revision: review.revision,
            });
        } else {
          review.$("#loading-text").textContent = err.message;
          review.$("#loading-hint").textContent = t("conn.connectedNoAccess");
          review.$("#loading .spinner").hidden = true;
        }
        review.updateButtons();
      }
      throw err;
    }
    return json;
  }

  async function readState() {
    try {
      if (
        review.loadFlight ||
        review.beginFlight ||
        review.saveFlight ||
        review.submitting
      )
        return;
      const statePath =
        `state?clientId=${encodeURIComponent(review.clientId)}` +
        (review.viewingId
          ? `&versionId=${encodeURIComponent(review.viewingId)}`
          : "");
      const wasBlocked = review.accessBlocked;
      let incoming;
      try {
        incoming = await review.api(statePath);
      } catch (e) {
        if (e.code !== "ACCESS_REQUIRED") throw e;
        // The host must already have admitted this TCP peer. No credential is
        // supplied by JavaScript or the URL; the response sets an HttpOnly cookie.
        await review.api("access/claim", {});
        review.accessRecoveryNeeded = true;
        incoming = await review.api(statePath);
      }
      review.nameAgent(incoming.agentName, incoming.agentTool);
      // A sibling tab may have collected the shared HttpOnly cookie. This tab
      // still needs its own association even if it did not win /claim.
      if (wasBlocked) review.accessRecoveryNeeded = true;
      if (
        review.loadFlight ||
        review.beginFlight ||
        review.saveFlight ||
        review.submitting
      )
        return;
      if (
        review.accessRecoveryNeeded &&
        review.loadedReceipt &&
        incoming.active?.id === review.loadedId &&
        incoming.reviewId === review.loadedReviewId
      ) {
        // Re-associate only this verified model/tab, then recover its draft using
        // the existing revision/conflict checks. Never claim a foreign edit lock.
        await review.api("ready", {
          ...review.owner(),
          ...review.loadedReceipt,
        });
        incoming = await review.api(`${statePath}&full=1`);
        review.state = incoming;
        await review.restoreDraft(incoming.draft);
        review.renderAnnotations();
      }
      review.accessBlocked = false;
      const recovered = review.accessRecoveryNeeded;
      review.accessRecoveryNeeded = false;
      // Successful polling restores connectivity even when dirty edits defer
      // switching to a newly published version below.
      if (review.disconnected)
        review.$("#save-status").textContent = t(
          review.editSeq > review.savedSeq ? "save.unsynced" : "save.saved",
        );
      review.disconnected = false;
      review.$("#connection-status").textContent = incoming.notifier?.send
        ? t("conn.origin")
        : incoming.owned || review.state?.submissions?.length
          ? ta("conn.collect")
          : t("conn.local");
      showConnection("online");
      review.updateButtons();
      review.restoreVersionChoice(incoming);
      // A pinned tab survives polls and reloads, until the agent activates a
      // different model. Unsaved edits still defer that switch below.
      if (
        review.state?.active?.id &&
        (incoming.active?.id !== review.state.active.id ||
          (incoming.sameContentReuse?.id &&
            incoming.sameContentReuse.id !== review.state.sameContentReuse?.id))
      )
        review.followActive = true;
      const wanted = review.offlineDraftPending
        ? review.loadedId
        : review.followActive
          ? incoming.active?.id
          : review.viewingId;
      if (
        wanted !== review.loadedId ||
        incoming.reviewId !== review.loadedReviewId
      ) {
        if (review.loadedId && review.editSeq > review.savedSeq) {
          review.toast(t("version.driftStopped"));
          return;
        }
        const full = await review.api(
          `state?clientId=${encodeURIComponent(review.clientId)}&full=1` +
            (wanted ? `&versionId=${encodeURIComponent(wanted)}` : ""),
        );
        if (
          review.beginFlight ||
          review.saveFlight ||
          review.submitting ||
          review.editSeq > review.savedSeq
        )
          return;
        review.state = full;
        const candidate = full.model || full.active;
        if (candidate && review.wasRefused(candidate, full.reviewId)) {
          // Deliberately nothing: the reason this version is not on screen is
          // already on screen, and loading it again would only replace it with a
          // spinner and arrive at the same place.
        } else if (candidate) {
          review.loadFlight = review.loadVersion(full);
          await review.loadFlight;
          review.loadFlight = null;
        } else {
          review.$("#loading-text").textContent = ta("model.awaitingFirst");
          review.$("#loading .spinner").hidden = true;
        }
      } else review.state = incoming;
      review.updatePartGroups?.(review.state);
      if (
        recovered &&
        review.state?.owned &&
        review.editSeq > review.savedSeq &&
        !review.recoveryBlocked
      )
        await review.flushDraft();
      // The compiled-in version is the build this page was cut from, which is
      // only the running one until somebody upgrades the service under an open
      // tab. Once the service has said which it is, it is the one that counts.
      if (incoming.version)
        review.$("#app-version").textContent = incoming.version;
      review.showUpdate(incoming.update);
      review.updateEcho(incoming);
      review.updateOutbox(incoming);
      review.updateClosing(incoming);
      review.updateButtons();
      review.maybeShowOnboarding?.();
    } catch (e) {
      // A service that announced its own reclaim and then stopped answering did
      // not fail. Saying "offline" here would describe a crash, and would leave
      // the reviewer with no reason to believe their marks are still there.
      if (review.wasReclaimed()) {
        review.$("#connection-status").textContent = t("conn.reclaimed");
        showConnection("offline");
        review.$("#save-status").textContent = ta("closing.done");
        review.$("#closing-text").textContent = ta("closing.done");
        review.$("#closing-banner").hidden = false;
        review.updateButtons();
        return;
      }
      review.$("#connection-status").textContent = review.accessBlocked
        ? t("conn.returnToChat")
        : t("conn.paused");
      showConnection(review.accessBlocked ? "offline" : "reconnecting");
      review.$("#save-status").textContent = review.accessBlocked
        ? review.loadedId && review.initialDraftRestored
          ? t("conn.accessExpired")
          : t("conn.noAccess")
        : review.disconnected
          ? connectionMessage()
          : t("conn.offline");
      review.updateButtons();
    }
  }

  // The warning can be called off: anything the reviewer does resets the clock,
  // and the service withdraws the notice on its own. So this follows the service
  // both ways while it is still answering, and only sticks once it stops.
  function updateClosing(incoming) {
    review.closingNotice = incoming.closing || null;
    review.lastIdle = incoming.idle || null;
    review.$("#closing-banner").hidden = !review.closingNotice;
    if (review.closingNotice)
      review.$("#closing-text").textContent = t("closing.pending");
  }

  // Nothing is left to ask, so this is read off the last thing the service said.
  // A reading taken within a couple of announcement ticks of a deadline the
  // service had published in advance, followed by silence, is that deadline
  // arriving — no outage lines up with it that precisely.
  function wasReclaimed() {
    if (review.closingNotice) return true;
    if (!review.lastIdle?.limitMs) return false;
    const slack = Math.max(review.lastIdle.graceMs || 0, 60_000) * 2;
    return review.lastIdle.forMs >= review.lastIdle.limitMs - slack;
  }

  // The one channel that would report a delivery failure is the channel that is
  // failing, so the reviewer is the only person present to tell. A single missed
  // attempt is a blip the retry covers; from the second one the page says so and
  // keeps saying it, with the host's own reason rather than a generic apology.
  function updateOutbox(incoming) {
    const stuck = (incoming.submissions || []).filter(
      (item) =>
        item.status !== "accepted" && !item.readAt && (item.attempts || 0) >= 2,
    );
    review.$("#outbox-banner").hidden = !stuck.length;
    if (!stuck.length) return;
    const stalled = stuck.filter((item) => item.status === "stalled");
    const worst = stalled[0] || stuck[0];
    const reason = worst.lastError?.message
      ? t("outbox.reason", { message: worst.lastError.message })
      : t("outbox.reasonUnknown");
    review.$("#outbox-text").textContent = stalled.length
      ? ta("outbox.stuck", {
          count: stuck.length,
          attempts: worst.attempts,
          reason,
        })
      : ta("outbox.retrying", {
          count: stuck.length,
          attempts: worst.attempts,
          reason,
        });
  }

  /* A mark beside the version, and nothing else. The reviewer is usually not the
   person who installs anything — they were handed a URL — so this says what is
   true and who to tell, and does not pretend the page can act on it. The
   service is silent unless there is genuinely something newer than what is
   installed, so an absent badge is the normal state, not a failed check. */
  function showUpdate(update) {
    const badge = review.$("#app-update");
    if (!update?.version) {
      badge.hidden = true;
      return;
    }
    const hint = ta("app.updateHint", { version: update.version });
    badge.textContent = update.version;
    badge.title = hint;
    badge.setAttribute("aria-label", hint);
    // Release notes if the upstream named them; otherwise it is only a label,
    // and a link that goes nowhere is worse than a word that never claimed to.
    if (update.url) badge.href = update.url;
    else badge.removeAttribute("href");
    badge.hidden = false;
  }

  function pollState() {
    if (review.pollFlight) return review.pollFlight;
    review.pollFlight = review.readState().finally(() => {
      review.pollFlight = null;
    });
    return review.pollFlight;
  }

  function noteActivity(event) {
    if (!event.isTrusted || document.visibilityState !== "visible") return;
    review.activityPending = true;
    review.scheduleActivity();
  }

  function scheduleActivity() {
    if (
      review.activityTimer ||
      review.activityFlight ||
      !review.activityPending ||
      !review.loadedId ||
      review.accessBlocked ||
      document.visibilityState !== "visible"
    )
      return;
    review.activityTimer = setTimeout(
      async () => {
        review.activityTimer = null;
        if (
          document.visibilityState !== "visible" ||
          !review.loadedId ||
          review.accessBlocked
        )
          return;
        review.activityPending = false;
        review.activityFlight = true;
        try {
          await review.api("access/activity", { clientId: review.clientId });
          review.lastActivitySent = Date.now();
        } catch {
          // The state poll handles lost authorization. Keep any unsynced draft.
        } finally {
          review.activityFlight = false;
          scheduleActivity();
        }
      },
      Math.max(0, 60_000 - (Date.now() - review.lastActivitySent)),
    );
  }

  Object.assign(review, {
    api,
    readState,
    updateClosing,
    wasReclaimed,
    updateOutbox,
    showUpdate,
    pollState,
    noteActivity,
    scheduleActivity,
  });
}

export async function startPolling(review) {
  await review.pollState();

  setInterval(review.pollState, 2200);

  // A visible user action extends remembered-browser access. Passive state and
  // lock heartbeats do not count as use; no unconditional renewal timer runs.
  review.activityTimer = null;

  review.activityFlight = false;

  review.activityPending = false;

  review.lastActivitySent = 0;

  for (const event of ["pointerdown", "wheel", "keydown"])
    document.addEventListener(event, review.noteActivity, { passive: true });

  document.addEventListener("visibilitychange", review.noteActivity);

  setInterval(() => {
    if (review.state?.owned && !review.accessBlocked)
      review
        .api("review/heartbeat", {
          clientId: review.clientId,
          versionId: review.loadedId,
        })
        .catch(() => {});
  }, 10000);
}
