import { positionMenu } from "./menus.js";
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
    if (focus) review.$('[data-menu="view"] .split-main').focus();
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
    option.textContent = t(DISPLAY_LABELS[style]);
    option.addEventListener("click", () => {
      review.viewer.setDisplayStyle(style);
      try {
        localStorage.setItem(KEY, style);
      } catch {
        /* Use it for this visit. */
      }
      for (const child of menu.children)
        child.setAttribute("aria-checked", String(child === option));
      close(true);
    });
    menu.append(option);
  }
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
      positionMenu(menu, review.$(".toolbar"));
      button.setAttribute("aria-expanded", "true");
      menu.querySelector('[aria-checked="true"]').focus();
    },
  });
  button = review.$("#display-toggle");
  document.body.append(menu);
  menu.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Tab") close();
    const options = [...menu.children];
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
