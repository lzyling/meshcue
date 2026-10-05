// The reuse notice is consumed once, but the publication's choice of version
// remains current across reloads. Keep this separate from notice visibility:
// closing the explanation must not turn the delivered content into a warning.
export function reusedVersionIsCurrent(review, latest) {
  const event = review.state?.sameContentReuse;
  if (
    !event ||
    event.reviewId !== review.state.reviewId ||
    event.versionId !== review.viewingId ||
    event.versionId !== review.state.active?.id ||
    event.latestVersionId !== latest?.id
  )
    return false;
  let manual = review.manualReuseId;
  try {
    manual ||= localStorage.getItem(`meshcue-manual-reuse-${event.reviewId}`);
  } catch {
    // Denied storage still permits the current page to remember a tab choice.
  }
  return manual !== event.id;
}

export function rememberManualReuseChoice(review) {
  const event = review.state?.sameContentReuse;
  if (!event) return;
  // A deliberate tab switch ends this event's exception, including when the
  // reviewer later chooses the reused tab again. A fresh reuse has a new id.
  review.manualReuseId = event.id;
  try {
    localStorage.setItem(`meshcue-manual-reuse-${event.reviewId}`, event.id);
  } catch {
    // Browser storage is optional; it must not block manual version browsing.
  }
}
