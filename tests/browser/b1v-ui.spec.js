import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { clickControl } from "./r12-shell-helpers.mjs";

let environment;
const evidence = "tmp/b1v-ui/evidence";
test.afterEach(async () => environment?.stop());
async function open(page, fixture = "tmp/samples/parametric-bracket.glb") {
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST,
    runRoot: "tmp/b1v-ui/scenarios",
  });
  const kit = scenarioKit(page, environment);
  await kit.open(environment.url);
  return kit;
}
for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["phone", { width: 390, height: 844 }],
]) {
  test(`capture UI ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    fs.mkdirSync(evidence, { recursive: true });
    const phase = process.env.B1V_BEFORE ? "before" : "after";
    await page.screenshot({ path: `${evidence}/${phase}-${name}-marks.png` });
    if (process.env.B1V_BEFORE) {
      await page.locator("#settings-button").click();
      await page.locator("#setting-parts").check();
      await page.locator("#close-settings").click();
    }
    await page.locator("#sidebar-parts").click();
    await page.screenshot({ path: `${evidence}/${phase}-${name}-parts.png` });
    if (!process.env.B1V_BEFORE && name === "phone") {
      await page.locator('.toolbar [data-mode="measure"]').click();
      await page.locator("#measure-advanced summary").click();
      await page.locator("#section-toggle").click();
      await expect
        .poll(
          async () =>
            (await page.locator(".viewer-shell").boundingBox()).height,
        )
        .toBeGreaterThanOrEqual(650);
      // A remembered Advanced disclosure must not enlarge another tool's view.
      await clickControl(page, '[data-mode="label"]');
      await expect
        .poll(
          async () =>
            (await page.locator(".viewer-shell").boundingBox()).height,
        )
        .toBeLessThan(650);
      await page.locator("#section-off").click();
    }
  });
}

async function modelFixture(single = false) {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((value) => {
        this.result = value;
        this.onloadend?.();
      });
    }
  };
  const root = new THREE.Scene();
  const assembly = new THREE.Group();
  assembly.name = "Assembly";
  const drive = new THREE.Group();
  drive.name = "Drive";
  const guard = new THREE.Group();
  guard.name = "Guard";
  if (!single) {
    root.add(assembly);
    assembly.add(drive, guard);
  }
  for (const [index, name] of (single
    ? ["Screw A"]
    : ["Screw A", "Screw B", "Cover"]
  ).entries()) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({
        color: [0xd58060, 0x4c95b5, 0x75a56b][index],
      }),
    );
    mesh.name = name;
    mesh.position.x = (index - (single ? 0 : 1)) * 3;
    (single ? root : index < 2 ? drive : guard).add(mesh);
  }
  fs.mkdirSync("tmp/b1v-ui", { recursive: true });
  const file = `tmp/b1v-ui/${single ? "single" : "assembly"}.glb`;
  fs.writeFileSync(
    file,
    Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true })),
  );
  return file;
}
const row = (page, name) =>
  page
    .locator(".parts-row")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settle = (page) =>
  expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
for (const single of [true, false]) {
  test(`tabs always visible for ${single ? "single" : "multi"}-part models despite an old false preference`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("meshcue.settings.parts", "false"),
    );
    await open(page, await modelFixture(single));
    await expect(page.locator("#sidebar-marks")).toBeVisible();
    await expect(page.locator("#sidebar-parts")).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("meshcue.settings.parts")),
    ).toBeNull();
    await page.locator("#settings-button").click();
    await expect(page.locator("#setting-parts")).toHaveCount(0);
    await page.locator("#close-settings").click();
    const marksWidth = (await page.locator("#sidebar-marks").boundingBox())
      .width;
    expect(
      (await page.locator("#sidebar-parts").boundingBox()).width,
    ).toBeCloseTo(marksWidth, 0);
    await page.locator("#sidebar-parts").click();
    await expect(page.locator("#sidebar-marks")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await expect(page.locator("#sidebar-parts")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(".parts-name").first()).toBeVisible();
    await expect(page.locator("#submit-feedback")).toBeHidden();
    await expect(page.locator("#toggle-marks")).toBeVisible();
    await page.locator("#sidebar-marks").click();
    await expect(page.locator("#submit-feedback")).toBeVisible();
    await expect(page.locator("#toggle-marks")).toBeVisible();
    await page.locator("#toggle-annotations").click();
    await expect(page.locator("#submit-feedback")).toBeHidden();
    await expect(page.locator("#sidebar-parts")).toBeVisible();
    await page.locator("#sidebar-marks").click();
    await expect(page.locator("#submit-feedback")).toBeVisible();
  });
}
test("notes and hand-over belong only to Marks; hidden parts survive switching back", async ({
  page,
}) => {
  const kit = await open(page, await modelFixture(true));
  await clickControl(page, '[data-mode="label"]');
  await kit.clickModelPoint([0, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await page.locator("#mark-note-text").fill("Keep this note");
  await expect(page.locator("#mark-note")).toBeVisible();
  await page.locator("#sidebar-parts").click();
  await expect(page.locator("#mark-note")).toBeHidden();
  await expect(page.locator("#submit-feedback")).toBeHidden();
  await row(page, "Screw A").locator(".parts-eye").click();
  await page.locator("#sidebar-marks").click();
  await expect(page.locator("#mark-note-text")).toHaveValue("Keep this note");
  await expect(page.locator(".model-pin")).toHaveCount(0);
  await page.locator("#sidebar-parts").click();
  await expect(row(page, "Screw A")).toHaveClass(/part-hidden/);
});
test("tree search retains parent paths and file groups hide, isolate, turn transparent and fit", async ({
  page,
}) => {
  await open(page, await modelFixture());
  await page.locator("#sidebar-parts").click();
  await expect(page.locator(".parts-row")).toHaveCount(6);
  await row(page, "Drive").locator(".parts-expand").click();
  await expect(row(page, "Screw A")).toHaveCount(0);
  await page.locator("#parts-search").fill("SCREW B");
  await expect(page.locator(".parts-row")).toHaveCount(3);
  for (const name of ["Assembly", "Drive", "Screw B"])
    await expect(row(page, name)).toBeVisible();
  await expect(row(page, "Screw B")).toHaveAttribute("aria-level", "3");
  await page.locator("#parts-search").fill("no such part");
  await expect(page.locator(".parts-row")).toHaveCount(0);
  await page.locator("#parts-search").fill("");
  await expect(row(page, "Drive")).toHaveAttribute("aria-expanded", "false");
  await row(page, "Drive").locator(".parts-name").click();
  await page.locator("#parts-tree").focus();
  const cameraBeforeKeys = (await diagnostics(page)).camera;
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "Screw A")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Screw A")).toHaveCount(0);
  expect((await diagnostics(page)).camera).toEqual(cameraBeforeKeys);
  await page.keyboard.press("ArrowRight");
  await row(page, "Drive").locator(".parts-eye").click();
  for (const name of ["Drive", "Screw A", "Screw B"])
    await expect(row(page, name)).toHaveClass(/part-hidden/);
  await expect(row(page, "Cover")).not.toHaveClass(/part-hidden/);
  await page.locator('[data-command="parts-showAll"]').click();
  await row(page, "Drive").locator(".parts-name").click();
  await page.keyboard.press("Shift+T");
  for (const name of ["Drive", "Screw A", "Screw B"])
    await expect(row(page, name)).toHaveClass(/part-transparent/);
  await page.keyboard.press("Shift+I");
  await expect(row(page, "Cover")).toHaveClass(/part-hidden/);
  const before = (await diagnostics(page)).camera;
  await row(page, "Drive").locator(".parts-name").dblclick();
  await settle(page);
  expect((await diagnostics(page)).camera).not.toEqual(before);
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/after-desktop-group-actions.png`,
  });
});
test("common tools use their direct or mode-menu entry and display icon tracks the current style", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator(".split-tool, .split-arrow")).toHaveCount(0);
  for (const mode of ["label", "fill", "measure"]) {
    const control = page.locator(`[data-mode="${mode}"]`);
    await clickControl(page, `[data-mode="${mode}"]`);
    await expect(control).toHaveAttribute(
      mode === "label" ? "aria-checked" : "aria-pressed",
      "true",
    );
  }
  await clickControl(page, '[data-mode="pan"]');
  await expect(page.locator("#view-mode-toggle use")).toHaveAttribute(
    "href",
    "#mc-pan",
  );
  await clickControl(page, '[data-mode="orbit"]');
  await expect(page.locator("#view-mode-toggle use")).toHaveAttribute(
    "href",
    "#mc-orbit",
  );
  for (const style of ["wireframe", "hidden", "xray", "shaded", "edges"]) {
    await page.locator("#display-toggle").click();
    await page.locator(`[data-style="${style}"]`).click();
    await expect(page.locator("#display-toggle use")).toHaveAttribute(
      "href",
      `#mc-display-${style}`,
    );
    await expect(page.locator("#display-toggle")).toBeFocused();
  }
  await page.locator("#view-mode-toggle").click();
  await expect(
    page.locator('#view-mode-menu [data-command="parts-panel"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#view-mode-menu [data-command="home"]'),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});
