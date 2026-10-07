import { t, ta } from "../i18n/index.js";

// Release content is data, never markup. Strip common Markdown constructs and
// HTML tags without parsing or inserting any upstream HTML into the document.
export function releaseSummary(notes, limit = 600) {
  const text = String(notes ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/~~~[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/^\s*\[[^\]]+\]:.*$/gm, "")
    .replace(/<[^>]*>/g, "")
    .replace(/^ {0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\\([\\#{}\[\]()!+.-])/g, "$1")
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function createUpdatePopover(review) {
  const badge = review.$("#app-update");
  const panel = document.createElement("section");
  panel.id = "update-popover";
  panel.className = "update-popover";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "update-title");
  badge.setAttribute("aria-controls", panel.id);
  const element = (tag, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    panel.append(node);
    return node;
  };
  const close = element("button", "update-close quiet");
  close.type = "button";
  close.textContent = t("common.close");
  const title = element("h2");
  title.id = "update-title";
  const current = element("p", "update-current");
  const notes = element("p", "update-notes");
  const link = element("a");
  link.textContent = t("update.fullNotes");
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  const sentence = element("p", "update-sentence");
  const copy = element("button", "update-copy");
  copy.type = "button";
  copy.setAttribute("aria-live", "polite");
  const explanation = element("p", "update-explanation");
  document.body.append(panel);
  let update = null;
  let copyTimer;
  const seenKey = "meshcue-update-seen";
  function seen() {
    try {
      return localStorage.getItem(seenKey) === update?.version;
    } catch {
      return false;
    }
  }
  function position() {
    if (panel.hidden) return;
    const rect = badge.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.maxHeight = `${Math.max(0, innerHeight - rect.bottom - 16)}px`;
  }
  function hide(restoreFocus = false) {
    panel.hidden = true;
    badge.setAttribute("aria-expanded", "false");
    if (restoreFocus && !badge.hidden) badge.focus();
  }
  function render() {
    const vars = {
      version: update.version,
      current: review.state?.version || review.$("#app-version").textContent,
    };
    title.textContent = t("update.title", vars);
    current.textContent = t("update.current", vars);
    notes.textContent = releaseSummary(update.notes);
    notes.hidden = !notes.textContent;
    // Only web links are navigable, even when a custom upstream supplies data.
    let url;
    try {
      const parsed = new URL(update.url);
      if (["https:", "http:"].includes(parsed.protocol)) url = parsed.href;
    } catch {
      // A release without a usable link still has a summary and copy action.
    }
    link.hidden = !url;
    if (url) link.href = url;
    else link.removeAttribute("href");
    sentence.textContent = ta("update.sentence", vars);
    explanation.textContent = ta("update.explanation");
    if (!copyTimer) copy.textContent = ta("update.copy");
  }
  badge.addEventListener("click", () => {
    if (!panel.hidden) return hide(true);
    if (!update) return;
    render();
    panel.hidden = false;
    badge.setAttribute("aria-expanded", "true");
    try {
      localStorage.setItem(seenKey, update.version);
    } catch {
      // Storage is optional: acknowledgement still lasts for this visit.
    }
    badge.classList.remove("update-unseen");
    position();
    close.focus();
  });
  close.addEventListener("click", () => hide(true));
  document.addEventListener("click", (event) => {
    if (
      !panel.hidden &&
      !panel.contains(event.target) &&
      !badge.contains(event.target)
    )
      hide(panel.contains(document.activeElement));
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (panel.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hide(true);
      } else if (panel.contains(event.target)) {
        // Editing/copying this update must not activate model-viewer shortcuts.
        event.stopPropagation();
      }
    },
    true,
  );
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
  copy.addEventListener("click", async () => {
    const text = sentence.textContent;
    if (await review.copyText(text)) {
      copy.textContent = t("update.copied");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyTimer = null;
        copy.textContent = ta("update.copy");
      }, 2500);
    } else {
      getSelection().selectAllChildren(sentence);
      review.toast(t("receipt.copyFailed"));
    }
  });
  let acknowledged = null;
  return (next) => {
    if (next?.version !== update?.version) {
      hide(panel.contains(document.activeElement));
      clearTimeout(copyTimer);
      copyTimer = null;
    }
    if (update && !badge.classList.contains("update-unseen"))
      acknowledged = update.version;
    update = next;
    badge.hidden = !update?.version;
    if (badge.hidden) return;
    badge.textContent = update.version;
    const hint = ta("app.updateHint", { version: update.version });
    badge.title = hint;
    badge.setAttribute("aria-label", hint);
    badge.classList.toggle(
      "update-unseen",
      !seen() && acknowledged !== update.version,
    );
    if (!panel.hidden) {
      render();
      position();
    }
  };
}
