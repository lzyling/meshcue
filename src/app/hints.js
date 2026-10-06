import { t } from "../i18n/index.js";

export function bindHints(review) {
  const shell = review.$(".viewer-shell"),
    options = review.$("#tool-options"),
    section = review.$("#section-options"),
    displayMenu = review.$("#display-menu"),
    dialogs = document.querySelectorAll("dialog");
  const hint = review.$("#tool-hint");
  const box = document.createElement("div");
  box.className = "tool-hint-box";
  hint.before(box);
  box.append(hint);
  shell.append(box);
  const dismiss = document.createElement("button");
  dismiss.id = "dismiss-tool-hint";
  dismiss.setAttribute("aria-label", t("shell.dismissHint"));
  dismiss.innerHTML = review.icon("close");
  box.append(dismiss);
  let current,
    showing = false,
    watching = false;
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
    if (onScreen()) {
      review.settings.set(`hint.${current}`, true);
      stopWatching();
    }
  };
  const stopWatching = () => {
    visibilityObserver.disconnect();
    if (!watching) return;
    watching = false;
    window.removeEventListener("scroll", markSeen, true);
    window.removeEventListener("resize", position);
    for (const dialog of dialogs) dialog.removeEventListener("close", markSeen);
  };
  const watchVisibility = () => {
    stopWatching();
    if (!showing || !current || review.settings.get(`hint.${current}`)) return;
    watching = true;
    // Observe only the flags that can cover the hint, never the canvas subtree:
    // navigation pivots and mark readouts write attributes every rendered frame.
    visibilityObserver.observe(shell, {
      attributes: true,
      attributeFilter: ["class"],
    });
    for (const target of [options, section, displayMenu])
      visibilityObserver.observe(target, {
        attributes: true,
        attributeFilter: ["hidden"],
      });
    // A short viewport can cut off the hint without changing any DOM flags.
    // Capture also catches scrolling inside a containing panel.
    window.addEventListener("scroll", markSeen, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", position);
    for (const dialog of dialogs) dialog.addEventListener("close", markSeen);
  };
  review.showToolHint = (mode) => {
    if (mode !== current) {
      current = mode;
      showing = !review.settings.get(`hint.${mode}`);
    }
    box.hidden = !showing;
    watchVisibility();
    position();
  };
  dismiss.onclick = () => {
    if (current) review.settings.set(`hint.${current}`, true);
    showing = false;
    box.hidden = true;
    stopWatching();
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
    const bounds = shell.getBoundingClientRect();
    let top = review.$(".toolbar").getBoundingClientRect().top;
    if (!options.hidden)
      top = Math.min(top, options.getBoundingClientRect().top);
    box.style.bottom = `${bounds.bottom - top + 8}px`;
    // Touch-sized Advanced controls can leave no gap below Section on a
    // phone. Temporarily clear the hint, as menus do, rather than drawing its
    // words through the section controls. Keep showing intact so closing the
    // section restores the first-use hint without resetting or dismissing it.
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
  // Menus change CSS visibility without resizing the hint. Panel flags also
  // need to reposition it before checking whether Section still covers it.
  const visibilityObserver = new MutationObserver(position);
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
}
