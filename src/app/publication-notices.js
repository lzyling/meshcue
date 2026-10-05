import { t } from "../i18n/index.js";

export function bindPublicationNotices(review) {
  // Reserve a row outside the canvas: even a long translation must leave the
  // cube, toolbar and mark panel reachable on a phone. Labels are model data,
  // so use textContent rather than interpolating them into HTML.
  const container = document.createElement("div");
  container.id = "publication-notices";
  container.hidden = true;
  review.$("#version-tabs").after(container);
  const reuse = document.createElement("div");
  reuse.id = "reuse-notice";
  reuse.className = "publication-notice";
  reuse.hidden = true;
  reuse.setAttribute("role", "status");
  const text = document.createElement("span");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "quiet";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", t("common.close"));
  reuse.append(text, dismiss);
  container.append(reuse);
  const skipped = document.createElement("div");
  skipped.id = "skipped-notice";
  skipped.className = "publication-notice";
  skipped.hidden = true;
  skipped.setAttribute("role", "status");
  container.append(skipped);
  let shown = null;
  let observed = null;
  dismiss.addEventListener("click", () => {
    shown = null;
    review.updatePublicationNotices();
  });

  review.updatePublicationNotices = () => {
    const event = review.state?.sameContentReuse;
    // Remember consumption as soon as it is observed, not only on dismissal:
    // a reload is not a new publication. In-memory tracking also avoids poll
    // repeats when browser storage is unavailable.
    if (event && observed !== event.id) {
      observed = event.id;
      const key = `meshcue-reuse-${review.state.reviewId}`;
      let seen = false;
      try {
        seen = sessionStorage.getItem(key) === event.id;
        sessionStorage.setItem(key, event.id);
      } catch {
        // Storage restrictions must never prevent a review from opening.
      }
      shown = seen ? null : event;
    }
    if (!event || (shown && shown.versionId !== review.loadedId)) shown = null;
    reuse.hidden =
      !shown || !review.initialDraftRestored || review.accessBlocked;
    if (shown)
      text.textContent = t("notice.sameContent", { label: shown.label });
    // Unlike reuse, skipped geometry belongs to the immutable version record.
    // Read its numeric count rather than parsing the agent's English notice,
    // so old records without that optional field keep their original behavior.
    const model = review.state?.model || review.state?.active;
    const count = model?.id === review.loadedId ? model.skippedPrimitives : 0;
    skipped.hidden =
      !(count > 0) || !review.initialDraftRestored || review.accessBlocked;
    if (!skipped.hidden)
      skipped.textContent = t("notice.skippedPrimitives", { count });
    container.hidden = reuse.hidden && skipped.hidden;
  };
}
