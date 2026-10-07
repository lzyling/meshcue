import { positionMenu, toolbarCaption, menuItemContent } from "./menus.js";
import { t } from "../i18n/index.js";
import { DISPLAY_STYLES } from "../viewer/display-modes.js";
import { bindPerformance } from "./perf.js";
import { DISPLAY_LABELS } from "./display-labels.js";
const KEY = "meshcue-display-style";
export function bindDisplay(review) {
  let stored;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    /* Storage is optional. */
  }
  review.viewer.setDisplayStyle(
    DISPLAY_STYLES.includes(stored) ? stored : "edges",
  );
  const menu = document.createElement("div");
  menu.id = "display-menu";
  menu.className = "display-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t("display.title"));
  let button;
  const close = (focus = false) => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focus) button.focus();
  };
  for (const style of DISPLAY_STYLES) {
    const option = document.createElement("button");
    option.type = "button";
    option.dataset.style = style;
    option.setAttribute("role", "menuitemradio");
    option.setAttribute(
      "aria-checked",
      String(review.viewer.displayStyle === style),
    );
    option.className = "menu-option";
    option.innerHTML = menuItemContent(
      review,
      t(DISPLAY_LABELS[style]),
      `display-${style}`,
    );
    option.addEventListener("click", () => {
      review.setDisplayStyle(style);
      close(true);
    });
    menu.append(option);
  }
  const separator = document.createElement("div");
  separator.className = "menu-separator";
  separator.setAttribute("role", "separator");
  const plain = document.createElement("button");
  plain.type = "button";
  plain.className = "menu-option";
  plain.setAttribute("role", "menuitemcheckbox");
  plain.innerHTML = menuItemContent(review, t("display.plain"), "plain");
  plain.addEventListener("click", () => {
    review.commands.run("plain");
    refreshStyle();
    close(true);
  });
  menu.append(separator, plain);
  review.commands.register({
    id: "display",
    labelKey: "display.title",
    captionKey: "display.title",
    icon: "plain",
    menu: "view",
    menuOrder: 40,
    menuSection: "display",
    attributes: {
      id: "display-toggle",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": menu.id,
    },
    run() {
      if (!menu.hidden) return close(true);
      menu.hidden = false;
      positionMenu(menu, button.closest(".toolbar-group"));
      button.setAttribute("aria-expanded", "true");
      menu.querySelector('[aria-checked="true"]').focus();
    },
  });
  button = review.$("#display-toggle");
  review.setDisplayStyle = (style) => {
    review.viewer.setDisplayStyle(style);
    try {
      localStorage.setItem(KEY, style);
    } catch {
      /* Use it for this visit. */
    }
    refreshStyle();
  };
  function refreshStyle() {
    const style = review.viewer.displayStyle;
    button.innerHTML =
      review.icon(`display-${style}`) +
      `<span>${review.esc(toolbarCaption("display"))}</span>`;
    button.title = t("display.choose", { style: t(DISPLAY_LABELS[style]) });
    const neutral = !!review.viewer.neutral;
    button.classList.toggle("neutral-active", neutral);
    if (neutral) button.title += ` · ${t("display.plain")}`;
    button.setAttribute("aria-label", button.title);
    plain.setAttribute("aria-checked", String(neutral));
    plain.title = t(neutral ? "view.original" : "view.plain");
    for (const child of menu.querySelectorAll("[data-style]"))
      child.setAttribute("aria-checked", String(child.dataset.style === style));
  }
  review.refreshDisplay = refreshStyle;
  refreshStyle();
  document.body.append(menu);
  menu.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Tab") close();
    const options = [...menu.querySelectorAll("button")];
    const current = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (current +
                (event.key === "ArrowDown" ? 1 : -1) +
                options.length) %
              options.length;
      options[index].focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target) && !button.contains(event.target)) close();
  });
  menu.addEventListener("focusout", (event) => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== button)
      close();
  });
  bindPerformance(review);
}
