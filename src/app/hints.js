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
  /* A first-use hint counts as seen only once it has actually been on screen,
   or when the reviewer closes it. Recording it the moment it was asked for
   lost it for good whenever it was asked for out of sight -- under the
   section controls on a phone, behind an open menu or the settings dialog,
   or pushed out of a short viewport -- and a reload then never showed it. */
  const onScreen = () => {
    if (box.hidden || box.style.visibility === "hidden") return false;
    if (document.querySelector("dialog[open]")) return false;
    const r = box.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.top >= 0 &&
      r.left >= 0 &&
      r.bottom <= innerHeight &&
      r.right <= innerWidth &&
      getComputedStyle(box).visibility !== "hidden"
    );
  };
  const markSeen = () => {
    if (!showing || !current || review.settings.get(`hint.${current}`)) return;
    if (onScreen()) review.settings.set(`hint.${current}`, true);
  };
  review.showToolHint = (mode) => {
    if (mode !== current) {
      current = mode;
      showing = !review.settings.get(`hint.${mode}`);
    }
    box.hidden = !showing;
    markSeen();
    // A menu that chose this tool closes after the choice; look again then.
    requestAnimationFrame(markSeen);
  };
  dismiss.onclick = () => {
    if (current) review.settings.set(`hint.${current}`, true);
    showing = false;
    box.hidden = true;
  };
  for (const dialog of document.querySelectorAll("dialog"))
    dialog.addEventListener("close", markSeen);
  // Menus hide the hint with `visibility`, which no ResizeObserver sees come
  // back. Watching the classes and `hidden` flags that do it costs one early
  // return per change once the current hint has been seen.
  new MutationObserver(markSeen).observe(review.$(".viewer-shell"), {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"],
  });
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
    markSeen();
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
