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

export function mountMenus(review) {
  const menus = new Map();
  const labels = {
    view: "shell.view",
    mark: "shell.mark",
    inspect: "shell.inspect",
  };
  const defaults = {
    view: "mode-orbit",
    mark: "mode-label",
    inspect: "mode-measure",
  };
  const read = (id) => {
    try {
      return localStorage.getItem(`meshcue.menu.${id}`);
    } catch {
      return null;
    }
  };
  function close(focus = false) {
    for (const { menu, arrow } of menus.values()) {
      if (menu.hidden) continue;
      menu.hidden = true;
      arrow.setAttribute("aria-expanded", "false");
      if (focus) arrow.focus();
    }
    review.$(".viewer-shell").classList.remove("menu-open");
  }
  const options = (menu) =>
    [...menu.querySelectorAll('[role^="menuitem"]')].filter(
      (b) => !b.disabled && !b.hidden,
    );
  function open(name, last = false) {
    close();
    const { menu, arrow } = menus.get(name);
    review.refreshCommands();
    menu.hidden = false;
    arrow.setAttribute("aria-expanded", "true");
    review.$(".viewer-shell").classList.add("menu-open");
    positionMenu(menu, arrow.closest(".split-tool"));
    const items = options(menu);
    (last ? items.at(-1) : items[0])?.focus();
  }
  for (const name of Object.keys(defaults)) {
    const split = document.createElement("div");
    split.className = "split-tool";
    split.dataset.menu = name;
    const main = document.createElement("button");
    main.className = "tool split-main";
    const arrow = document.createElement("button");
    arrow.className = "split-arrow";
    arrow.id = `${name}-menu-button`;
    arrow.textContent = "▾";
    arrow.setAttribute("aria-label", t(labels[name]));
    arrow.setAttribute("aria-haspopup", "menu");
    arrow.setAttribute("aria-expanded", "false");
    arrow.setAttribute("aria-controls", `${name}-menu`);
    const menu = document.createElement("div");
    menu.id = `${name}-menu`;
    menu.className = "shell-menu";
    menu.role = "menu";
    menu.setAttribute("aria-label", t(labels[name]));
    menu.hidden = true;
    document.body.append(menu);
    split.append(main, arrow);
    review.$('[data-toolbar-slot="tools"]').append(split);
    const state = { main, arrow, menu, selected: read(name) || defaults[name] };
    menus.set(name, state);
    main.onclick = () => {
      close();
      review.commands.run(state.selected);
      review.refreshCommands();
    };
    arrow.onclick = () => (menu.hidden ? open(name) : close(true));
    split.onkeydown = (e) => {
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        open(name, e.key === "ArrowUp");
      }
    };
    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (!button || button.disabled) return;
      state.selected = button.dataset.command;
      try {
        localStorage.setItem(`meshcue.menu.${name}`, state.selected);
      } catch {
        /* Keep the selection for this visit. */
      }
      // Let the shared click handler run the command before closing its menu;
      // display's submenu can then receive focus without it being stolen back.
      queueMicrotask(() => {
        close();
        review.refreshCommands();
        if (document.activeElement === button) main.focus();
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
    if (!command.menu) return;
    const { menu } = menus.get(command.menu);
    const button = document.createElement("button");
    for (const [key, value] of Object.entries(command.attributes || {}))
      button.setAttribute(key, value);
    button.className = "menu-command";
    button.dataset.command = command.id;
    button.role = command.checked
      ? "menuitemcheckbox"
      : command.attributes?.["data-mode"]
        ? "menuitemradio"
        : "menuitem";
    button.tabIndex = -1;
    button.title = t(command.titleKey || command.labelKey);
    button.innerHTML =
      (command.icon ? review.icon(command.icon) : "") +
      `<span>${review.esc(t(command.captionKey || command.labelKey))}</span>`;
    menu.append(button);
    const sorted = review.commands.menu(command.menu);
    for (const entry of sorted) {
      const item = [...menu.children].find(
        (b) => b.dataset.command === entry.id,
      );
      if (item) menu.append(item);
    }
  }
  review.commands.list().forEach(mount);
  review.commands.onRegister(mount);
  review.refreshMenus = () => {
    for (const [name, state] of menus) {
      let previousSection;
      for (const button of state.menu.children) {
        const command = review.commands.get(button.dataset.command);
        button.hidden = command.visible ? !command.visible() : false;
        if (command.checked)
          button.setAttribute("aria-checked", String(command.checked()));
        else if (command.attributes?.["data-mode"])
          button.setAttribute(
            "aria-checked",
            String(command.attributes["data-mode"] === review.mode),
          );
        if (command.closeLabelKey)
          button.title = t(
            command.checked?.() ? command.closeLabelKey : command.labelKey,
          );
        button.classList.toggle(
          "menu-separator",
          !button.hidden &&
            previousSection !== undefined &&
            previousSection !== command.menuSection,
        );
        if (!button.hidden) previousSection = command.menuSection;
      }
      let command = review.commands.get(state.selected);
      if (
        !command ||
        command.menu !== name ||
        (command.visible && !command.visible())
      ) {
        state.selected = defaults[name];
        command = review.commands.get(state.selected);
      }
      const item = [...state.menu.children].find(
        (button) => button.dataset.command === command.id,
      );
      // Toggle owners update their menu icon/caption in place. Mirror that
      // displayed state so the remembered face never shows yesterday's icon.
      state.main.innerHTML = item.innerHTML;
      state.main.title = item?.title || t(command.labelKey);
      state.main.setAttribute(
        "aria-label",
        item?.getAttribute("aria-label") || t(command.labelKey),
      );
      state.main.disabled = !command.enabled("button");
      state.main.classList.toggle(
        "active",
        command.attributes?.["data-mode"] === review.mode,
      );
      if (command.checked)
        state.main.setAttribute("aria-pressed", String(command.checked()));
      else state.main.removeAttribute("aria-pressed");
    }
  };
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".shell-menu, .split-tool")) close();
  });
  document.addEventListener("focusin", (e) => {
    if (!e.target.closest(".shell-menu, .split-tool")) close();
  });
  window.addEventListener("resize", () => close());
  window.visualViewport?.addEventListener("resize", () => close());
  window.visualViewport?.addEventListener("scroll", () => close());
  review.openMenu = open;
}
