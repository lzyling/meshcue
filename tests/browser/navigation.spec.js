import { test, expect } from "./fixtures.mjs";
import { expectCameraUnchanged } from "./camera-assertions.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import * as THREE from "three";
import fs from "node:fs";

let environment;
const evidence = "tmp/b1-n/evidence";
test.beforeEach(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const geometry = new THREE.BoxGeometry(20, 16, 10).toNonIndexed();
  const positions = geometry.attributes.position;
  let stl = "solid navigation\n";
  for (let i = 0; i < positions.count; i += 3) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (let j = 0; j < 3; j++)
      stl += `vertex ${positions.getX(i + j)} ${positions.getY(i + j)} ${positions.getZ(i + j)}\n`;
    stl += "endloop\nendfacet\n";
  }
  fs.writeFileSync("tmp/b1-n/navigation.stl", stl + "endsolid navigation\n");
  environment = await startScenario({
    fixture: "tmp/b1-n/navigation.stl",
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
  });
});
test.afterEach(async () => environment?.stop());
const state = (page) =>
  page.evaluate(() => ({
    ...window.__reviewDiagnostics(),
    navigation: window.__navigationDiagnostics(),
  }));
const settled = (page) =>
  expect.poll(async () => (await state(page)).navigation.animating).toBe(false);
const direction = (data) =>
  new THREE.Vector3()
    .fromArray(data.camera.position)
    .sub(new THREE.Vector3().fromArray(data.camera.target))
    .normalize();
async function open(page) {
  await scenarioKit(page, environment).open(environment.url);
  await settled(page);
  return page.locator("#viewer canvas").boundingBox();
}
async function front(page) {
  await page.keyboard.press("Shift+1");
  await settled(page);
}
async function project(page, world) {
  const data = await state(page),
    rect = await page.locator("#viewer canvas").boundingBox();
  const height = data.navigation.visibleHeight,
    aspect = rect.width / rect.height;
  const camera =
    data.navigation.projection === "orthographic"
      ? new THREE.OrthographicCamera(
          (-height * aspect) / 2,
          (height * aspect) / 2,
          height / 2,
          -height / 2,
          0.00001,
          1000,
        )
      : new THREE.PerspectiveCamera(38, aspect, 0.00001, 1000);
  camera.position.fromArray(data.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(data.camera.target));
  camera.updateMatrixWorld();
  const p = new THREE.Vector3().fromArray(world).project(camera);
  return {
    x: rect.x + ((p.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - p.y) * rect.height) / 2,
  };
}

test("navigation wheel and trackpad pinch keep the surface point within three pixels in both projections", async ({
  page,
}) => {
  await open(page);
  await front(page);
  for (const projection of ["perspective", "orthographic"]) {
    if (projection === "orthographic")
      await page.locator("#navigation-projection").click();
    for (const pinch of [false, true]) {
      const world = [0.45, 0.2, 1.2],
        before = await project(page, world);
      await page.mouse.move(before.x, before.y);
      if (pinch) await page.keyboard.down("Control");
      await page.mouse.wheel(0, -80);
      if (pinch) await page.keyboard.up("Control");
      await page.waitForTimeout(80);
      const after = await project(page, world);
      expect(
        Math.hypot(after.x - before.x, after.y - before.y),
      ).toBeLessThanOrEqual(3);
    }
  }
});

test("navigation double click moves the pivot without changing distance and empty space fits all", async ({
  page,
}) => {
  const box = await open(page);
  await front(page);
  const point = await project(page, [0.4, 0.2, 1.2]);
  const before = await state(page);
  await page.mouse.dblclick(point.x, point.y);
  await settled(page);
  const after = await state(page);
  for (const [i, value] of [0.4, 0.2, 1.2].entries())
    expect(after.camera.target[i]).toBeCloseTo(value, 2);
  const distance = (data) =>
    new THREE.Vector3()
      .fromArray(data.camera.position)
      .distanceTo(new THREE.Vector3().fromArray(data.camera.target));
  expect(distance(after)).toBeCloseTo(distance(before), 7);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(point.x + 35, point.y + 10, { steps: 4 });
  await expect(page.locator(".navigation-pivot")).toBeVisible();
  await page.screenshot({ path: `${evidence}/pivot.png` });
  await page.mouse.up({ button: "right" });
  await expect(page.locator(".navigation-pivot")).toBeHidden();
  await page.mouse.dblclick(box.x + 15, box.y + box.height / 2);
  await settled(page);
  expect((await state(page)).camera.target).toEqual([0, 0, 0]);
  for (const corner of (await state(page)).navigation.bounds)
    expect(Math.max(Math.abs(corner[0]), Math.abs(corner[1]))).toBeLessThan(1);
});

