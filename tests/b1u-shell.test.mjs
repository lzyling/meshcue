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
