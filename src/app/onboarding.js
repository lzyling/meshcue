const KEYS = {
  "step1.title": "onboarding.step1.title",
  "step1.body": "onboarding.step1.body",
  "step2.title": "onboarding.step2.title",
  "step2.body": "onboarding.step2.body",
  "step3.title": "onboarding.step3.title",
  "step3.body": "onboarding.step3.body",
  "step4.title": "onboarding.step4.title",
  "step4.body": "onboarding.step4.body",
  reference: "onboarding.reference",
  more: "onboarding.more",
  device: "onboarding.device",
  rotate: "onboarding.rotate",
  pan: "onboarding.pan",
  zoom: "onboarding.zoom",
  center: "onboarding.center",
  select: "onboarding.select",
  mouse: "onboarding.mouse",
  trackpad: "onboarding.trackpad",
  touch: "onboarding.touch",
  "mouse.rotate": "onboarding.mouse.rotate",
  "mouse.pan": "onboarding.mouse.pan",
  "mouse.zoom": "onboarding.mouse.zoom",
  "mouse.center": "onboarding.mouse.center",
  "mouse.select": "onboarding.mouse.select",
  "trackpad.rotate": "onboarding.trackpad.rotate",
  "trackpad.pan": "onboarding.trackpad.pan",
  "trackpad.zoom": "onboarding.trackpad.zoom",
  "trackpad.center": "onboarding.trackpad.center",
  "trackpad.select": "onboarding.trackpad.select",
  "touch.rotate": "onboarding.touch.rotate",
  "touch.pan": "onboarding.touch.pan",
  "touch.zoom": "onboarding.touch.zoom",
  "touch.center": "onboarding.touch.center",
  "touch.select": "onboarding.touch.select",
};

// All help presentation lives here; legacy help.p* copy stays unchanged so
// documentation generation and agent-name substitution keep their contracts.
export function mountOnboarding(review) {
  const text = (key) => review.T(KEYS[key]);
  const cards = [1, 2, 3, 4]
    .map((step) => {
      const key = KEYS[`step${step}.body`];
      return `<li><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#mc-help-step-${step}"/></svg><h3>${text(`step${step}.title`)}</h3><p${step === 4 ? ` data-agent-text="${key}"` : ""}>${step === 4 ? review.TA(key) : review.T(key)}</p></li>`;
    })
    .join("");
  const actions = ["rotate", "pan", "zoom", "center", "select"];
  const rows = ["mouse", "trackpad", "touch"]
    .map(
      (device) =>
        `<tr><th scope="row">${text(device)}</th>${actions.map((action) => `<td>${text(`${device}.${action}`)}</td>`).join("")}</tr>`,
    )
    .join("");
  const named = new Set([
    "help.p5",
    "help.p6",
    "help.p7",
    "help.p8",
    "help.p11",
    "help.p12",
    "help.p13",
    "help.p15",
  ]);
  const paragraphs = [
    "marks2.help",
    "help.p1",
    "help.p2",
    "help.p3",
    "help.p4",
    "help.p10",
    "help.p5",
    "help.p6",
    "help.p7",
    "help.p8",
    "help.p11",
    "help.p12",
    "help.p13",
    "help.p14",
    "help.p16",
    "help.p15",
    "help.p9",
  ]
    .map((key) => {
      return `<p${named.has(key) ? ` data-agent-text="${key}"` : ""}${key === "help.p9" ? ' class="muted"' : ""}>${named.has(key) ? review.TA(key) : review.T(key)}</p>`;
    })
    .join("");
  review.$("#onboarding-content").innerHTML =
    `<ol class="onboarding-steps">${cards}</ol><div class="onboarding-table-scroll" tabindex="0" role="region" aria-label="${text("reference")}"><table class="onboarding-reference"><caption>${text("reference")}</caption><thead><tr><th scope="col">${text("device")}</th>${actions.map((action) => `<th scope="col">${text(action)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div><details class="onboarding-more"><summary>${text("more")}</summary>${paragraphs}</details>`;

  // Called after a successful state poll, not merely a viewer ready callback:
  // access and lock state must have settled before opening a modal.
  review.maybeShowOnboarding = () => {
    if (
      navigator.webdriver ||
      new URL(location.href).searchParams.get("onboarding") === "off" ||
      !review.loadedId ||
      !review.initialDraftRestored ||
      !review.viewer.enabled ||
      review.accessBlocked ||
      review.recoveryBlocked ||
      review.state?.locked ||
      !review.$("#loading").hidden ||
      document.querySelector("dialog[open]")
    )
      return;
    try {
      if (localStorage.getItem("meshcue-onboarding-seen") !== null) return;
      // Probe writable storage before opening: denied storage must not produce
      // a recurring modal. showModal is synchronous; rollback if it fails.
      localStorage.setItem("meshcue-onboarding-seen", "1");
      try {
        review.$("#help-dialog").showModal();
      } catch {
        localStorage.removeItem("meshcue-onboarding-seen");
      }
    } catch {
      // Storage is optional; the question-mark button remains available.
    }
  };
}
