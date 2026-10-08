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

test("A: reuse activates the identical page without obsolete notices on publication, switching or reload", async ({
  page,
}) => {
  await open(page);
  const first = (await environment.ipc("/status")).active;
  const second = await publish("tmp/samples/bunny-figurine.glb", "v2");
  await expect(
    page.locator(`[data-version-id="${second.model.id}"]`),
  ).toHaveAttribute("aria-selected", "true");
  await publish("tmp/samples/parametric-bracket.glb", "v3");
  await expect(page.locator(`[data-version-id="${first.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await shot(page, "A-reuse");
  const notice = page.locator("#reuse-notice");
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await page.waitForTimeout(2500);
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await page.locator(`[data-version-id="${second.model.id}"]`).click();
  await expect(
    page.locator(`[data-version-id="${second.model.id}"]`),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator(`[data-version-id="${first.id}"]`).click();
  await expect(page.locator(`[data-version-id="${first.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  // Repeated same-content publications activate the existing page rather
  // than adding a tab or restoring the removed reviewer notice (r6 §3).
  await publish("tmp/samples/parametric-bracket.glb", "v4");
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await expect(page.locator(`[data-version-id="${first.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await page.locator(`[data-version-id="${second.model.id}"]`).click();
  await expect(
    page.locator(`[data-version-id="${second.model.id}"]`),
  ).toHaveAttribute("aria-selected", "true");
  await publish("tmp/samples/parametric-bracket.glb", "v5");
  await expect(page.locator(`[data-version-id="${first.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
  await expect(page.locator(`[data-version-id="${first.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await environment.ipc("/activate", { versionId: second.model.id });
  await expect(
    page.locator(`[data-version-id="${second.model.id}"]`),
  ).toHaveAttribute("aria-selected", "true");
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".version-tab")).toHaveCount(2);
});
