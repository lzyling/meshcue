import { t } from "../i18n/index.js";

export function bindHints(review) {
  const hint = review.$("#tool-hint");
  const box = document.createElement("div");
  box.className = "tool-hint-box";
  hint.before(box);
  box.append(hint);
  review.$(".viewer-shell").append(box);
  const dismiss = document.createElement("button");
  dismiss.id = "dismiss-tool-hint";
  dismiss.setAttribute("aria-label", t("shell.dismissHint"));
  dismiss.innerHTML = review.icon("close");
  box.append(dismiss);
  let current,
    showing = false;
  review.showToolHint = (mode) => {
    if (mode !== current) {
      current = mode;
      showing = !review.settings.get(`hint.${mode}`);
      if (showing) review.settings.set(`hint.${mode}`, true);
    }
    box.hidden = !showing;
  };
  dismiss.onclick = () => {
    showing = false;
    box.hidden = true;
  };
  review.resetToolHints = () => {
    for (const mode of ["orbit", "pan", "label", "fill", "measure", "relocate"])
      review.settings.set(`hint.${mode}`, false);
    current = null;
    review.showToolHint(review.mode);
  };
  // Measure and Fill own their option contents. Observe the strip's size so a
  // translated hint clears either lane's controls without knowing their shape.
  const position = () => {
    const shell = review.$(".viewer-shell").getBoundingClientRect();
    let top = review.$(".toolbar").getBoundingClientRect().top;
    const options = review.$("#tool-options");
    if (!options.hidden)
      top = Math.min(top, options.getBoundingClientRect().top);
    box.style.bottom = `${shell.bottom - top + 8}px`;
    // Touch-sized Advanced controls can leave no gap below Section on a
    // phone. Temporarily clear the hint, as menus do, rather than drawing its
    // words through the section controls. Keep showing intact so closing the
    // section restores the first-use hint without resetting or dismissing it.
    const section = review.$("#section-options");
    const cut = section.getBoundingClientRect(),
      hint = box.getBoundingClientRect();
    box.style.visibility =
      !section.hidden &&
      hint.left < cut.right &&
      hint.right > cut.left &&
      hint.top < cut.bottom &&
      hint.bottom > cut.top
        ? "hidden"
        : "";
  };
  const observer = new ResizeObserver(position);
  for (const selector of [
    ".viewer-shell",
    ".toolbar",
    "#tool-options",
    "#section-options",
    ".tool-hint-box",
  ])
    observer.observe(review.$(selector));
  review.showToolHint(review.mode);
  position();
}
