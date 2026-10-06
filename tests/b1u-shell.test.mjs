import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRegistry } from "../src/app/commands.js";

test("menu registrations sort stably, preserve groups and register late commands", () => {
  const registry = createCommandRegistry();
  const seen = [];
  registry.onRegister((command) => seen.push(command.id));
  for (const [id, menu, menuOrder] of [
    ["late", "view", 20],
    ["first", "view", 0],
    ["equal", "view", 0],
    ["mark", "mark", 0],
  ])
    registry.register({
      id,
      labelKey: id,
      menu,
      menuOrder,
      menuSection: "tools",
      run: () => seen.push("run"),
    });
  registry.register({
    id: "undo",
    labelKey: "undo",
    group: "history",
    run() {},
  });
  assert.deepEqual(
    registry.menu("view").map((c) => c.id),
    ["first", "equal", "late"],
  );
  assert.equal(registry.get("undo").group, "history");
  assert.equal(registry.get("first").menuSection, "tools");
  registry.run("mark");
  assert.deepEqual(seen, ["late", "first", "equal", "mark", "undo", "run"]);
  for (const extra of [{ menu: "other" }, { menu: "view", menuOrder: NaN }])
    assert.throws(
      () =>
        registry.register({ id: "bad", labelKey: "bad", run() {}, ...extra }),
      TypeError,
    );
  assert.equal(registry.get("bad"), undefined);
});

import { createSettings } from "../src/app/settings.js";
test("settings persist independently, notify changes and tolerate unavailable or corrupt storage", () => {
  const data = new Map(),
    storage = {
      getItem: (id) => data.get(id) ?? null,
      setItem: (id, value) => data.set(id, value),
    };
  const settings = createSettings(storage),
    calls = [];
  assert.equal(settings.get("performance"), false);
  assert.equal(settings.get("viewCube"), true);
  const off = settings.on("performance", (value) => calls.push(value));
  settings.set("performance", true);
  settings.set("performance", true);
  assert.equal(data.get("meshcue.settings.performance"), "true");
  assert.equal(createSettings(storage).get("performance"), true);
  off();
  settings.set("performance", false);
  assert.deepEqual(calls, [true]);
  data.set("meshcue.settings.performance", "broken");
  data.set("meshcue.settings.viewCube", '"false"');
  assert.equal(createSettings(storage).get("performance"), false);
  assert.equal(createSettings(storage).get("viewCube"), true);
  const denied = createSettings({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  denied.set("performance", true);
  assert.equal(denied.get("performance"), true);
  assert.throws(() => settings.set("performance", "true"), TypeError);
});
