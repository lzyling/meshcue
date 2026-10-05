import { t } from "../i18n/index.js";

export function bindSidebar(review) {
  const panel = review.$(".annotations-panel"),
    heading = panel.querySelector(".annotations-heading");
  const parts = review.$("#parts-panel"),
    actions = review.$(".panel-actions");
  panel.insertBefore(parts, actions);
  const count = review.$("#annotation-count");
  heading.querySelector("strong").remove();
  const tabs = document.createElement("div");
  tabs.className = "sidebar-tabs";
  tabs.role = "tablist";
  tabs.setAttribute("aria-label", t("a11y.reviewPanel"));
  const marksTab = document.createElement("button"),
    partsTab = document.createElement("button");
  for (const [button, id, label, icon] of [
    [marksTab, "marks", "tool.marks", "pin"],
    [partsTab, "parts", "parts.title", "orbit"],
  ]) {
    button.id = `sidebar-${id}`;
    button.role = "tab";
    button.title = t(label);
    button.setAttribute("aria-label", t(label));
    button.setAttribute(
      "aria-controls",
      id === "parts" ? "parts-panel" : "annotations-list",
    );
    button.innerHTML =
      review.icon(icon) +
      `<span class="sidebar-caption">${review.esc(t(label))}</span>`;
    button.onclick = () => {
      review.settings.set("sidebarCollapsed", false);
      select(id);
    };
    tabs.append(button);
  }
  marksTab.append(count);
  marksTab.setAttribute("aria-describedby", count.id);
  heading.prepend(tabs);
  parts.setAttribute("role", "tabpanel");
  parts.setAttribute("aria-labelledby", partsTab.id);
  review.$("#annotations-list").setAttribute("role", "tabpanel");
  review.$("#annotations-list").setAttribute("aria-labelledby", marksTab.id);
  let selected = "marks";
  const listeners = new Set();
  function update() {
    const collapsed = review.settings.get("sidebarCollapsed");
    if (!review.settings.get("parts")) selected = "marks";
    partsTab.hidden = !review.settings.get("parts");
    panel.classList.toggle("collapsed", collapsed);
    review.$("#annotations-list").hidden = collapsed || selected !== "marks";
    parts.hidden = collapsed || selected !== "parts";
    for (const [button, id] of [
      [marksTab, "marks"],
      [partsTab, "parts"],
    ]) {
      button.setAttribute("aria-selected", String(selected === id));
      button.tabIndex = selected === id ? 0 : -1;
    }
    const toggle = review.$("#toggle-annotations");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      t(collapsed ? "marks.expand" : "marks.collapse"),
    );
    toggle.innerHTML = review.icon(
      collapsed ? "expand-right" : "collapse-left",
    );
    // The very same submit button stays mounted in both layouts. Its owner can
    // keep every capability, disconnect and in-flight guard in one place.
    actions.hidden = false;
    review.$("#receipt-nudge").inert = collapsed;
    // Sidebar mounts before annotation editing binds its textarea helper.
    if (review.noteBox) review.renderNote();
    if (!collapsed && selected === "marks") review.revealSelectedMark();
    for (const fn of listeners) fn(!parts.hidden);
    review.refreshCommands();
  }
  function select(id) {
    selected = id;
    update();
  }
  review.sidebar = {
    select,
    selected: () => selected,
    on: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  review.$("#toggle-annotations").onclick = () =>
    review.settings.set(
      "sidebarCollapsed",
      !review.settings.get("sidebarCollapsed"),
    );
  tabs.onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const target =
      e.key === "Home"
        ? marksTab
        : e.key === "End"
          ? partsTab.hidden
            ? marksTab
            : partsTab
          : selected === "marks" && !partsTab.hidden
            ? partsTab
            : marksTab;
    target.click();
    target.focus();
  };
  review.settings.on("parts", update);
  review.settings.on("sidebarCollapsed", update);
  update();
}
