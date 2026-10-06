import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import {
  clickControl,
  selectSetting,
  showParts,
} from "./b1u-shell-helpers.mjs";
import fs from "node:fs";
import * as THREE from "three";

/* Follow-ups from the b1u integration review (2026-10-06). Each test pins one
   of the five points so a later change cannot quietly bring it back. */
const evidence = "tmp/b1u-fix/evidence";
let environment;
test.afterEach(async () => environment?.stop());
async function open(page, fixture = "tmp/samples/parametric-bracket.glb") {
  fs.mkdirSync(evidence, { recursive: true });
  page.on("pageerror", (error) => console.error(error.stack));
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
    runRoot: "tmp/b1u-fix/scenarios",
  });
  await scenarioKit(page, environment).open(environment.url);
}

test("the header shows the connection as a labelled dot, not by colour alone", async ({
  page,
}) => {
  await open(page);
  const dot = page.locator(".header-right #connection-indicator");
  await expect(dot).toBeVisible();
  await expect(dot).toHaveAttribute("data-state", "online");
  await expect(dot).toHaveAttribute("role", "img");
  await expect(dot).toHaveAttribute("aria-label", /^Online/);
  await expect(dot).toHaveAttribute("title", /^Online/);
  // It sits beside Help and Settings, not in place of them.
  await expect(page.locator(".header-right > *")).toHaveCount(3);
  const look = () =>
    dot.evaluate((el) => {
      const own = getComputedStyle(el),
        mark = getComputedStyle(el, "::after");
      return {
        fill: own.backgroundColor,
        slash: mark.content !== "none" && mark.display !== "none",
      };
    });
  const online = await look();
  expect(online.fill).not.toBe("rgba(0, 0, 0, 0)");
  expect(online.slash).toBe(false);

  // A dropped connection keeps polling: the dot turns into a hollow ring.
  await page.route("**/api/state**", (route) => route.abort());
  await expect(dot).toHaveAttribute("data-state", "reconnecting");
  await expect(dot).toHaveAttribute("aria-label", /^Reconnecting/);
  const reconnecting = await look();
  expect(reconnecting.fill).toBe("rgba(0, 0, 0, 0)");
  expect(reconnecting.slash).toBe(false);
  await page.screenshot({ path: `${evidence}/connection-reconnecting.png` });

  await page.unroute("**/api/state**");
  await expect(dot).toHaveAttribute("data-state", "online");

  // Access that has gone will not come back by polling: offline, struck out.
  await page.route("**/api/state**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "ACCESS_EXPIRED", error: "expired" }),
    }),
  );
  await expect(dot).toHaveAttribute("data-state", "offline");
  await expect(dot).toHaveAttribute("aria-label", /^Offline/);
  expect((await look()).slash).toBe(true);
  await page.screenshot({ path: `${evidence}/connection-offline.png` });
  await page.unroute("**/api/state**");
  await expect(dot).toHaveAttribute("data-state", "online");

  // The settings dialog still carries the longer description.
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog #connection-status")).toHaveText(
    /\S/,
  );
  await page.locator("#close-settings").click();
  await selectSetting(page, "#locale-choice", "zh-Hans");
  await page.waitForFunction(
    () => window.__reviewDiagnostics?.().viewer.meshes > 0,
  );
  await expect(dot).toHaveAttribute("aria-label", /^在线/);
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["iphone13", { width: 390, height: 844 }],
])
  test.describe(name, () => {
    test.use({ viewport });
    test(`settings language and theme choosers use the dialog's width at ${name}`, async ({
      page,
    }) => {
      await open(page);
      await page.locator("#settings-button").click();
      const dialog = await page.locator("#settings-dialog").boundingBox();
      for (const selector of ["#locale-choice", "#theme-choice"]) {
        const box = await page.locator(selector).boundingBox();
        // The icon beside it takes ~30px; the rest of the row is the select's.
        expect(box.width).toBeGreaterThan(dialog.width * 0.6);
        const size = await page
          .locator(selector)
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(size).toBeGreaterThanOrEqual(12);
      }
      // The longest option in English must fit without an ellipsis.
      const fits = await page.locator("#theme-choice").evaluate((el) => {
        const probe = document.createElement("span");
        const style = getComputedStyle(el);
        probe.style.font = style.font;
        probe.style.position = "absolute";
        probe.style.whiteSpace = "nowrap";
        probe.textContent = el.options[el.selectedIndex].textContent;
        document.body.append(probe);
        const need = probe.getBoundingClientRect().width;
        probe.remove();
        return need + 40 <= el.getBoundingClientRect().width;
      });
      expect(fits).toBe(true);
      await page.screenshot({ path: `${evidence}/settings-${name}.png` });
    });
  });

