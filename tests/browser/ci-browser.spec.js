import { clickControl } from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";

let environment;
const evidence = "tmp/b1-ci-browser/evidence";
test.beforeEach(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture: "tmp/samples/parametric-bracket.glb",
    dist: process.env.REVIEW_TEST_DIST || "tmp/refinement-dist",
  });
});
test.afterEach(async () => environment?.stop());

test("performance retains input across slow frames under CPU throttling", async ({
  page,
}) => {
  await scenarioKit(page, environment).open(environment.url);
  await clickControl(page, "#perf-toggle");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    await page.evaluate(() => {
      window.slowInputSamples = [];
      const canvas = document.querySelector("#viewer canvas");
      // CPU throttling alone cannot guarantee a >300 ms frame on every host.
      // Stall after the real pointer/controls listeners, before the next render,
      // to reproduce the expired activity deadline deterministically as well.
      canvas.addEventListener("pointermove", () => {
        const start = performance.now();
        while (performance.now() - start < 350) {
          /* busy main thread */
        }
        requestAnimationFrame(() => {
          window.slowInputSamples.push({
            elapsed: performance.now() - start,
            ...window.__reviewDiagnostics().viewer.performance.snapshot,
          });
        });
      });
    });
    const box = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
      steps: 5,
    });
    await page.mouse.up({ button: "right" });
    await expect
      .poll(() => page.evaluate(() => window.slowInputSamples.length))
      .toBeGreaterThanOrEqual(6);
    const samples = await page.evaluate(() => window.slowInputSamples);
    fs.writeFileSync(
      `${evidence}/slow-input-samples.json`,
      JSON.stringify(samples, null, 2),
    );
    for (const sample of samples) {
      expect(sample.elapsed).toBeGreaterThan(300);
      expect(sample.idle).toBe(false);
    }
    expect(
      samples.some((sample) => sample.fps > 0 && sample.worstMs > 300),
    ).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__reviewDiagnostics().viewer.performance.snapshot.idle,
        ),
      )
      .toBe(true);
    await page.screenshot({ path: `${evidence}/performance-idle.png` });
    await clickControl(page, "#perf-toggle");
    const off = await page.evaluate(
      () => window.__reviewDiagnostics().viewer.performance.sampledFrames,
    );
    await page.mouse.move(box.x + 20, box.y + 20);
    expect(
      await page.evaluate(
        () => window.__reviewDiagnostics().viewer.performance.sampledFrames,
      ),
    ).toBe(off);
  } finally {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await session.detach();
  }
});