test("navigation orthographic choice persists and saved marks retain model-space framing and click position", async ({
  page,
}) => {
  await open(page);
  await front(page);
  await page.mouse.move(10, 10);
  await page.screenshot({ path: `${evidence}/perspective-front.png` });
  await page.locator("#navigation-projection").click();
  await expect(page.locator("#navigation-projection")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({ path: `${evidence}/orthographic-front.png` });
  const location = await project(page, [0.4, 0.2, 1.2]);
  await page.locator('[data-mode="label"]').click();
  await page.mouse.click(location.x, location.y);
  await expect.poll(async () => (await state(page)).annotationCount).toBe(1);
  await expect.poll(async () => (await state(page)).dirty).toBe(false);
  const mark = (await state(page)).annotations[0];
  expect(mark.view.projection).toBe("orthographic");
  expect(mark.view.visibleHeight).toBeGreaterThan(0);
  for (const [i, value] of [0.4 / 0.15, -8, 0.2 / 0.15].entries())
    expect(mark.position[i]).toBeCloseTo(value, 2);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await state(page)).navigation.projection)
    .toBe("orthographic");
  expect((await state(page)).annotations[0].view).toEqual(mark.view);
  // A later display choice must win over the projection saved with this draft.
  await page.locator("#navigation-projection").click();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await state(page)).navigation.projection)
    .toBe("perspective");
  expect((await state(page)).annotations[0].view).toEqual(mark.view);
});

