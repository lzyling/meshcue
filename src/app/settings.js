import {
  t,
  currentLocale,
  setLocale,
  LOCALES,
  localeName,
} from "../i18n/index.js";
import { storeThemeChoice, applyTheme, THEMES } from "../theme.js";

// Preferences belong to this browser, never to a model's saved draft. Storage
// can be blocked or corrupt; the in-memory choice still works for this visit.
export function createSettings(
  storage,
  defaults = {
    performance: false,
    viewCube: true,
    axes: false,
    zoomToCursor: false,
    sidebarCollapsed: false,
  },
) {
  // Parts is now a permanent entry point. Retire the old switch without
  // letting a saved false hide the tree, including in older feature callers.
  try {
    storage?.removeItem("meshcue.settings.parts");
  } catch {
    /* Storage is optional. */
  }
  const values = new Map(),
    listeners = new Map();
  return {
    get(id) {
      if (id === "parts") return true;
      if (!values.has(id)) {
        let value = defaults[id];
        try {
          const saved = storage?.getItem(`meshcue.settings.${id}`);
          if (saved !== null && saved !== undefined) {
            const parsed = JSON.parse(saved);
            if (!(id in defaults) || typeof parsed === typeof defaults[id])
              value = parsed;
          }
        } catch {
          /* Fall back to the declared default. */
        }
        values.set(id, value);
      }
      return values.get(id);
    },
    set(id, value) {
      if (id === "parts") return;
      if (id in defaults && typeof value !== typeof defaults[id])
        throw new TypeError(`Invalid setting: ${id}`);
      const previous = this.get(id);
      values.set(id, value);
      try {
        storage?.setItem(`meshcue.settings.${id}`, JSON.stringify(value));
      } catch {
        /* Memory remains authoritative in this visit. */
      }
      if (!Object.is(previous, value))
        for (const fn of listeners.get(id) || []) fn(value);
    },
    on(id, fn) {
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(fn);
      return () => listeners.get(id).delete(fn);
    },
  };
}
export function installSettings(review) {
  let storage;
  try {
    storage = localStorage;
  } catch {
    /* Browser privacy modes may deny even the getter. */
  }
  review.settings = createSettings(storage);
}

export function bindSettings(review) {
  review.$("#settings-button").onclick = () =>
    review.$("#settings-dialog").showModal();
  review.$("#close-settings").onclick = () =>
    review.$("#settings-dialog").close();
  const features = review.$("#settings-features");
  for (const [id, key] of [
    ["performance", "shell.performance"],
    ["viewCube", "shell.cube"],
    ["axes", "shell.axes"],
    ["zoomToCursor", "shell.zoomToCursor"],
  ]) {
    const label = document.createElement("label");
    label.className = "setting-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `setting-${id}`;
    input.checked = review.settings.get(id);
    input.onchange = () => review.settings.set(id, input.checked);
    review.settings.on(id, (value) => {
      input.checked = value;
      review.refreshCommands();
    });
    label.append(input, document.createTextNode(t(key)));
    features.append(label);
  }
  const zoom = (value) => {
    review.viewer.controls.zoomToCursor = value;
  };
  review.settings.on("zoomToCursor", zoom);
  zoom(review.settings.get("zoomToCursor"));
  const cube = (value) => {
    review.$(".orient").hidden = !value;
  };
  review.settings.on("viewCube", cube);
  cube(review.settings.get("viewCube"));
  const hints = document.createElement("button");
  hints.id = "reset-tool-hints";
  hints.textContent = t("shell.hints");
  hints.onclick = () => review.resetToolHints?.();
  const shortcuts = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = t("shell.shortcuts");
  const list = document.createElement("dl");
  shortcuts.append(summary, list);
  shortcuts.ontoggle = () => {
    if (!shortcuts.open) return;
    list.replaceChildren();
    for (const command of review.commands.list()) {
      if (!command.shortcuts) continue;
      const key = document.createElement("dt"),
        label = document.createElement("dd");
      key.textContent = (
        command.shortcutLabel ||
        (Array.isArray(command.shortcuts)
          ? command.shortcuts.join(" / ")
          : command.shortcuts)
      ).replaceAll("Mod+", "Ctrl/⌘+");
      label.textContent = t(command.labelKey);
      list.append(key, label);
    }
  };
  features.append(hints, shortcuts);
  /* The theme follows the system, so it can change while the page is open — at
   dusk, or when the reviewer flips the setting mid-review. CSS repaints itself;
   the WebGL canvas will not until it is told to. */
  review.darkQuery.addEventListener("change", () => {
    // Only while nobody has chosen. A reviewer who picked light meant it, and
    // dusk is not an argument against it.
    if (review.themeChoice === "system")
      applyTheme(review.themeChoice, review.darkQuery);
    review.viewer.applyTheme();
    review.viewer.render();
  });

  /* CSS repaints itself from the variables; the WebGL canvas is painted by us and
   will not, so every path that changes the theme has to say so here. The system
   listener above was the only one that existed, which is why the canvas could
   not have followed a manual switch. */
  review.$("#theme-choice").value = THEMES.includes(review.themeChoice)
    ? review.themeChoice
    : "system";

  review.$("#theme-choice").addEventListener("change", (e) => {
    review.themeChoice = storeThemeChoice(e.target.value);
    review.settings.set("theme", review.themeChoice);
    applyTheme(review.themeChoice, review.darkQuery);
    review.viewer.applyTheme();
    review.viewer.render();
  });

  for (const tag of LOCALES) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = localeName(tag);
    review.$("#locale-choice").append(option);
  }

  review.$("#locale-choice").value = currentLocale();

  /* Every string was placed once, when the interface was built. Rebuilding it in
   place would mean re-binding every listener and rebuilding the viewer with the
   model still in it; reloading is honest and the choice is already stored.
   Flushing first is not optional — a reload with an unsaved draft in the tab
   would throw away marks the reviewer just made. */
  review.$("#locale-choice").addEventListener("change", async (e) => {
    const wanted = e.target.value;
    if (wanted === currentLocale()) return;
    setLocale(wanted);
    review.settings.set("language", wanted);
    try {
      await review.flushDraft();
    } catch {
      /* a draft that will not save is a reason to reload no less carefully */
    }
    location.reload();
  });
}
