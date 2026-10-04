import { latestVersion } from "../versions.js";
import { t } from "../i18n/index.js";
export function installVersionsBar(review) {
  // Tabs are the whole point of keeping every version: a marking made against an
  // earlier model stays a first-class act instead of something the reviewer has
  // to describe in prose. Each tab carries its own draft, so switching is free.
  function renderVersions() {
    const bar = review.$("#version-tabs");
    const versions = review.state?.versions || [];
    bar.hidden = versions.length < 2;
    if (bar.hidden) {
      bar.textContent = "";
      return;
    }
    const signature = versions
      .map(
        (v) =>
          `${v.id}:${v.active}:${v.annotations}:${v.unsubmitted}:${v.submissions}:${v.busy}:${v.id === review.viewingId}`,
      )
      .join("|");
    if (bar.dataset.signature === signature) return;
    bar.dataset.signature = signature;
    bar.textContent = "";
    for (const v of versions) {
      const tab = document.createElement("button");
      tab.className = "version-tab";
      tab.type = "button";
      tab.role = "tab";
      tab.dataset.versionId = v.id;
      tab.setAttribute("aria-selected", String(v.id === review.viewingId));
      if (v.id === review.viewingId) tab.classList.add("selected");
      if (v.active) tab.classList.add("current");
      const marks = v.annotations || v.submissions;
      tab.title = [
        v.name,
        v.version,
        t("model.triangles", { count: (v.triangles || 0).toLocaleString() }),
        v.active ? t("version.showingNow") : t("version.earlier"),
        v.submissions ? t("version.submitted", { count: v.submissions }) : null,
        v.busy ? t("version.openElsewhere") : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const caption = document.createElement("span");
      caption.textContent =
        v.label || v.version || v.name || t("common.version");
      tab.append(caption);
      if (marks) {
        const badge = document.createElement("em");
        badge.className = v.unsubmitted ? "badge unsent" : "badge";
        badge.textContent = String(marks);
        tab.append(badge);
      }
      tab.addEventListener("click", () => review.selectVersion(v.id));
      bar.append(tab);
    }
    // The tabs were replaced a statement ago; their positions, and the width the
    // strip can scroll through, are only settled once the browser has laid them
    // out. Asking now reads the old strip and scrolls to a place that is gone.
    requestAnimationFrame(() => {
      review.revealCurrentVersion(bar);
      review.markVersionOverflow(bar);
    });
  }

  /* A strip that scrolls can hide the tab you are standing on. Seventeen versions
   deep, the one being marked is off the right-hand end on load, and a reviewer
   looking for where he is finds an empty rail. Only move when it is actually
   out of sight: scrolling on every render would fight anyone reading along it. */
  function revealCurrentVersion(bar) {
    const tab = bar.querySelector(".version-tab.selected");
    if (!tab) return;
    // Measured against the strip itself, not offsetLeft: the strip is not a
    // positioned element, so offsetLeft counts from some ancestor and scrolling
    // by it lands somewhere else entirely.
    const rail = bar.getBoundingClientRect(),
      seat = tab.getBoundingClientRect();
    if (seat.left < rail.left) bar.scrollLeft -= rail.left - seat.left + 12;
    else if (seat.right > rail.right)
      bar.scrollLeft += seat.right - rail.right + 12;
  }

  function markVersionOverflow(bar) {
    const scrollable = bar.scrollWidth - bar.clientWidth;
    bar.classList.toggle("overflow-start", bar.scrollLeft > 1);
    bar.classList.toggle("overflow-end", bar.scrollLeft < scrollable - 1);
  }

  function wasRefused(model, reviewId) {
    return (
      review.refusedLoad?.versionId === model.id &&
      review.refusedLoad.sha256 === (model.mesh ?? model).sha256 &&
      review.refusedLoad.reviewId === reviewId
    );
  }

  function restoreVersionChoice(incoming) {
    if (review.restoredVersionChoice || !incoming.active) return;
    review.restoredVersionChoice = true;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`meshcue-view-${incoming.reviewId}`),
      );
      // An agent activation since the last visit wins. Old reviews and removed
      // versions must never send the page back to an unavailable model.
      if (
        saved?.activeId === incoming.active.id &&
        incoming.versions.some((version) => version.id === saved.viewingId)
      ) {
        review.viewingId = saved.viewingId;
        review.followActive = saved.viewingId === incoming.active.id;
      }
    } catch {
      /* Storage is optional; the active model remains the fallback. */
    }
  }

  function rememberVersionChoice() {
    try {
      localStorage.setItem(
        `meshcue-view-${review.loadedReviewId}`,
        JSON.stringify({
          viewingId: review.viewingId,
          activeId: review.state?.active?.id,
        }),
      );
    } catch {
      /* A full or disabled store must not prevent model loading. */
    }
  }

  async function selectVersion(id) {
    if (
      !id ||
      id === review.viewingId ||
      review.loadFlight ||
      review.submitting
    )
      return;
    // Clicking a tab is asking again on purpose, which is allowed to fail again.
    review.refusedLoad = null;
    // Switching costs a full re-tessellation, and the guard above silently drops
    // anything clicked during one. Make the strip look as unavailable as it is,
    // so the clicks are not made in the first place.
    review.$("#version-tabs").classList.add("busy");
    // Claim the load slot before the first await. The poll starts its own load
    // whenever the Agent's version differs, and two loads racing each other end
    // as a hash mismatch: bytes from one model checked against another's digest.
    review.loadFlight = (async () => {
      if (review.editSeq > review.savedSeq)
        await review.flushDraft().catch((e) => review.toast(e.message));
      review.viewingId = id;
      // Choosing the version the Agent is showing hands the choice back to it.
      review.followActive = id === review.state?.active?.id;
      review.rememberVersionChoice();
      const full = await review.api(
        `state?clientId=${encodeURIComponent(review.clientId)}&versionId=${encodeURIComponent(id)}&full=1`,
      );
      review.state = full;
      await review.loadVersion(full);
    })();
    try {
      await review.loadFlight;
    } finally {
      review.loadFlight = null;
      review.$("#version-tabs").classList.remove("busy");
      review.renderVersions();
      review.updateButtons();
    }
  }

  async function loadVersion(fullState) {
    const model = fullState.model || fullState.active;
    if (!model) return;
    review.viewingId = fullState.viewing || model.id;
    review.loadedId = model.id;
    review.loadedFilename = model.filename;
    review.loadedReviewId = fullState.reviewId;
    review.sweepDraftCache();
    review.loadedReceipt = null;
    review.labelCursor = 0;
    review.echoId = null;
    review.relocatingId = null;
    // A new version has nothing said about it yet, so neither the bubble nor the
    // way to ask for it belongs on screen until the Agent speaks again.
    review.$("#echo-recall").hidden = true;
    review.hideEcho();
    review.initialDraftRestored = false;
    review.annotations = [];
    review.selectedId = null;
    review.revision = 0;
    review.editSeq = 0;
    review.savedSeq = 0;
    review.undoStack = [];
    review.redoStack = [];
    review.submissionKey = null;
    review.pendingWrite = null;
    review.recoveryBlocked = false;
    review.$("#recovery-banner").hidden = true;
    review.$("#model-name").textContent = model.name;
    review.$("#model-version").textContent = model.version;
    review.loadedUnits = model.units || "unspecified";
    review.$("#model-info").textContent =
      `${model.format.toUpperCase()} · ${review.unitsLabel(model.units)}`;
    review.$("#loading").hidden = false;
    review.$("#loading .spinner").hidden = false;
    review.$("#loading-text").textContent = t("loading.verifying");
    review.$("#loading-hint").textContent = t("loading.hint");
    review.$("#save-status").textContent = t("save.verifying");
    try {
      const stats = await review.viewer.load(
        model,
        // A source the viewer cannot draw travels with a mesh derived from it at
        // import. The page loads that mesh; `download` still hands over the file
        // the author published.
        review.endpoint(`api/models/${(model.mesh ?? model).filename}`),
        (stage) => {
          review.$("#loading-text").textContent = stage;
        },
      );
      if (!stats) return;
      review.$("#model-info").textContent = t("model.summary", {
        count: model.triangles.toLocaleString(),
        format: model.format.toUpperCase(),
        units: review.unitsLabel(model.units),
      });
      // The mesh budget is still measured and still reported to acceptance
      // checks; it no longer warns anyone, because nothing about marking changes
      // when it runs out. See server/models.mjs for the measurement that settled
      // it.
      review.loadedPrecision = stats;
      await review.restoreDraft(fullState.draft);
      review.initialDraftRestored = true;
      review.rememberVersionChoice();
      review.renderAnnotations();
      review.$("#loading").hidden = true;
      review.$("#save-status").textContent =
        review.editSeq > review.savedSeq
          ? t("save.restoring")
          : review.annotations.length
            ? t("save.saved")
            : t("save.notStarted");
      review.updateButtons();
      if (review.editSeq > review.savedSeq)
        await review.flushDraft().catch((e) => review.toast(e.message));
    } catch (e) {
      if (!review.initialDraftRestored) {
        review.viewer.enabled = false;
        review.loadedId = null;
        review.loadedFilename = null;
        // A settled refusal — bytes that do not match their hash, a model that
        // deforms or is too big to draw — will be the same on a second attempt,
        // so stop asking and leave the reason on screen. Everything else — a
        // dropped fetch, a service restarting — is worth another poll.
        if (e.settled || e.code === "HASH_MISMATCH")
          review.refusedLoad = {
            versionId: model.id,
            sha256: (model.mesh ?? model).sha256,
            reviewId: fullState.reviewId,
          };
      }
      review.$("#loading-text").textContent = e.message;
      review.$("#loading .spinner").hidden = true;
      review.toast(e.message);
      review.updateButtons();
    }
  }

  Object.assign(review, {
    renderVersions,
    revealCurrentVersion,
    markVersionOverflow,
    wasRefused,
    selectVersion,
    restoreVersionChoice,
    rememberVersionChoice,
    loadVersion,
  });
}

export function bindVersionScrolling(review) {
  review
    .$("#version-tabs")
    .addEventListener("scroll", () =>
      review.markVersionOverflow(review.$("#version-tabs")),
    );

  /* A mouse has no horizontal wheel, and Shift+wheel is not something a reviewer
   should have to know to see the versions he was given. A plain wheel over the
   strip moves along it, and only while the strip has somewhere to move. */
  review.$("#version-tabs").addEventListener(
    "wheel",
    (e) => {
      const bar = review.$("#version-tabs");
      if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (bar.scrollWidth <= bar.clientWidth) return;
      e.preventDefault();
      bar.scrollLeft += e.deltaY;
    },
    { passive: false },
  );

  window.addEventListener("resize", () =>
    review.markVersionOverflow(review.$("#version-tabs")),
  );
}

export function bindLatestVersion(review) {
  review.$("#go-latest").addEventListener("click", () => {
    const latest = latestVersion(review.state?.versions);
    if (latest?.id)
      review.selectVersion(latest.id).catch((e) => review.toast(e.message));
  });
}
