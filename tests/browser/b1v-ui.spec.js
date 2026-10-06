import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { clickControl } from "./b1u-shell-helpers.mjs";

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
      await page.locator('.toolbar [data-mode="label"]').click();
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
    await expect(page.locator("#toggle-marks")).toBeHidden();
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
  await page.locator('.toolbar [data-mode="label"]').click();
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
  await page.locator('[data-command="parts-transparent"]').click();
  for (const name of ["Drive", "Screw A", "Screw B"])
    await expect(row(page, name)).toHaveClass(/part-transparent/);
  await page.locator('[data-command="parts-isolate"]').click();
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
test("common tools switch in one click and display icon tracks the current style", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator(".split-tool, .split-arrow")).toHaveCount(0);
  for (const mode of ["label", "fill", "measure"]) {
    const control = page.locator(`.toolbar [data-mode="${mode}"]`);
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
  }
  await page.locator("#view-mode-toggle").click();
  await expect(page.locator("#view-mode-toggle use")).toHaveAttribute(
    "href",
    "#mc-pan",
  );
  await page.locator("#view-mode-toggle").click();
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
  await page.locator("#view-menu-button").click();
  await expect(
    page.locator('#view-menu [data-command="parts-panel"]'),
  ).toHaveCount(0);
  await expect(page.locator('#view-menu [data-command="home"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
});
test("direct Label and Fill close View overflow without stealing focus or hiding hints", async ({
  page,
}) => {
  await open(page);
  const more = page.locator("#view-menu-button"),
    menu = page.locator("#view-menu"),
    shell = page.locator(".viewer-shell");
  for (const mode of ["label", "fill"]) {
    const tool = page.locator(`.toolbar [data-mode="${mode}"]`);
    await more.click();
    await expect(menu).toBeVisible();
    await expect(shell).toHaveClass(/menu-open/);
    await expect(page.locator(".tool-hint-box")).toBeHidden();
    await tool.click();
    await expect(menu).toBeHidden();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(shell).not.toHaveClass(/menu-open/);
    await expect(tool).toHaveAttribute("aria-pressed", "true");
    await expect(tool).toBeFocused();
    await expect(page.locator(".tool-hint-box")).toBeVisible();
    // Label/Fill have no pending Escape action. It must not revive the stale
    // menu, move focus to its items, or hide the newly selected tool's hint.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(tool).toBeFocused();
    await expect(tool).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tool-hint-box")).toBeVisible();
    // A later menu session retains its own Escape focus restoration.
    await more.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
    await expect(shell).not.toHaveClass(/menu-open/);
  }
});
test("Reset restores parts, section, original colours, display and home without changing a noted mark or measurement", async ({
  page,
}) => {
  const kit = await open(page, await modelFixture(true));
  await settle(page);
  await page.locator('.toolbar [data-mode="label"]').click();
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
  // Visibility changes intentionally cancel an old reading; Reset itself must
  // not. Restore a reading after making the viewer changes below.
  await page.locator('[data-command="parts-transparent"]').click();
  await page.locator('[data-command="parts-isolate"]').click();
  await row(page, "Screw A").locator(".parts-eye").click();
  await page.locator("#section-toggle").click();
  await page.locator("#display-toggle").click();
  await page.locator('[data-style="xray"]').click();
  await clickControl(page, "#neutral-view");
  const before = await diagnostics(page);
  await page.locator("#reset-preview").click();
  await settle(page);
  const after = await diagnostics(page);
  expect(after.annotations).toEqual(before.annotations);
  expect(after.revision).toBe(before.revision);
  expect(after.dirty).toBe(before.dirty);
  expect(after.viewer.section).toBeNull();
  expect(after.viewer.neutral).toBe(false);
  expect(after.viewer.display.style).toBe("edges");
  await expect(page.locator(".part-hidden, .part-transparent")).toHaveCount(0);
  await expect(page.locator('[data-command="parts-isolate"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#section-options")).toBeHidden();
  await kit.clickModelPoint([-0.6, -0.6, 1]);
  await kit.clickModelPoint([0.6, -0.6, 1]);
  await expect(page.locator("#keep-measure")).toBeEnabled();
  const pending = (await diagnostics(page)).measuring;
  expect(pending.result.value).toBeCloseTo(measurement.result.value, 4);
  await page.locator("#reset-preview").click();
  expect((await diagnostics(page)).measuring).toEqual(pending);
  await page.locator("#sidebar-marks").click();
  await expect(page.locator("#mark-note-text")).toHaveValue("Do not lose this");
  await expect(page.locator("#keep-measure")).toBeEnabled();
  await page.screenshot({
    path: `${evidence}/after-desktop-reset-keeps-mark-and-measure.png`,
  });
});
