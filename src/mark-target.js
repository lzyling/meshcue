// Only object marks are replaceable: pins, paint and measurements stay distinct.
export function sameMarkTarget(a, b, tolerance = 1e-6) {
  if (a.type !== b.type) return false;
  if (a.type === "part") {
    if (a.group?.id || b.group?.id)
      return !!a.group?.id && a.group.id === b.group?.id;
    const left = new Set(a.partIds),
      right = new Set(b.partIds);
    return (
      left.size > 0 &&
      left.size === right.size &&
      [...left].every((id) => right.has(id))
    );
  }
  if (a.type !== "edge" || a.meshId !== b.meshId) return false;
  const left = a.points,
    right = b.points;
  if (!left?.length || left.length !== right?.length) return false;
  const near = (p, q) => Math.hypot(...p.map((v, i) => v - q[i])) <= tolerance;
  const sequence =
    left.every((p, i) => near(p, right[i])) ||
    left.every((p, i) => near(p, right[right.length - 1 - i]));
  // Endpoints identify open source edges regardless of traversal direction.
  // Closed edges need their full sequence: equal ends alone mean nothing.
  const open = !near(left[0], left.at(-1)) && !near(right[0], right.at(-1));
  return (
    sequence ||
    (open &&
      ((near(left[0], right[0]) && near(left.at(-1), right.at(-1))) ||
        (near(left[0], right.at(-1)) && near(left.at(-1), right[0]))))
  );
}

// Submissions expose a revision, not individual mark IDs. Remember the local
// snapshot alongside the draft cache; on an unknown submitted revision protect
// existing marks conservatively, never rewrite a possibly submitted mark.
export function rememberSubmittedMarks(review, draft, cached) {
  const revision = draft?.submittedRevision ?? null;
  if (
    cached &&
    cached.submittedMarkRevision === revision &&
    Array.isArray(cached.submittedMarkIds)
  ) {
    review.submittedMarkRevision = revision;
    review.submittedMarkIds = new Set(cached.submittedMarkIds);
  } else if (
    review.submittedMarkRevision !== revision ||
    !review.submittedMarkIds
  ) {
    review.submittedMarkRevision = revision;
    review.submittedMarkIds = new Set(
      revision == null ? [] : review.annotations.map((a) => a.id),
    );
  }
}
