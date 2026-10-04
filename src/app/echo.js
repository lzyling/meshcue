import { t, ta } from "../i18n/index.js";
export function installEcho(review) {
  function echoLinger() {
    clearTimeout(review.echoTimer);
    review.echoTimer = setTimeout(review.hideEcho, review.ECHO_LINGER);
  }

  function showEcho({ linger }) {
    review.$("#echo-panel").hidden = false;
    review.$("#echo-recall").setAttribute("aria-expanded", "true");
    review.$("#echo-recall").setAttribute("aria-label", t("echo.dismiss"));
    clearTimeout(review.echoTimer);
    // A stale echo is a warning that the marks moved under it. Warnings do not
    // get to leave before they are read.
    if (linger && review.$("#echo-stale").hidden) review.echoLinger();
  }

  function hideEcho() {
    clearTimeout(review.echoTimer);
    review.echoTimer = null;
    review.$("#echo-panel").hidden = true;
    review.$("#echo-recall").setAttribute("aria-expanded", "false");
    review.$("#echo-recall").setAttribute("aria-label", ta("echo.recall"));
  }

  function updateEcho(incoming) {
    const echo = incoming.echo;
    review.$("#echo-stale").hidden =
      !echo ||
      (echo.revision === review.revision && review.editSeq === review.savedSeq);
    if ((echo?.id || null) === review.echoId || !review.viewer.enabled) return;
    review.echoId = echo?.id || null;
    review.viewer.setAgentEcho(
      echo?.versionId === review.loadedId ? echo : null,
    );
    review.$("#echo-summary").textContent = review.viewer.agentEcho
      ? ta("echo.summary", { summary: echo.summary })
      : "";
    review.$("#echo-recall").hidden = !review.viewer.agentEcho;
    if (review.viewer.agentEcho) review.showEcho({ linger: true });
    else review.hideEcho();
  }

  Object.assign(review, { echoLinger, showEcho, hideEcho, updateEcho });
}

export function bindEcho(review) {
  /* The Agent's understanding used to sit across the model until it was dismissed
   by hand, every round. It says itself once, gets out of the way on its own, and
   leaves a bubble to be asked again — reading it is occasional, the model is
   what the screen is for.

   Only the first showing leaves by itself. Recalling it is a deliberate act, so
   it then stays until it is put away, and a pointer resting on it is someone
   still reading. */
  review.ECHO_LINGER = 7000;

  review.echoTimer = null;

  review.$("#echo-recall").addEventListener("click", () => {
    if (review.$("#echo-panel").hidden) review.showEcho({ linger: false });
    else review.hideEcho();
  });

  review
    .$("#echo-panel")
    .addEventListener("pointerenter", () => clearTimeout(review.echoTimer));

  review.$("#echo-panel").addEventListener("pointerleave", () => {
    if (review.echoTimer !== null) review.echoLinger();
  });
}