test("turning the part tree off brings every hidden or see-through part back", async ({
  page,
}) => {
  await open(page, "tests/fixtures/grouped-colours.step");
  await showParts(page);
  const rows = page.locator('[role="treeitem"]');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);
  await rows
    .nth(count - 1)
    .locator(".parts-name")
    .click();
  await page.keyboard.press("Y");
  await rows
    .nth(count - 2)
    .locator(".parts-name")
    .click();
  await page.keyboard.press("Shift+T");
  await expect(page.locator(".part-hidden")).not.toHaveCount(0);
  await expect(page.locator(".part-transparent")).not.toHaveCount(0);
  await page.locator("#settings-button").click();
  await page.locator("#setting-parts").uncheck();
  await page.locator("#close-settings").click();
  // With the tree off, its keys must not be able to hide anything again.
  await page.locator("#viewer canvas").focus();
  for (const key of ["Y", "Shift+I", "Shift+T"]) await page.keyboard.press(key);
  await page.screenshot({ path: `${evidence}/parts-off-restored.png` });
  await showParts(page);
  await expect(rows.first()).toBeVisible();
  await expect(page.locator(".part-hidden, .part-transparent")).toHaveCount(0);
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(0);
});

/* The STEP plate is 20 × 15 × 8 mm, centred, top at z = 4, rounded upright
   corners of radius 2 and a 5 mm hole through the middle; the page draws its
   (x, y, z) at 0.15 × (x, z, -y). */
async function screenOf(page, [x, y, z]) {
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const box = await page.locator("#viewer").boundingBox();
  const camera = new THREE.PerspectiveCamera(
    38,
    box.width / box.height,
    0.01,
    100,
  );
  camera.up.fromArray(d.screenUp);
  camera.position.fromArray(d.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(d.camera.target));
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(0.15 * x, 0.15 * z, -0.15 * y).project(camera);
  return {
    x: box.x + ((p.x + 1) / 2) * box.width,
    y: box.y + ((1 - p.y) / 2) * box.height,
  };
}
// A few pixels from `at` towards `inward`: onto an edge or corner, from the
// side of the face it bounds.
async function nudge(page, at, inward, px) {
  const [a, b] = [await screenOf(page, at), await screenOf(page, inward)];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + ((b.x - a.x) / d) * px, y: a.y + ((b.y - a.y) / d) * px };
}
const measureAt = async (page, at) => {
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
};
const objects = (page) =>
  page.evaluate(() => window.__reviewDiagnostics().measuring?.objects);
const TOP = [5, 3, 4];

