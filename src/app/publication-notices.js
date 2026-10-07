import { t } from "../i18n/index.js";

export function bindPublicationNotices(review) {
  // Reserve a row outside the canvas: even a long translation must leave the
  // cube, toolbar and mark panel reachable on a phone. Labels are model data,
  // so use textContent rather than interpolating them into HTML.
  const container = document.createElement("div");
  container.id = "publication-notices";
  container.hidden = true;
  review.$("#version-tabs").after(container);
  const skipped = document.createElement("div");
  skipped.id = "skipped-notice";
  skipped.className = "publication-notice";
  skipped.hidden = true;
  skipped.setAttribute("role", "status");
  container.append(skipped);
  review.updatePublicationNotices = () => {
    // Skipped geometry belongs to the immutable version record.
    // Read its numeric count rather than parsing the agent's English notice,
    // so old records without that optional field keep their original behavior.
    const model = review.state?.model || review.state?.active;
    const count = model?.id === review.loadedId ? model.skippedPrimitives : 0;
    skipped.hidden =
      !(count > 0) || !review.initialDraftRestored || review.accessBlocked;
    if (!skipped.hidden)
      skipped.textContent = t("notice.skippedPrimitives", { count });
    container.hidden = skipped.hidden;
  };
}