test("navigation seven standard shortcuts match cube directions and F fits without changing direction", async ({
  page,
}) => {
  await open(page);
  const directions = [
    [0, 0, 1],
    [0, 0, -1],
    [-1, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [4, 2.8, 5],
  ];
  for (const [i, expected] of directions.entries()) {
    await page.keyboard.press(`Shift+${i + 1}`);
    await settled(page);
    expect(
      direction(await state(page)).dot(
        new THREE.Vector3(...expected).normalize(),
      ),
    ).toBeGreaterThan(0.9999);
  }
  await page.keyboard.press("Shift+z");
  const before = direction(await state(page));
  await page.keyboard.press("f");
  await settled(page);
  expect(direction(await state(page)).dot(before)).toBeCloseTo(1, 7);
  for (const corner of (await state(page)).navigation.bounds)
    expect(Math.max(Math.abs(corner[0]), Math.abs(corner[1]))).toBeLessThan(1);
  await page.screenshot({ path: `${evidence}/cube.png` });
});

test("navigation normal-to-face reverses on repeat and reports empty space", async ({
  page,
}) => {
  const box = await open(page);
  const point = await project(page, [0, 0, 1.2]);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.press("n");
  await settled(page);
  const first = direction(await state(page));
  expect(Math.abs(first.z)).toBeGreaterThan(0.999);
  await page.keyboard.press("n");
  await settled(page);
  expect(direction(await state(page)).dot(first)).toBeLessThan(-0.999);
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.keyboard.press("n");
  await expect(page.locator("#tool-hint")).toHaveText(
    "No face under the pointer",
  );
});

test("navigation shortcuts respect typing and modal dialogs, and shortcut sheet lists registered commands", async ({
  page,
}) => {
  await open(page);
  await page.locator("#section-toggle").click();
  await page.locator("#section-offset").focus();
  const before = (await state(page)).camera;
  await page.keyboard.press("Shift+1");
  await page.keyboard.press("f");
  expectCameraUnchanged((await state(page)).camera, before);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Shift+/");
  await expect(page.locator("#navigation-shortcuts")).toBeVisible();
  await expect(page.locator("#navigation-shortcuts")).toContainText("Ctrl/⌘+Z");
  await expect(page.locator("#navigation-shortcuts")).toContainText("Shift+7");
  await page.keyboard.press("Shift+1");
  expectCameraUnchanged((await state(page)).camera, before);
  await page.screenshot({ path: `${evidence}/shortcuts.png` });
  await page.keyboard.press("Escape");
  await expect(page.locator("#navigation-shortcuts")).toBeHidden();
});

test("navigation reduced motion is instant, input cancels animation, and released drags have no damping drift", async ({
  page,
}) => {
  const box = await open(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Shift+2");
  expect((await state(page)).navigation.animating).toBe(false);
  expect(direction(await state(page)).z).toBeLessThan(-0.999);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Shift+1");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await state(page)).navigation.animating).toBe(false);
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 25,
    { steps: 5 },
  );
  await page.mouse.up();
  // Let the released pointer and its final render settle before taking the
  // no-drift snapshot; compare with the same round-off tolerance used for
  // other stationary views because normalization also runs on later frames.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const after = (await state(page)).camera;
  await page.waitForTimeout(400);
  expectCameraUnchanged((await state(page)).camera, after);
  expect((await state(page)).navigation.damping).toBe(false);
});

test("navigation left drag preserves marking modes and Orbit touch taps place no marks", async ({
  page,
}) => {
  const box = await open(page);
  for (const mode of ["label", "fill", "measure"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    const before = (await state(page)).camera;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 70,
      box.y + box.height / 2 + 25,
      { steps: 4 },
    );
    await page.mouse.up();
    expectCameraUnchanged((await state(page)).camera, before);
    expect((await state(page)).annotationCount).toBe(0);
  }
  await page.locator('[data-mode="orbit"]').click();
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
  expect((await state(page)).annotationCount).toBe(0);
});

test("navigation hover highlights one connected face and disappears during a drag", async ({
  page,
}) => {
  await open(page);
  await front(page);
  const point = await project(page, [0.4, 0.2, 1.2]);
  await page.mouse.move(point.x, point.y);
  await expect
    .poll(async () => (await state(page)).navigation.hoverFaces)
    .toBe(2);
  await page.screenshot({ path: `${evidence}/hover.png` });
  await page.mouse.down();
  await expect
    .poll(async () => (await state(page)).navigation.hoverFaces)
    .toBe(0);
  await page.mouse.up();
});

test("navigation orthographic measuring and section caps use parallel picking rays", async ({
  page,
}) => {
  await open(page);
  await front(page);
  await page.locator("#navigation-projection").click();
  await page.locator('[data-mode="measure"]').click();
  for (const world of [
    [-0.6, 0, 1.2],
    [0.6, 0, 1.2],
  ]) {
    const p = await project(page, world);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator("#keep-measure")).toBeEnabled();
  await expect(page.locator("#measure-reading")).toContainText("8");
  await page.locator("#keep-measure").click();
  await expect.poll(async () => (await state(page)).annotationCount).toBe(1);
  await page.locator("#section-toggle").click();
  await page.locator("#section-axis").selectOption("y");
  await page.locator("#section-flip").click();
  await page.locator('[data-mode="orbit"]').click();
  const cap = await project(page, [0, 0, 0]);
  await page.mouse.move(cap.x, cap.y);
  await expect
    .poll(async () => (await state(page)).navigation.hoverFaces)
    .toBe(0);
  await page.locator('[data-mode="label"]').click();
  await page.mouse.click(cap.x, cap.y);
  await page.waitForTimeout(150);
  expect((await state(page)).annotationCount).toBe(1);
  await page.locator("#section-flip").click();
  await page.mouse.click(cap.x, cap.y);
  await expect.poll(async () => (await state(page)).annotationCount).toBe(2);
  await expect.poll(async () => (await state(page)).dirty).toBe(false);
});

test("navigation cube drags and arrows turn without roll and the triad follows STL and GLB file axes", async ({
  page,
}) => {
  await open(page);
  await front(page);
  const labels = async () =>
    page
      .locator(".navigation-triad text")
      .evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((node) => [
            node.textContent,
            [Number(node.getAttribute("x")), Number(node.getAttribute("y"))],
          ]),
        ),
      );
  let axes = await labels();
  expect(axes.X[0]).toBeCloseTo(80, 2);
  expect(axes.Z[1]).toBeCloseTo(14, 2);
  expect(axes.Y[1]).toBeCloseTo(49, 2);
  await page.locator(".navigation-arrow-up").click();
  await settled(page);
  expect(direction(await state(page)).y).toBeGreaterThan(0.9999);
  await front(page);
  const cube = await page.locator(".orient-stage").boundingBox();
  await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    cube.x + cube.width / 2 + 35,
    cube.y + cube.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(Math.abs(direction(await state(page)).x)).toBeGreaterThan(0.1);
  expect((await state(page)).cameraUp).toEqual([0, 1, 0]);
  expect((await state(page)).navigation.animating).toBe(false);
  await environment.stop();
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
  });
  await open(page);
  await front(page);
  axes = await labels();
  expect(axes.Y[1]).toBeCloseTo(14, 2);
  expect(axes.Z[1]).toBeCloseTo(49, 2);
  await page.screenshot({ path: `${evidence}/cube-glb.png` });
});
