import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";

let environment;
test.beforeEach(async () => {
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST || "dist",
  });
});
test.afterEach(async () => environment?.stop());
const draws = (page) =>
  page.evaluate(() => window.__reviewDiagnostics().viewer.renderCount);
async function idle(page) {
  await page.waitForTimeout(500);
  const before = await draws(page);
  await page.waitForTimeout(1100);
  expect(await draws(page)).toBe(before);
}
test("stationary canvas sleeps, mutations wake it, and the performance panel does not spin", async ({
  page,
}) => {
  await scenarioKit(page, environment).open(environment.url);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.display.pending),
    )
    .toBe(false);
  await idle(page);
  const action = async (run) => {
    const before = await draws(page);
    await run();
    await expect.poll(() => draws(page)).toBeGreaterThan(before);
    await idle(page);
  };
  await action(() => page.keyboard.press("Shift+1"));
  await action(() => page.locator("#section-toggle").click());
  await action(() =>
    page.locator('[data-style="shaded"]').evaluate((el) => el.click()),
  );
  expect(
    await page.evaluate(
      () => window.__reviewDiagnostics().viewer.display.style,
    ),
  ).toBe("shaded");
  await action(() => page.setViewportSize({ width: 1300, height: 900 }));
  await page.locator("#settings-button").click();
  // The setting is user-visible, not a test-only viewer handle.
  const performance = page.getByRole("checkbox", { name: /performance/i });
  await performance.check();
  await idle(page);
  await expect(page.locator("#perf-summary")).toContainText(/idle/i);
});

test("pins repaint after placement and settled occlusion matches a fresh precise view", async ({
  page,
}) => {
  const kit = scenarioKit(page, environment);
  await kit.open(environment.url);
  await kit.key("Shift+1");
  await page.locator('[data-mode="label"]').evaluate((el) => el.click());
  const box = await page.locator("#viewer canvas").boundingBox();
  for (let y = -1; y <= 1; y++) {
    for (let x = -2; x <= 2; x++) {
      await page.mouse.click(
        box.x + box.width / 2 + x * 22,
        box.y + box.height / 2 + y * 22,
      );
      await page.waitForTimeout(60);
    }
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBeGreaterThan(1);
  await page.locator('[data-mode="orbit"]').evaluate((el) => el.click());
  await kit.orbit(180, 60, { steps: 30 });
  await idle(page);
  const visibility = () =>
    page
      .locator(".model-pin")
      .evaluateAll((els) => els.map((el) => !el.hidden));
  const settled = await visibility();
  // A no-motion controls end explicitly requests the unthrottled settle pass.
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await idle(page);
  expect(await visibility()).toEqual(settled);
  await page.mouse.down({ button: "right" });
  // Holding a navigation pointer is not movement and must not self-schedule
  // occlusion checks. Drag, then pause without releasing, must also settle.
  await idle(page);
  const beforeDrag = await draws(page);
  await page.mouse.move(box.x + 85, box.y + 45, { steps: 12 });
  await expect.poll(() => draws(page)).toBeGreaterThan(beforeDrag);
  const stopped = await draws(page);
  await page.waitForTimeout(250);
  expect((await draws(page)) - stopped).toBeLessThanOrEqual(3);
  await idle(page);
  const paused = await visibility();
  await page.mouse.up({ button: "right" });
  await idle(page);
  expect(await visibility()).toEqual(paused);
});
