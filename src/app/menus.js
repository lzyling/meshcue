import { t } from "../i18n/index.js";

// Short captions are independent of the complete accessible action labels.
export function toolbarCaption(id) {
  const names = {
    "view-mode": "toolbar.caption.rotate",
    "navigation-fit": "toolbar.caption.fit",
    "navigation-projection": "toolbar.caption.projection",
    "mode-label": "toolbar.caption.pin",
    "mode-fill": "toolbar.caption.fill",
    "mode-measure": "toolbar.caption.measure",
    section: "toolbar.caption.section",
    display: "toolbar.caption.style",
    explode: "explode.title",
    marks: "toolbar.caption.marks",
    undo: "toolbar.caption.undo",
    redo: "toolbar.caption.redo",
    "reset-preview": "toolbar.caption.reset",
  };
  return names[id] ? t(names[id]) : null;
}

// A reserved icon slot and check slot keep every submenu aligned.
export function menuItemContent(review, label, icon) {
  return `<span class="menu-option-icon" aria-hidden="true">${icon ? review.icon(icon) : ""}</span><span class="menu-option-label">${review.esc(label)}</span><span class="menu-option-check" aria-hidden="true">✓</span>`;
}

// Menus live outside the clipped canvas and transformed toolbar. Clamp against
// the visual viewport as well as the layout viewport (phone zoom/keyboards).
export function positionMenu(menu, anchor) {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0,
    top = viewport?.offsetTop || 0;
  const width = viewport?.width || innerWidth,
    height = viewport?.height || innerHeight;
  const box = anchor.getBoundingClientRect();
  menu.style.maxHeight = `${Math.max(44, Math.min(box.top - top - 16, height - 16))}px`;
  menu.style.maxWidth = `${width - 16}px`;
  const size = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(left + 8, Math.min(box.left, left + width - size.width - 8))}px`;
  menu.style.top = `${Math.max(top + 8, Math.min(box.top - size.height - 8, top + height - size.height - 8))}px`;
}

// Presentation groups are separate from capability groups in the registry.
export function toolbarPlacement(command) {
  if (["mode-label", "mode-edge", "mode-part"].includes(command.id))
    return { group: "mark", submenu: "mark-mode" };
  if (command.id === "mark-mode") return { group: "mark", direct: true };
  if (["mode-orbit", "mode-pan"].includes(command.id))
    return { group: "view", submenu: "view-mode" };
  if (command.id.startsWith("navigation-projection-"))
    return { group: "view", submenu: "projection" };
  if (
    ["view-mode", "navigation-fit", "navigation-projection"].includes(
      command.id,
    )
  )
    return { group: "view", direct: true };
  if (["display", "marks", "explode"].includes(command.id))
    return { group: "display", direct: true };
  if (
    ["mode-label", "mode-fill", "mode-measure", "section"].includes(command.id)
  )
    return { group: command.menu, direct: true };
  return null;
}

export function mountMenus(review) {
  const groups = new Map(),
    menus = new Map();
  for (const [name, key] of [
    ["view", "shell.view"],
    ["mark", "shell.mark"],
    ["inspect", "shell.inspect"],
    ["display", "display.title"],
  ]) {
    const group = document.createElement("div");
    group.className = "toolbar-group";
    group.dataset.menu = name;
    group.role = "group";
    group.setAttribute("aria-label", t(key));
    const tools = document.createElement("div");
    tools.className = "toolbar-group-tools";
    group.append(tools);
    review.$('[data-toolbar-slot="tools"]').append(group);
    groups.set(name, tools);
  }
  for (const [name, commandId, key] of [
    ["view-mode", "view-mode", "shell.view"],
    ["mark-mode", "mark-mode", "shell.mark"],
    ["projection", "navigation-projection", "navigation.projection"],
  ]) {
    const menu = document.createElement("div");
    menu.id = `${name}-menu`;
    menu.className = "shell-menu";
    menu.role = "menu";
    menu.setAttribute("aria-label", t(key));
    menu.hidden = true;
    document.body.append(menu);
    menus.set(name, { menu, commandId });
  }
  const anchor = (entry) =>
    document.querySelector(`[data-command="${entry.commandId}"]`);
  const options = (menu) =>
    [...menu.children].filter((b) => !b.disabled && !b.hidden);
  function close(focus = false) {
    for (const entry of menus.values()) {
      if (entry.menu.hidden) continue;
      entry.menu.hidden = true;
      anchor(entry)?.setAttribute("aria-expanded", "false");
      if (focus) anchor(entry)?.focus();
    }
    review.$(".viewer-shell").classList.remove("menu-open");
  }
  function open(name, last = false) {
    const entry = menus.get(name);
    if (!entry || !entry.menu.hidden) return close(true);
    close();
    review.refreshCommands();
    const items = options(entry.menu);
    if (!items.length) return;
    entry.menu.hidden = false;
    anchor(entry).setAttribute("aria-expanded", "true");
    review.$(".viewer-shell").classList.add("menu-open");
    positionMenu(entry.menu, anchor(entry));
    (last
      ? items.at(-1)
      : items.find((b) => b.getAttribute("aria-checked") === "true") || items[0]
    ).focus();
  }
  for (const [name, entry] of menus) {
    entry.menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (!button || button.disabled) return;
      queueMicrotask(() => {
        close(true);
        review.refreshCommands();
      });
    });
    entry.menu.onkeydown = (event) => {
      event.stopPropagation();
      const items = options(entry.menu),
        index = items.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      } else if (event.key === "Tab") close();
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }
    };
  }
  function mount(command) {
    const placement = toolbarPlacement(command);
    if (!placement) return;
    const button = document.createElement("button");
    for (const [key, value] of Object.entries(command.attributes || {}))
      button.setAttribute(key, value);
    button.className = placement.direct
      ? "tool toolbar-command"
      : "menu-command";
    button.dataset.command = command.id;
    button.title = t(command.titleKey || command.labelKey);
    button.setAttribute("aria-label", t(command.labelKey));
    button.innerHTML = placement.direct
      ? (command.icon ? review.icon(command.icon) : "") +
        `<span>${review.esc(toolbarCaption(command.id))}</span>`
      : menuItemContent(
          review,
          t(command.captionKey || command.labelKey),
          command.id === "navigation-projection-orthographic"
            ? "projection-ortho"
            : command.id === "navigation-projection-perspective"
              ? "projection"
              : command.icon,
        );
    if (placement.submenu) {
      button.classList.add("menu-option");
      button.role = "menuitemradio";
      button.tabIndex = -1;
      menus.get(placement.submenu).menu.append(button);
    } else {
      const entry = [...menus.entries()].find(
        ([, e]) => e.commandId === command.id,
      );
      if (entry) {
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", entry[1].menu.id);
        button.onkeydown = (e) => {
          if (
            !e.ctrlKey &&
            !e.shiftKey &&
            !e.metaKey &&
            !e.altKey &&
            ["ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            e.stopPropagation();
            open(entry[0], e.key === "ArrowUp");
          }
        };
      }
      button.addEventListener("click", () => {
        if (!button.disabled && !entry) close();
      });
      const tools = groups.get(placement.group);
      const order = ["display", "marks"];
      const before =
        placement.group === "display"
          ? [...tools.children].find(
              (b) =>
                order.indexOf(b.dataset.command) > order.indexOf(command.id),
            )
          : null;
      tools.insertBefore(button, before || null);
    }
  }
  review.commands.list().forEach(mount);
  review.commands.onRegister(mount);
  review.refreshMenus = () => {
    for (const button of document.querySelectorAll(
      ".shell-menu [data-command], .toolbar-group [data-command]",
    )) {
      const command = review.commands.get(button.dataset.command);
      button.hidden = command.visible ? !command.visible() : false;
      const checked = command.checked
        ? command.checked()
        : command.attributes?.["data-mode"] === review.mode;
      if (button.closest(".shell-menu"))
        button.setAttribute("aria-checked", String(!!checked));
      else if (command.checked || command.attributes?.["data-mode"]) {
        button.classList.toggle("active", !!checked);
        button.setAttribute("aria-pressed", String(!!checked));
      }
    }
    const mark = review.$("#mark-mode-toggle");
    if (mark) {
      const mode = review.markMode || "label";
      const caption = t(
        mode === "label" ? "toolbar.caption.pin" : `marks2.${mode}`,
      );
      mark.innerHTML =
        review.icon(mode === "label" ? "pin" : `mark-${mode}`) +
        `<span>${review.esc(caption)}</span>`;
      mark.setAttribute("aria-label", caption);
      mark.classList.toggle(
        "active",
        ["label", "edge", "part"].includes(review.mode),
      );
    }
    const toggle = review.$("#view-mode-toggle");
    if (toggle) {
      const pan = review.mode === "pan";
      toggle.innerHTML =
        review.icon(pan ? "pan" : "orbit") +
        `<span>${review.esc(t(pan ? "toolbar.caption.pan" : "toolbar.caption.rotate"))}</span>`;
      toggle.title = t(pan ? "shell.panMode" : "shell.rotateMode");
      toggle.setAttribute("aria-label", toggle.title);
    }
  };
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".shell-menu, .toolbar-group")) close();
  });
  document.addEventListener("focusin", (e) => {
    if (!e.target.closest(".shell-menu, .toolbar-group")) close();
  });
  window.addEventListener("resize", () => close());
  window.visualViewport?.addEventListener("resize", () => close());
  window.visualViewport?.addEventListener("scroll", () => close());
  review.openMenu = open;
}
