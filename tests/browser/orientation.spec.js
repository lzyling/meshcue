import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import { clickControl } from "./b1u-shell-helpers.mjs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import fs from "node:fs";
import path from "node:path";

let environment;
test.afterEach(async () => environment?.stop());
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settled = (page) =>
  expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);

test("Z-up GLB/STL agree at Top; Y-up opt-in restores the old GLB drawing and preserves raw marks", async ({
  page,
}) => {
  const dir = fs.mkdtempSync(path.resolve("tmp/orientation-browser-"));
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((data) => {
        this.result = data;
        this.onloadend?.();
      });
    }
  };
  const z = new THREE.Mesh(
    new THREE.BoxGeometry(20, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0xaab2bb }),
  );
  z.updateMatrixWorld(true);
  const zFile = path.join(dir, "z.glb"),
    stlFile = path.join(dir, "z.stl"),
    yFile = path.join(dir, "y.glb");
  fs.writeFileSync(
    zFile,
    Buffer.from(await new GLTFExporter().parseAsync(z, { binary: true })),
  );
  fs.writeFileSync(stlFile, new STLExporter().parse(z));
  const y = z.clone();
  y.rotation.x = -Math.PI / 2;
  y.updateMatrixWorld(true);
  fs.writeFileSync(
    yFile,
    Buffer.from(await new GLTFExporter().parseAsync(y, { binary: true })),
  );
  environment = await startScenario({
    fixture: zFile,
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
  });
  for (const file of [stlFile, yFile])
    fs.copyFileSync(
      file,
      path.join(environment.workspace, path.basename(file)),
    );
  await scenarioKit(page, environment).open(environment.url);
  const frames = [];
  let oldYUpMark;
  for (const [file, up] of [
    ["z.glb", "z"],
    ["z.stl", "z"],
    ["y.glb", "y"],
  ]) {
    const publication =
      file === "z.glb"
        ? { model: (await environment.ipc("/status")).active }
        : await environment.ipc("/publish", {
            file,
            up,
            name: "Scenario fixture",
            version: "fixture",
          });
    await expect
      .poll(async () => (await diagnostics(page)).versionId)
      .toBe(publication.model.id);
    await clickControl(page, '[data-mode="orbit"]'); // identical toolbar safe area
    await page.locator('.orient-face[data-view="0,1,0"]').press("Enter"); // Top, canonical +Z
    await settled(page);
    await page.getByRole("button", { name: "Fit all", exact: true }).click(); // explicit Fit after layout changes
    await settled(page);
    const d = await diagnostics(page);
    const direction = new THREE.Vector3()
      .fromArray(d.camera.position)
      .sub(new THREE.Vector3().fromArray(d.camera.target))
      .normalize();
    expect(direction.y).toBeGreaterThan(0.9999);
    expect(d.viewer.extent).toEqual([3, 1.5, 2.4]);
    frames.push({
      direction: direction.toArray(),
      up: d.screenUp,
      extent: d.viewer.extent,
    });
    await clickControl(page, "#section-toggle");
    await page.locator("#section-axis").selectOption("z");
    const section = (await diagnostics(page)).viewer.section;
    expect(section.max - section.min).toBeCloseTo(10, 5);
    await page.locator("#section-off").click();
    await page.locator('.orient-face[data-view="0,0,1"]').press("Enter");
    await settled(page);
    const label = page.locator('[data-mode="label"]');
    if (!(await label.evaluate((el) => el.classList.contains("active"))))
      await clickControl(page, '[data-mode="label"]');
    await expect(label).toHaveClass(/active/);
    const box = await page.locator("#viewer canvas").boundingBox();
    const now = await diagnostics(page);
    const camera = new THREE.PerspectiveCamera(
      38,
      box.width / box.height,
      0.01,
      100,
    );
    camera.position.fromArray(now.camera.position);
    camera.up.fromArray(now.screenUp);
    camera.lookAt(new THREE.Vector3().fromArray(now.camera.target));
    camera.updateMatrixWorld();
    const point = new THREE.Vector3(0.45, 0.3, 1.2).project(camera); // file Z-up (3,-8,2)
    await page.mouse.click(
      box.x + ((point.x + 1) * box.width) / 2,
      box.y + ((1 - point.y) * box.height) / 2,
    );
    await expect
      .poll(async () => (await diagnostics(page)).annotationCount)
      .toBe(1);
    const mark = (await diagnostics(page)).annotations[0];
    // glTF node rotation remains part of the file frame, not the preview root.
    expect(mark.position[0]).toBeCloseTo(3, 3);
    expect(mark.position[1]).toBeCloseTo(-8, 3);
    expect(mark.position[2]).toBeCloseTo(2, 3);
    expect(mark.view.up).toEqual(up === "y" ? [0, 1, 0] : [0, 0, 1]);
    expect(mark.view.space).toBe("model");
    if (up === "y") oldYUpMark = mark;
  }
  // The very same Y-up GLB bytes: up:y is the old identity-root drawing;
  // the new default rotates root. Pick the same original mesh point from Top
  // in the new default and prove its serialized file/mesh numbers did not turn.
  const changed = await environment.ipc("/publish", { file: "y.glb", up: "z" });
  await expect
    .poll(async () => (await diagnostics(page)).versionId)
    .toBe(changed.model.id);
  await clickControl(page, '[data-mode="orbit"]');
  await page.locator('.orient-face[data-view="0,1,0"]').press("Enter");
  await settled(page);
  await clickControl(page, '[data-mode="label"]');
  const box = await page.locator("#viewer canvas").boundingBox();
  const now = await diagnostics(page);
  const camera = new THREE.PerspectiveCamera(
    38,
    box.width / box.height,
    0.01,
    100,
  );
  camera.position.fromArray(now.camera.position);
  camera.up.fromArray(now.screenUp);
  camera.lookAt(new THREE.Vector3().fromArray(now.camera.target));
  camera.updateMatrixWorld();
  const samePoint = new THREE.Vector3(0.45, 1.2, -0.3).project(camera);
  await page.mouse.click(
    box.x + ((samePoint.x + 1) * box.width) / 2,
    box.y + ((1 - samePoint.y) * box.height) / 2,
  );
  await expect
    .poll(async () => (await diagnostics(page)).annotationCount)
    .toBe(1);
  const changedMark = (await diagnostics(page)).annotations[0];
  changedMark.position.forEach((n, i) =>
    expect(n).toBeCloseTo(oldYUpMark.position[i], 3),
  );
  expect(changedMark.meshId).toBe(oldYUpMark.meshId);
  expect(changedMark.view.space).toBe("model");
  // Auto-fit distance/target also account for DOM overlays and version tabs;
  // they are not an orientation invariant. Compare the actual settled basis
  // and exact displayed extents instead, alongside the real mark/section checks.
  for (const frame of frames.slice(1)) {
    frame.direction.forEach((n, i) =>
      expect(n).toBeCloseTo(frames[0].direction[i], 8),
    );
    frame.up.forEach((n, i) => expect(n).toBeCloseTo(frames[0].up[i], 8));
    expect(frame.extent).toEqual(frames[0].extent);
  }
});
