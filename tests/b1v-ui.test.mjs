import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSettings } from "../src/app/settings.js";
import { toolbarPlacement } from "../src/app/menus.js";
import { registerToolbarCommands } from "../src/app/toolbar.js";
import { createCommandRegistry } from "../src/app/commands.js";
import { createParts, buildPartTree } from "../src/viewer/parts-tree.js";
import { PartsMethods } from "../src/viewer/parts.js";

function retiredPreference(saved) {
  const data = new Map([["meshcue.settings.parts", saved]]);
  const settings = createSettings({
    getItem: (id) => data.get(id),
    removeItem: (id) => data.delete(id),
    setItem: (id, value) => data.set(id, value),
  });
  assert.equal(settings.get("parts"), true);
  assert.equal(data.has("meshcue.settings.parts"), false);
  settings.set("parts", false);
  assert.equal(settings.get("parts"), true);
  assert.equal(data.has("meshcue.settings.parts"), false);
}
// Spell out the cases so the repository's documented-count guard sees each.
test("retired false Parts preference cannot hide the permanent tab", () =>
  retiredPreference("false"));
test("retired true Parts preference cannot hide the permanent tab", () =>
  retiredPreference("true"));
test("corrupt retired Parts preference cannot hide the permanent tab", () =>
  retiredPreference("broken"));
test("retiring Parts also tolerates storage that refuses removal", () => {
  const settings = createSettings({
    getItem: () => "false",
    removeItem() {
      throw new Error("Denied");
    },
  });
  assert.equal(settings.get("parts"), true);
});
test("toolbar placement keeps navigation's registry contract while exposing Fit and Home", () => {
  assert.deepEqual(toolbarPlacement({ id: "navigation-fit", menu: "view" }), {
    group: "view",
    direct: true,
  });
  assert.deepEqual(toolbarPlacement({ id: "home", menu: "view" }), {
    group: "view",
    direct: true,
  });
  assert.deepEqual(
    toolbarPlacement({ id: "navigation-projection", menu: "view" }),
    { group: "display", direct: false },
  );
  assert.deepEqual(
    toolbarPlacement({ id: "marks", group: "marks-panel" }),
    null,
  );
});
test("file hierarchy, not similar names, owns whole-group viewing operations", () => {
  const root = new THREE.Scene(),
    group = new THREE.Group();
  group.name = "Assembly";
  root.add(group);
  for (const [i, name] of ["same_prefix_A", "same_prefix_B"].entries()) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    mesh.name = name;
    mesh.userData.reviewId = `mesh-${i}`;
    group.add(mesh);
  }
  const parts = createParts();
  parts.reset(buildPartTree(root));
  const [assembly, first, second] = parts.list();
  assert.equal(parts.list().length, 3);
  assert.deepEqual(assembly.childIds, [first.id, second.id]);
  parts.setVisible(assembly.id, false);
  assert.equal(parts.isVisible(first.id), false);
  assert.equal(parts.isVisible(second.id), false);
  parts.showAll();
  parts.setTransparent(assembly.id, true);
  assert.equal(parts.isTransparent(first.id), true);
  assert.equal(parts.isTransparent(second.id), true);
  parts.isolate([first.id]);
  assert.equal(parts.isVisible(second.id), false);
  let kind;
  parts.onChange((value) => {
    kind = value;
  });
  parts.restoreAll({ preserveMeasure: true });
  assert.equal(kind, "reset-view");
  assert.equal(parts.isIsolated(), false);
  assert.equal(parts.isTransparent(first.id), false);
  assert.equal(parts.isVisible(second.id), true);
});
test("preview Reset restores viewing state via home without touching draft, marks or measurements", () => {
  const calls = [],
    commands = createCommandRegistry();
  const viewer = {
    enabled: true,
    parts: { restoreAll: (options) => calls.push(["parts", options]) },
    hoverPart: () => calls.push("hover"),
    setSection: (value) => calls.push(["section", value]),
    neutral: true,
    setNeutral: (value) => calls.push(["neutral", value]),
    setVisible: (value) => calls.push(["marks-visible", value]),
    home: () => calls.push("home"),
  };
  const review = {
    commands,
    viewer,
    loadedId: "version",
    showToggle() {},
    setDisplayStyle: (value) => calls.push(["style", value]),
    showMarksToggle: () => calls.push("marks-toggle"),
  };
  registerToolbarCommands(review);
  commands.run("reset-preview");
  assert.deepEqual(calls, [
    ["parts", { preserveMeasure: true }],
    "hover",
    ["section", null],
    ["neutral", false],
    ["style", "edges"],
    ["marks-visible", true],
    "marks-toggle",
    "home",
  ]);
});
test("part Reset preserves a pending measurement while ordinary visibility changes cancel stale picks", () => {
  let cleared = 0;
  const viewer = {
    parts: { list: () => [], selected: () => null },
    meshes: [],
    clearMeasure: () => cleared++,
    clearOverlay() {},
    syncPartCaps() {},
    highlightPart() {},
  };
  PartsMethods.prototype.updateParts.call(viewer, "reset-view");
  assert.equal(cleared, 0);
  PartsMethods.prototype.updateParts.call(viewer, "view");
  assert.equal(cleared, 1);
});
