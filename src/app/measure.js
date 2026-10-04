import { newId } from "../browser-crypto.js";
import { t } from "../i18n/index.js";
export function installMeasure(review) {
  /* The reading beside the tool, said to a screen reader as it changes: what to
   click next, or what was measured. */
  function showMeasure() {
    const r = review.measureReport;
    review.$("#measure-reading").textContent = r?.result
      ? review.formatMeasure(r.result)
      : r?.picks
        ? t(review.MEASURE_NEXT[r.kind][r.picks - 1])
        : "";
    const can = review.state?.capabilities || {};
    review.$("#keep-measure").disabled =
      !r?.result ||
      review.submitting ||
      !can.canEdit ||
      !review.loadedId ||
      !review.viewer.enabled ||
      review.recoveryBlocked ||
      review.accessBlocked;
  }

  /* Keeping a measurement is the one part of measuring that edits anything: it
   becomes a mark, with the lock, the undo step and the save every mark has,
   and the viewer lets go of it as a measurement. */
  async function keepMeasure() {
    const measuring = review.viewer.measuring;
    const mark = review.viewer.measureMark();
    if (!mark) return;
    if (review.annotations.length >= 200) return review.toast(t("marks.limit"));
    if (
      review.draftBytes() + 120 + review.MEASURE_BYTES + review.VIEW_BYTES >
      review.MAX_MARK_BYTES
    )
      return review.toast(t("marks.nearStrokeLimit"));
    try {
      if (!(await review.beginEdit())) return;
      const item = {
        id: newId(),
        type: "measure",
        label: review.nextMeasureLabel(),
        ...mark,
        view: review.viewer.markView(),
      };
      review.annotations.push(item);
      review.selectedId = item.id;
      if (review.viewer.measuring === measuring) review.viewer.clearMeasure();
      review.changed();
      await review.flushDraft();
    } catch (e) {
      review.toast(e.message);
    }
  }

  Object.assign(review, { showMeasure, keepMeasure });
}

export function bindMeasure(review) {
  review.viewer.formatMeasure = review.formatMeasure;

  review.viewer.onMeasure = (report) => {
    review.measureReport = report;
    review.showMeasure();
  };

  review.viewer.onMeasureRefused = (why) =>
    review.toast(t(review.MEASURE_REFUSALS[why]));

  review
    .$("#keep-measure")
    .addEventListener("click", () => review.keepMeasure());

  for (const b of document.querySelectorAll("[data-measure]"))
    b.addEventListener("click", () => {
      for (const other of document.querySelectorAll("[data-measure]")) {
        other.classList.toggle("active", other === b);
        other.setAttribute("aria-pressed", String(other === b));
      }
      review.viewer.setMeasureKind(b.dataset.measure);
      review.$("#tool-hint").textContent = t(
        review.MEASURE_HINTS[b.dataset.measure],
      );
    });
}
