import { FEATURES } from "../integration/part-groups.mjs";
import { notifierSummary } from "./notify.mjs";
import { MAX_TRIANGLES, MAX_BYTES } from "./models.mjs";

export function reviewState({
  store,
  idle,
  updates,
  version,
  notifierCached,
  config,
  idleReport,
}) {
  function stateFor(clientId, full = false, versionId) {
    const state = store.publicState(clientId, versionId);
    delete state.messages;
    if (!full && state.draft)
      state.draft = {
        ...state.draft,
        annotations: undefined,
        camera: undefined,
        annotationCount: state.draft.annotations.length,
      };
    const closing = idle?.notice() || null;
    /* Reading it here is what schedules the next request, so an instance nobody
     has open never makes one. The answer is whatever was last known; it is
     absent until there is something to say, and stays absent when the check is
     turned off or the upstream cannot be reached. */
    const update = updates.report();
    return {
      ...state,
      // What is actually running, said on every poll. The page ships its own
      // version compiled in, but that is the build it was cut from; a reviewer
      // asking what they are looking at means the service answering them.
      version,
      features: FEATURES,
      ...(update ? { update } : {}),
      notifier: notifierSummary(notifierCached(store.state.reviewOrigin)),
      /* The project as the Agent named it when it opened this review. A host
       that cannot be pushed to hears of a batch only when the reviewer tells
       it, and the sentence the page offers them for that names the project,
       so the Agent can read the batch without asking which one. */
      project: (config.managed && config.projectPath) || null,
      limits: { maxTriangles: MAX_TRIANGLES, maxBytes: MAX_BYTES },
      // The countdown rides along on every poll, not only during the
      // announcement: a throttled background tab can sleep through the whole
      // announced window, and its last reading is then the only thing it has to
      // tell a reclaim apart from a crash.
      idle: idleReport(),
      // Present only while the service is about to reclaim itself. Reading the
      // notice never advances the decision — the timer owns that — so a poll can
      // report the warning without becoming the reason it was withdrawn.
      ...(closing ? { closing } : {}),
    };
  }
  return stateFor;
}
