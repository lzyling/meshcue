/* Which version is the newest is a question the interface answers constantly:
   in the status line, in the notice above the footer, and in where that
   notice's button sends the reviewer. All three used to ask it of `active` —
   the pointer the Agent last set — and `active` is not the newest version.
   Publishing without activating leaves the pointer behind, and then the page
   tells a reviewer standing on the newest model that he is on an earlier one
   and offers to send him further back. It stayed wrong through twelve
   published versions in one real session without anything failing, because
   nothing ever compared the two. The comparison lives here so it can be. */

export function latestVersion(versions) {
  const list = versions || [];
  if (!list.length) return null;
  // Equal timestamps fall to the later entry: the store appends on publish, so
  // position breaks a tie the clock could not.
  return list.reduce((newest, v) =>
    (v.publishedAt || 0) >= (newest.publishedAt || 0) ? v : newest,
  );
}

export function viewingBehindLatest(versions, viewingId) {
  const latest = latestVersion(versions);
  return !!latest && !!viewingId && viewingId !== latest.id;
}
