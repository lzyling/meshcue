import { t } from "../i18n/index.js";

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

// The registry's menu remains a capability grouping, not a promise that every
// command needs a second click. Fit is registered later by navigation; routing
// its stable id here avoids coupling that module to the shell's presentation.
export function toolbarPlacement(command) {
  if (command.id === "navigation-fit") return { group: "view", direct: true };
  if (["navigation-projection", "plain"].includes(command.id))
    return { group: "display", direct: false };
  if (command.id === "display") return { group: "display", direct: true };
  if (["home", "view-mode"].includes(command.id))
    return { group: "view", direct: true };
  if (
    ["mode-label", "mode-fill", "mode-measure", "section"].includes(command.id)
  )
    return { group: command.menu, direct: true };
  return command.menu ? { group: command.menu, direct: false } : null;
}

export function mountMenus(review) {
  const menus = new Map();
  const labels = {
    view: "shell.view",
    display: "display.title",
    mark: "shell.mark",
    inspect: "shell.inspect",
  };
  function close(focus = false) {
    for (const { menu, more } of menus.values()) {
      if (menu.hidden) continue;
      menu.hidden = true;
      more.setAttribute("aria-expanded", "false");
      if (focus) more.focus();
    }
    review.$(".viewer-shell").classList.remove("menu-open");
  }
  const options = (menu) =>
    [...menu.querySelectorAll('[role^="menuitem"]')].filter(
      (b) => !b.disabled && !b.hidden,
    );
  function open(name, last = false) {
    close();
    const { menu, more } = menus.get(name);
    review.refreshCommands();
    if (!options(menu).length) return;
    menu.hidden = false;
    more.setAttribute("aria-expanded", "true");
    review.$(".viewer-shell").classList.add("menu-open");
    positionMenu(menu, more.closest(".toolbar-group"));
    const items = options(menu);
    (last ? items.at(-1) : items[0])?.focus();
  }
  for (const [name, label] of Object.entries(labels)) {
    const group = document.createElement("div");
    group.className = "toolbar-group";
    group.dataset.menu = name;
    group.role = "group";
    group.setAttribute("aria-label", t(label));
    const caption = document.createElement("span");
    caption.className = "toolbar-group-label";
    caption.textContent = t(label);
    const tools = document.createElement("div");
    tools.className = "toolbar-group-tools";
    const more = document.createElement("button");
    more.className = "tool toolbar-more";
    more.id = `${name}-menu-button`;
    more.textContent = "…";
    more.title = t("shell.more", { group: t(label) });
    more.setAttribute("aria-label", more.title);
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.setAttribute(
      "aria-controls",
      `${name === "display" ? "display-options" : name + "-menu"}`,
    );
    const menu = document.createElement("div");
    menu.id = `${name === "display" ? "display-options" : name + "-menu"}`;
    menu.className = "shell-menu";
    menu.role = "menu";
    menu.setAttribute("aria-label", t(label));
    menu.hidden = true;
    document.body.append(menu);
    tools.append(more);
    group.append(caption, tools);
    review.$('[data-toolbar-slot="tools"]').append(group);
    menus.set(name, { tools, more, menu });
    more.onclick = () => (menu.hidden ? open(name) : close(true));
    group.onkeydown = (e) => {
      // Modified arrows belong to the camera's command-registry shortcuts.
      if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      if (!more.hidden && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        open(name, e.key === "ArrowUp");
      }
    };
    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (!button || button.disabled) return;
      // The shared click handler owns the command; only close after it ran.
      queueMicrotask(() => {
        close();
        review.refreshCommands();
        if (document.activeElement === button) more.focus();
      });
    });
    menu.onkeydown = (e) => {
      e.stopPropagation();
      const items = options(menu),
        index = items.indexOf(document.activeElement);
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if (e.key === "Tab") close();
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }
    };
  }
  function mount(command) {
    const placement = toolbarPlacement(command);
    if (!placement) return;
    const { menu, more, tools } = menus.get(placement.group);
    const button = document.createElement("button");
    for (const [key, value] of Object.entries(command.attributes || {}))
      button.setAttribute(key, value);
    button.className = placement.direct
      ? "tool toolbar-command"
      : "menu-command";
    button.dataset.command = command.id;
    if (!placement.direct) {
      button.role = command.checked
        ? "menuitemcheckbox"
        : command.attributes?.["data-mode"]
          ? "menuitemradio"
          : "menuitem";
      button.tabIndex = -1;
    }
    button.title = t(command.titleKey || command.labelKey);
    button.setAttribute("aria-label", t(command.labelKey));
    button.innerHTML =
      (command.icon ? review.icon(command.icon) : "") +
      // Direct tools are flat icons, not captions squeezed into icon-sized
      // buttons. Keep their localized text explicitly screen-reader-only;
      // overflow menus still draw the same words as visible choices.
      `<span${placement.direct ? ' class="sr-only"' : ""}>${review.esc(t(command.captionKey || command.labelKey))}</span>`;
    if (placement.direct) {
      // Toolbar groups keep focus/pointer entry inside an open menu session.
      // A direct action ends that session before the shared command handler
      // runs, without returning focus to the old overflow button.
      button.addEventListener("click", () => {
        if (!button.disabled) close();
      });
      tools.insertBefore(button, more);
    } else menu.append(button);
  }
  review.commands.list().forEach(mount);
  review.commands.onRegister(mount);
  review.refreshMenus = () => {
    for (const { menu, more, tools } of menus.values()) {
      let previousSection;
      for (const button of [
        ...menu.children,
        ...tools.querySelectorAll("[data-command]"),
      ]) {
        const command = review.commands.get(button.dataset.command);
        button.hidden = command.visible ? !command.visible() : false;
        const checked = command.checked
          ? command.checked()
          : command.attributes?.["data-mode"] === review.mode;
        if (
          button.closest(".shell-menu") &&
          (command.checked || command.attributes?.["data-mode"])
        )
          button.setAttribute("aria-checked", String(checked));
        if (!button.closest(".shell-menu")) {
          button.classList.toggle("active", !!checked);
          if (command.checked || command.attributes?.["data-mode"])
            button.setAttribute("aria-pressed", String(!!checked));
        }
        if (button.parentElement === menu) {
          button.classList.toggle(
            "menu-separator",
            !button.hidden &&
              previousSection !== undefined &&
              previousSection !== command.menuSection,
          );
          if (!button.hidden) previousSection = command.menuSection;
        }
      }
      more.hidden = ![...menu.children].some((button) => !button.hidden);
    }
    const toggle = review.$("#view-mode-toggle");
    if (toggle) {
      const pan = review.mode === "pan";
      toggle.innerHTML = review.icon(pan ? "pan" : "orbit");
      toggle.title = t(pan ? "shell.panMode" : "shell.rotateMode");
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-pressed", String(pan));
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
