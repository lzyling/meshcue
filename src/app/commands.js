/* Commands are shared by buttons and keys so a feature owns its action once.
   Normalize before registration, including platform aliases, rather than let
   listener order decide which of two features silently steals a shortcut. */
const aliases = {
  cmd: "meta",
  command: "meta",
  "⌘": "meta",
  control: "ctrl",
  esc: "escape",
};
const modifiers = ["ctrl", "meta", "alt", "shift"];
export function shortcutKeys(shortcut) {
  const parts = shortcut
    .toLowerCase()
    .split("+")
    .map((s) => aliases[s.trim()] || s.trim());
  if (parts.includes("mod"))
    return ["ctrl", "meta"].flatMap((mod) =>
      shortcutKeys(parts.map((p) => (p === "mod" ? mod : p)).join("+")),
    );
  const keys = parts.filter((p) => !modifiers.includes(p));
  if (keys.length !== 1 || !keys[0] || new Set(parts).size !== parts.length)
    throw new Error(`Invalid shortcut: ${shortcut}`);
  return [[...modifiers.filter((p) => parts.includes(p)), keys[0]].join("+")];
}
export function eventShortcut(event) {
  return [
    ...modifiers.filter((m) => event[`${m}Key`]),
    aliases[event.key.toLowerCase()] || event.key.toLowerCase(),
  ].join("+");
}
export function createCommandRegistry() {
  const commands = new Map(),
    shortcuts = new Map(),
    listeners = new Set();
  return {
    register(command) {
      if (!command.id || !command.labelKey || typeof command.run !== "function")
        throw new TypeError("A command needs id, labelKey and run()");
      if (commands.has(command.id))
        throw new Error(`Duplicate command: ${command.id}`);
      const keys = (
        typeof command.shortcuts === "string"
          ? [command.shortcuts]
          : command.shortcuts || []
      ).flatMap(shortcutKeys);
      for (const key of keys)
        if (shortcuts.has(key) || keys.indexOf(key) !== keys.lastIndexOf(key))
          throw new Error(`Duplicate shortcut: ${key}`);
      const entry = { enabled: () => true, ...command };
      commands.set(entry.id, entry);
      for (const key of keys) shortcuts.set(key, entry.id);
      for (const listener of listeners) listener(entry);
      return entry;
    },
    get: (id) => commands.get(id),
    list: () => [...commands.values()],
    onRegister(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run(id, source = "button") {
      const command = commands.get(id);
      if (command?.enabled(source)) return command.run();
    },
    dispatch(event) {
      const id = shortcuts.get(eventShortcut(event));
      if (!id || !commands.get(id).enabled("keyboard")) return false;
      if (commands.get(id).preventDefault !== false) event.preventDefault();
      commands.get(id).run();
      return true;
    },
  };
}
