import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import fs from "node:fs";
import path from "node:path";

const evidence = "tmp/b1-followups/evidence";
let environment;
test.afterEach(async () => environment?.stop());
async function open(page, fixture = "tmp/samples/parametric-bracket.glb") {
  fs.mkdirSync(evidence, { recursive: true });
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST,
  });
  await page.goto(environment.url);
  await expect(page.locator("#loading")).toBeHidden();
}
async function publish(file, version, extra = {}) {
  fs.copyFileSync(file, path.join(environment.workspace, path.basename(file)));
  return environment.ipc("/publish", {
    file: path.basename(file),
    version,
    ...extra,
  });
}
async function shot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.FOLLOWUP_EVIDENCE || "green"}.png`,
  });
}

import { primitiveGlb, mixedPrimitives } from "../fixtures/primitive-glb.mjs";
for (const viewport of [
  { width: 390, height: 664 },
  { width: 1024, height: 768 },
]) {
  test(`B: skipped primitives follow their version through reload at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    fs.mkdirSync(evidence, { recursive: true });
    const fixture = `${evidence}/mixed.glb`;
    fs.writeFileSync(fixture, primitiveGlb(mixedPrimitives));
    await open(page, fixture);
    const first = (await environment.ipc("/status")).active;
    const notice = page.locator("#skipped-notice");
    await shot(page, `B-${viewport.width}`);
    await expect(notice).toHaveText(
      "4 line/point elements are not shown; only surfaces can be reviewed.",
    );
    await page.reload();
    await expect(page.locator("#loading")).toBeHidden();
    await expect(notice).toBeVisible();
    const second = await publish("tmp/samples/parametric-bracket.glb", "plain");
    await expect(
      page.locator(`[data-version-id="${second.model.id}"]`),
    ).toHaveAttribute("aria-selected", "true");
    await expect(notice).toBeHidden();
    await page.locator(`[data-version-id="${first.id}"]`).click();
    await expect(notice).toBeVisible();
    // The notice has its own row so it cannot take pointer targets away from
    // the toolbar, navigation cube or marks, including on the narrow phone.
    const overlaps = await notice.evaluate((el) => {
      const a = el.getBoundingClientRect();
      return [".toolbar", ".orient", ".annotations-panel"].filter(
        (selector) => {
          const target = document.querySelector(selector);
          if (!target) throw new Error(`Missing layout target ${selector}`);
          const b = target.getBoundingClientRect();
          return (
            a.left < b.right &&
            b.left < a.right &&
            a.top < b.bottom &&
            b.top < a.bottom
          );
        },
      );
    });
    expect(overlaps).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await shot(page, `B-return-${viewport.width}`);
  });
}
