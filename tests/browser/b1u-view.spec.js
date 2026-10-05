import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";

const evidence = "tmp/b1u-v/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const nav = (page) => page.evaluate(() => window.__navigationDiagnostics());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settled = (page) =>
  expect.poll(async () => (await nav(page)).animating).toBe(false);
async function open(page, fixture = "tests/fixtures/plate.step") {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST,
    runRoot: "tmp/b1u-v/scenarios",
  });
  await scenarioKit(page, environment).open(environment.url);
  await settled(page);
}
async function probes(page) {
  return page.evaluate(() => {
    const r = document.querySelector("#viewer canvas").getBoundingClientRect();
    const found = new Map();
    for (let y = r.top + 100; y < r.bottom - 200; y += 8)
      for (let x = r.left + 310; x < r.right - 80; x += 8) {
        const pick = window.__navigationDiagnostics(x, y).pick;
        if (!pick) continue;
        const key = `${pick.meshId}:${pick.range?.[0] ?? pick.seed}`;
        if (!found.has(key)) found.set(key, { x, y, ...pick });
      }
    return [...found.values()];
  });
}
async function shot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.B1U_VIEW_EVIDENCE || "after"}.png`,
  });
}
test("STEP hover follows whole planar and rounded B-rep faces", async ({
  page,
}) => {
  await open(page);
  const points = await probes(page);
  fs.writeFileSync(
    `${evidence}/face-probes.json`,
    JSON.stringify(points, null, 2),
  );
  expect(points.length).toBeGreaterThan(2);
  // plate.step has four radius-2 rounded corners and a cylindrical hole.
  // Save both views before assertions so the red run captures the old strips.
  const plane = points.find((p) => p.range[0] === 2);
  const fillet = points.find((p) => p.range[0] === 218);
  expect(plane).toBeTruthy();
  expect(fillet).toBeTruthy();
  for (const [name, p] of [
    ["plane", plane],
    ["fillet", fillet],
  ]) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(100);
    await shot(page, `hover-${name}`);
  }
  for (const p of points) {
    await page.mouse.move(p.x, p.y);
    await expect
      .poll(async () => (await nav(page)).hoverFaces)
      .toBe(p.range[1] - p.range[0] + 1);
  }
});