test("smart measure pairs corners, straight edges and flat faces truthfully", async ({
  page,
}) => {
  await open(page, "tests/fixtures/plate.step");
  await clickControl(page, '[data-mode="measure"]');
  const reading = page.locator("#measure-reading"),
    keep = page.locator("#keep-measure");

  // Corner to face: the corner where the front edge meets its rounded end,
  // then the bottom face, 8 mm below it.
  await measureAt(page, await nudge(page, [8, -7.5, 4], TOP, 4));
  expect(await objects(page)).toEqual(["point"]);
  await page.locator('.orient-face[data-view="0,-1,0"]').dispatchEvent("click");
  await measureAt(page, await screenOf(page, [5, 3, -4]));
  expect(await objects(page)).toEqual(["point", "face"]);
  await expect(reading).toHaveText("8.00 mm");
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect
    .poll(async () =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  const kept = await page.evaluate(
    () => window.__reviewDiagnostics().annotations[0],
  );
  expect(kept.kind).toBe("points");
  expect(kept.value).toBe(8);
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().dirty))
    .toBe(false);

  // Two parallel straight edges: front and back of the top face, 15 apart.
  await page.locator("#home-view").click();
  await measureAt(page, await nudge(page, [0, -7.5, 4], TOP, 3));
  await expect(reading).toHaveText("16.00 mm");
  await measureAt(page, await nudge(page, [0, 7.5, 4], TOP, 3));
  expect(await objects(page)).toEqual(["edge", "edge"]);
  await expect(reading).toHaveText("15.00 mm");
  await expect(keep).toBeEnabled();
  await page.screenshot({ path: `${evidence}/measure-edge-edge.png` });

  // Square edges give an angle, shown but not kept.
  await measureAt(page, await nudge(page, [0, -7.5, 4], TOP, 3));
  await measureAt(page, await nudge(page, [-10, 0, 4], TOP, 3));
  expect(await objects(page)).toEqual(["edge", "edge"]);
  await expect(reading).toHaveText("90.00° · Cannot keep");
  await expect(keep).toBeDisabled();

  // An edge lying along the front face's normal: an angle again.
  await measureAt(page, await nudge(page, [-10, 0, 4], TOP, 3));
  await measureAt(page, await screenOf(page, [0, -7.5, 0]));
  expect(await objects(page)).toEqual(["edge", "face"]);
  await expect(reading).toHaveText("90.00° · Cannot keep");

  // An edge against the bottom face it is parallel to: their gap.
  await measureAt(page, await nudge(page, [0, -7.5, 4], TOP, 3));
  await page.locator('.orient-face[data-view="0,-1,0"]').dispatchEvent("click");
  await measureAt(page, await screenOf(page, [5, 3, -4]));
  expect(await objects(page)).toEqual(["edge", "face"]);
  await expect(reading).toHaveText("8.00 mm");
  await expect(keep).toBeEnabled();

  // A curved face is still refused, never given a number.
  await page.locator("#home-view").click();
  await measureAt(page, await nudge(page, [0, -7.5, 4], TOP, 3));
  await page.locator('[data-view="0,1,1"]').dispatchEvent("click");
  await measureAt(page, await screenOf(page, [0, 2.49, 1]));
  await expect(page.locator("#toast")).toHaveText(
    "This pair cannot be compared. Use corners, straight edges or flat faces.",
  );
  await expect(keep).toBeDisabled();
});

test.describe("phone hint", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  test("a first-use hint hidden behind the section controls is not counted as seen", async ({
    page,
  }) => {
    await open(page, "tests/fixtures/plate.step");
    const seen = () =>
      page.evaluate(() =>
        localStorage.getItem("meshcue.settings.hint.measure"),
      );
    const hint = page.locator(".tool-hint-box");
    await clickControl(page, '[data-mode="measure"]');
    await page.locator("#measure-advanced summary").click();
    await clickControl(page, "#section-toggle");
    await expect(hint).toBeHidden();
    // Ask for the hints again while Section still covers this one.
    await page.locator("#settings-button").click();
    await page.locator("#reset-tool-hints").click();
    await page.locator("#close-settings").click();
    await expect(hint).toBeHidden();
    expect(await seen()).not.toBe("true");
    await page.screenshot({ path: `${evidence}/hint-covered.png` });
    // Seen once it is actually on screen.
    await page.locator("#section-off").click();
    await expect(hint).toBeVisible();
    await expect.poll(seen).toBe("true");
  });
});

test("Fit to window and Home use different icons", async ({ page }) => {
  await open(page);
  await page.locator("#view-menu-button").click();
  const icon = (command) =>
    page
      .locator(`#view-menu [data-command="${command}"] use`)
      .getAttribute("href");
  const fit = await icon("navigation-fit"),
    home = await icon("home");
  expect(home).toBe("#mc-home");
  expect(fit).not.toBe(home);
  // The icon it names is drawn from the bundle's own sprite, not left blank.
  const drawn = await page
    .locator('#view-menu [data-command="navigation-fit"] use')
    .evaluate((use) => use.getBBox().width);
  expect(drawn).toBeGreaterThan(10);
  await page.screenshot({ path: `${evidence}/view-menu-icons.png` });
});