test("Label mode-menu and direct Fill close View mode menu without stealing focus or hiding hints", async ({
  page,
}) => {
  await open(page);
  const more = page.locator("#view-mode-toggle"),
    menu = page.locator("#view-mode-menu"),
    shell = page.locator(".viewer-shell");
  for (const mode of ["label", "fill"]) {
    const tool = page.locator(
      mode === "label" ? "#mark-mode-toggle" : '[data-mode="fill"]',
    );
    await more.click();
    await expect(menu).toBeVisible();
    await expect(shell).toHaveClass(/menu-open/);
    await expect(page.locator(".tool-hint-box")).toBeHidden();
    await clickControl(page, `[data-mode="${mode}"]`);
    await expect(menu).toBeHidden();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(shell).not.toHaveClass(/menu-open/);
    await expect(tool).toHaveClass(/active/);
    await expect(tool).toBeFocused();
    await expect(page.locator(".tool-hint-box")).toBeVisible();
    // Label/Fill have no pending Escape action. It must not revive the stale
    // menu, move focus to its items, or hide the newly selected tool's hint.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(tool).toBeFocused();
    await expect(tool).toHaveClass(/active/);
    await expect(page.locator(".tool-hint-box")).toBeVisible();
    // A later menu session retains its own Escape focus restoration.
    await more.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
    await expect(shell).not.toHaveClass(/menu-open/);
  }
});
test("modified arrows reach camera shortcuts from flat View and Display buttons", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.__b1vToolbarArrowEvents = [];
    // This bubble listener runs after the application's registry listener;
    // a group that stops propagation never delivers an event here.
    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown"].includes(event.key))
        window.__b1vToolbarArrowEvents.push({
          key: event.key,
          prevented: event.defaultPrevented,
        });
    });
  });
  for (const [selector, popup, more] of [
    ["#view-mode-toggle", "#view-mode-menu", "#view-mode-toggle"],
    ["#display-toggle", "#display-menu", "#display-toggle"],
  ]) {
    const button = page.locator(selector),
      menu = page.locator(popup);
    await button.focus();
    await expect(button).toBeFocused();
    for (const key of ["ArrowUp", "ArrowDown"]) {
      for (const [modifier, registered] of [
        ["Control", true],
        ["Shift", true],
        ["Control+Shift", true],
        ["Meta", false],
        ["Alt", false],
      ]) {
        await settle(page);
        const before = (await diagnostics(page)).camera;
        await page.evaluate(() => {
          window.__b1vToolbarArrowEvents = [];
        });
        await page.keyboard.press(`${modifier}+${key}`);
        await settle(page);
        await expect(menu).toBeHidden();
        await expect(page.locator(more)).toHaveAttribute(
          "aria-expanded",
          "false",
        );
        await expect(page.locator(".viewer-shell")).not.toHaveClass(
          /menu-open/,
        );
        await expect(button).toBeFocused();
        expect(
          await page.evaluate(() => window.__b1vToolbarArrowEvents),
        ).toEqual([{ key, prevented: registered }]);
        if (!registered) continue;
        const after = (await diagnostics(page)).camera;
        expect(after).not.toEqual(before);
        if (modifier === "Control+Shift") {
          // Pan must translate camera and target together, not orbit instead.
          const positionShift = new THREE.Vector3()
              .fromArray(after.position)
              .sub(new THREE.Vector3().fromArray(before.position)),
            targetShift = new THREE.Vector3()
              .fromArray(after.target)
              .sub(new THREE.Vector3().fromArray(before.target));
          expect(targetShift.length()).toBeGreaterThan(0.001);
          expect(positionShift.distanceTo(targetShift)).toBeLessThan(1e-7);
        }
      }
      // Only bare arrows enter the menu, with Up choosing the last item.
      await page.keyboard.press(key);
      await expect(menu).toBeVisible();
      const items = menu.locator('[role^="menuitem"]:visible');
      await expect(
        key === "ArrowUp" ? items.last() : items.first(),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(page.locator(more)).toBeFocused();
      await button.focus();
    }
  }
});
test("Reset requires confirmation, restores Agent display and clears draft marks and measurements with undo", async ({
  page,
}) => {
  const kit = await open(page, await modelFixture(true));
  await settle(page);
  await clickControl(page, '[data-mode="label"]');
  await kit.clickModelPoint([0, 0, 1]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await page.locator("#mark-note-text").fill("Do not lose this");
  await page.locator("#viewer").click({ position: { x: 10, y: 50 } });
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  // An unkept two-point reading is also a measurement, not preview state.
  await page.locator('.toolbar [data-mode="measure"]').click();
  await page.locator("#measure-advanced summary").click();
  await page.locator('[data-measure="points"]').click();
  await kit.clickModelPoint([-0.6, -0.6, 1]);
  await kit.clickModelPoint([0.6, -0.6, 1]);
  await expect(page.locator("#keep-measure")).toBeEnabled();
  const measurement = (await diagnostics(page)).measuring;
  await page.locator("#sidebar-parts").click();
  await row(page, "Screw A").locator(".parts-name").click();
  // Visibility changes cancel the old reading. The confirmed Reset now clears
  // measurements too (r4 §7); undo restores the draft marks, not viewer picks.
  await page.keyboard.press("Shift+T");
  await page.keyboard.press("Shift+I");
  await row(page, "Screw A").locator(".parts-eye").click();
  await page.locator("#section-toggle").click();
  await page.locator("#display-toggle").click();
  await page.locator('[data-style="xray"]').click();
  await clickControl(page, "#neutral-view");
  const before = await diagnostics(page);
  await page.locator("#reset-preview").click();
  await expect(page.locator("#reset-dialog")).toBeVisible();
  await expect(page.locator("#reset-dialog-message")).toContainText("1");
  await page.locator("#reset-cancel").click();
  expect((await diagnostics(page)).annotations).toEqual(before.annotations);
  await expect(row(page, "Screw A")).toHaveClass(/part-hidden/);
  await page.locator("#reset-preview").click();
  await page.locator("#reset-confirm").click();
  await settle(page);
  await expect
    .poll(async () => (await diagnostics(page)).annotationCount)
    .toBe(0);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const after = await diagnostics(page);
  expect(after.annotations).toEqual([]);
  expect(after.revision).toBeGreaterThan(before.revision);
  expect(after.dirty).toBe(false);
  expect(after.viewer.section).toBeNull();
  expect(after.viewer.neutral).toBe(false);
  expect(after.viewer.display.style).toBe("edges");
  await expect(page.locator(".part-hidden, .part-transparent")).toHaveCount(0);
  await expect(page.locator('[data-command="parts-isolate"]')).toHaveCount(0);
  await expect(page.locator("#section-options")).toBeHidden();
  await expect(page.locator("#keep-measure")).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await diagnostics(page)).annotations)
    .toEqual(before.annotations);
  await page.locator("#sidebar-marks").click();
  await page.locator(".annotation-select").first().click();
  await expect(page.locator("#mark-note-text")).toHaveValue("Do not lose this");
  await kit.clickModelPoint([-0.6, -0.6, 1]);
  await kit.clickModelPoint([0.6, -0.6, 1]);
  await expect(page.locator("#keep-measure")).toBeEnabled();
  expect((await diagnostics(page)).measuring.result.value).toBeCloseTo(
    measurement.result.value,
    4,
  );
  await page.screenshot({ path: `${evidence}/after-desktop-reset-undo.png` });
});
