import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRegistry } from "../src/app/commands.js";
import { shortcutsBlocked } from "../src/app/keyboard.js";
const key = (key, modifiers = {}) => ({
  key,
  ...modifiers,
  preventDefault() {
    this.prevented = true;
  },
});

test("command registration rejects shortcut aliases and platform collisions atomically", () => {
  const commands = createCommandRegistry();
  commands.register({
    id: "undo",
    labelKey: "tool.undo",
    shortcuts: "Mod+Z",
    run() {},
  });
  for (const shortcut of ["Ctrl+z", "COMMAND+Z", "⌘+z"])
    assert.throws(
      () =>
        commands.register({
          id: shortcut,
          labelKey: "tool.redo",
          shortcuts: ["Alt+X", shortcut],
          run() {},
        }),
      /Duplicate shortcut/,
    );
  assert.equal(commands.dispatch(key("x", { altKey: true })), false);
  assert.equal(commands.list().length, 1);
});

test("buttons and shortcuts run the registered action and respect enablement", () => {
  const commands = createCommandRegistry(),
    calls = [];
  let enabled = true;
  commands.register({
    id: "redo",
    labelKey: "tool.redo",
    shortcuts: "Mod+Shift+Z",
    enabled: () => enabled,
    run: () => calls.push("redo"),
  });
  commands.run("redo");
  for (const modifier of ["ctrlKey", "metaKey"]) {
    const event = key("Z", { [modifier]: true, shiftKey: true });
    assert.equal(commands.dispatch(event), true);
    assert.equal(event.prevented, true);
  }
  enabled = false;
  commands.run("redo");
  assert.equal(
    commands.dispatch(key("z", { ctrlKey: true, shiftKey: true })),
    false,
  );
  assert.deepEqual(calls, ["redo", "redo", "redo"]);
  commands.register({
    id: "escape",
    labelKey: "common.close",
    shortcuts: "Escape",
    preventDefault: false,
    run() {},
  });
  const escape = key("Escape");
  assert.equal(commands.dispatch(escape), true);
  assert.equal(escape.prevented, undefined);
});

test("shortcut typing and modal guards cover focused and nested editable targets", () => {
  const plain = { closest: () => null },
    input = { closest: () => ({}) };
  const doc = { activeElement: plain, querySelector: () => null };
  assert.equal(shortcutsBlocked(doc, plain), false);
  assert.equal(shortcutsBlocked(doc, input), true);
  doc.activeElement = { isContentEditable: true };
  assert.equal(shortcutsBlocked(doc, plain), true);
  doc.activeElement = plain;
  doc.querySelector = () => ({});
  assert.equal(shortcutsBlocked(doc, plain), true);
});
