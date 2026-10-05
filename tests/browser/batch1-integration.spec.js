import { clickControl, showParts } from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import fs from "node:fs";

const evidence = "tmp/b1-integration/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settle = (page) =>
  expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
const row = (page, name) =>
  page
    .locator(".parts-row")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
async function open(page, fixture) {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST,
  });
  await page.goto(environment.url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await diag(page)).viewer.meshes)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await diag(page)).viewer.display.pending)
    .toBe(false);
  await showParts(page);
  await settle(page);
}
async function style(page, name) {
  await clickControl(page, "#display-toggle");
  await page.locator(`[data-style="${name}"]`).click();
  expect((await diag(page)).viewer.display.style).toBe(name);
}
async function fixture() {
  fs.mkdirSync(evidence, { recursive: true });
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((data) => {
        this.result = data;
        this.onloadend?.();
      });
    }
  };
  const root = new THREE.Group();
  root.name = "Assembly";
  for (const [name, x, z] of [
    ["Front", 0, 2],
    ["Back", 0, -2],
    ["Side", 6, 0],
  ]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x719bb2 }),
    );
    mesh.name = name;
    mesh.position.set(x, 0, z);
    root.add(mesh);
  }
  const file = `${evidence}/assembly.glb`;
  fs.writeFileSync(
    file,
    Buffer.from(await new GLTFExporter().parseAsync(root, { binary: true })),
  );
  return file;
}
async function capPixels(page) {
  const image = await page.locator("#viewer canvas").screenshot();
  return page.evaluate(
    async ({ base64, color }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const rgb = color.match(/[a-f0-9]{2}/gi).map((c) => parseInt(c, 16));
      let count = 0;
      for (
        let i = Math.ceil(canvas.height * 0.2) * canvas.width * 4;
        i < Math.floor(canvas.height * 0.8) * canvas.width * 4;
        i += 4
      )
        if ([0, 1, 2].every((c) => Math.abs(bytes[i + c] - rgb[c]) <= 3)) {
          // Source surfaces now share the cap hue. Require nearby hatch ink too,
          // otherwise a lit grey edge can coincidentally equal the fill colour.
          const stripes = [];
          let previous = false;
          for (let dx = -12; dx <= 12; dx++) {
            const at = i + dx * 4;
            const ink = [0, 1, 2].every(
              (c) =>
                bytes[at + c] < rgb[c] * 0.8 && bytes[at + c] > rgb[c] * 0.55,
            );
            if (ink && !previous) stripes.push(dx);
            previous = ink;
          }
          const pitch = (stripes.at(-1) - stripes[0]) / (stripes.length - 1);
          if (stripes.length >= 2 && pitch >= 10 && pitch <= 12.5) count++;
        }
      return count;
    },
    {
      base64: image.toString("base64"),
      color: (await diag(page)).viewer.sectionColor,
    },
  );
}

test("integrated part double-click and Fit all share visible framing in both projections, and X-ray preserves picking behind transparent parts", async ({
  page,
}) => {
  await open(page, await fixture());
  for (const orthographic of [false, true]) {
    if (orthographic) await clickControl(page, "#navigation-projection");
    await row(page, "Side").locator(".parts-name").dblclick();
    await settle(page);
    const part = (await diag(page)).camera;
    await page.locator('[data-command="parts-isolate"]').click();
    await page.keyboard.press("f");
    await settle(page);
    const fitted = (await diag(page)).camera;
    for (let i = 0; i < 3; i++) {
      expect(fitted.target[i]).toBeCloseTo(part.target[i], 8);
      expect(fitted.position[i]).toBeCloseTo(part.position[i], 8);
    }
    if (orthographic)
      expect(fitted.visibleHeight).toBeCloseTo(part.visibleHeight, 8);
    expect((await diag(page)).viewer.display.segments).toBe(12);
    await page.screenshot({
      path: `${evidence}/fit-visible-${orthographic ? "orthographic" : "perspective"}.png`,
    });
    await page.keyboard.press("Shift+Y");
    await page.keyboard.press("f");
    await settle(page);
    expect((await diag(page)).camera.target).not.toEqual(part.target);
  }
  await page.keyboard.press("Shift+1");
  await settle(page);
  await row(page, "Front").locator(".parts-name").dblclick();
  await settle(page);
  await page.keyboard.press("Shift+T");
  await style(page, "xray");
  await clickControl(page, "#neutral-view");
  await clickControl(page, '[data-mode="label"]');
  const box = await page.locator("#viewer canvas").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  expect((await diag(page)).annotations[0].meshId).toBe("mesh-1");
  await page.screenshot({
    path: `${evidence}/orthographic-xray-transparent-label.png`,
  });
});

test("orthographic display styles retain section caps and performance readout while hidden parts remove caps and edges", async ({
  page,
}) => {
  await open(page, "tests/fixtures/plate.step");
  await clickControl(page, "#navigation-projection");
  await clickControl(page, "#section-toggle");
  await page.locator("#section-axis").selectOption("z");
  await clickControl(page, "#perf-toggle");
  const observations = [];
  for (const name of ["edges", "hidden", "wireframe", "xray", "shaded"]) {
    await style(page, name);
    await page.mouse.move(5, 5);
    await expect(page.locator("#perf-panel pre")).toContainText(
      "Section view: On",
    );
    const pixels = await capPixels(page);
    expect(pixels).toBeGreaterThan(100);
    const state = (await diag(page)).viewer;
    expect(state.display.clipped).toBe(true);
    expect(state.performance.snapshot.section).toBe(true);
    expect(state.performance.snapshot.calls).toBeGreaterThan(0);
    observations.push({
      style: name,
      capPixels: pixels,
      performance: state.performance.snapshot,
    });
    await page.screenshot({
      path: `${evidence}/orthographic-section-${name}.png`,
    });
  }
  await style(page, "edges");
  await showParts(page);
  await page.locator(".parts-name").first().click();
  await page.keyboard.press("y");
  await page.mouse.move(5, 5);
  expect((await diag(page)).viewer.display.segments).toBe(0);
  expect(await capPixels(page)).toBeLessThan(10);
  await page.screenshot({
    path: `${evidence}/orthographic-hidden-section.png`,
  });
  // Both navigation controls and the optional report must remain reachable
  // after the two lanes expand their corner UI, including on a phone.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(async () => {
        const panel = await page.locator("#perf-panel").boundingBox();
        const disjoint = (box) =>
          panel.y >= box.y + box.height ||
          panel.y + panel.height <= box.y ||
          panel.x + panel.width <= box.x ||
          box.x + box.width <= panel.x;
        return (
          disjoint(await page.locator(".orient").boundingBox()) &&
          disjoint(await page.locator("#section-options").boundingBox()) &&
          disjoint(await page.locator(".toolbar").boundingBox())
        );
      })
      .toBe(true);
    await page.screenshot({
      path: `${evidence}/performance-navigation-${width}.png`,
    });
  }
  fs.writeFileSync(
    `${evidence}/orthographic-performance.json`,
    JSON.stringify(observations, null, 2),
  );
});
