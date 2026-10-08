import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import fs from "node:fs";
import path from "node:path";

let environment;
const evidence = "tmp/b1-decisions/evidence";
test.afterEach(async () => environment?.stop());
async function publish(file, version, extra = {}) {
  fs.copyFileSync(file, path.join(environment.workspace, path.basename(file)));
  return environment.ipc("/publish", {
    file: path.basename(file),
    version,
    ...extra,
  });
}
async function selected(page, id) {
  await expect(page.locator(`[data-version-id="${id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#loading")).toBeHidden();
}
for (const theme of ["light", "dark"]) {
  test(`Reuse: removed notices stay absent through reload, publication and manual browsing (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(100000);
    fs.mkdirSync(evidence, { recursive: true });
    await page.addInitScript(
      (theme) => localStorage.setItem("meshcue-theme", theme),
      theme,
    );
    environment = await startScenario({
      fixture: "tmp/samples/parametric-bracket.glb",
      dist: process.env.REVIEW_TEST_DIST,
      runRoot: "tmp/b1-decisions/scenarios",
    });
    await scenarioKit(page, environment).open(environment.url);
    const first = (await environment.ipc("/status")).active.id;
    const second = (await publish("tmp/samples/no-material-bracket.glb", "v2"))
      .model.id;
    await selected(page, second);
    await publish("tmp/samples/parametric-bracket.glb", "v3");
    await selected(page, first);
    await expect(page.locator("#reuse-notice")).toBeHidden();
    await page.screenshot({
      path: `${evidence}/reuse-${theme}-${process.env.DECISIONS_EVIDENCE || "green"}.png`,
    });
    await expect(page.locator("#pending-banner")).toBeHidden();
    await expect(page.locator("#review-status")).not.toHaveText(
      "Earlier version · you can still mark it",
    );
    await page.reload();
    await selected(page, first);
    await expect(page.locator("#reuse-notice")).toBeHidden();
    await expect(page.locator("#pending-banner")).toBeHidden();
    await page.screenshot({
      path: `${evidence}/reuse-reload-${theme}-green.png`,
    });
    await page.locator(`[data-version-id="${second}"]`).click();
    await selected(page, second);
    await page.locator(`[data-version-id="${first}"]`).click();
    await selected(page, first);
    await expect(page.locator("#pending-banner")).toBeHidden();
    await page.reload();
    await selected(page, first);
    await expect(page.locator("#pending-banner")).toBeHidden();
    await publish("tmp/samples/parametric-bracket.glb", "v4");
    await expect(page.locator("#reuse-notice")).toBeHidden();
    await expect(page.locator("#pending-banner")).toBeHidden();
    // r4 removed the banner; the latest version remains reachable via its tab,
    // while passive delivery and reload preserve the reviewer's selection.
    const third = (
      await publish("tmp/samples/bunny-figurine.glb", "v5", { activate: false })
    ).model.id;
    await expect(page.locator("#pending-banner")).toBeHidden();
    await page.reload();
    await selected(page, first);
    await expect(page.locator("#pending-banner")).toBeHidden();
    await expect(page.locator("#go-latest")).toHaveCount(0);
    await page.locator(`[data-version-id="${third}"]`).click();
    await selected(page, third);
    await expect(page.locator("#pending-banner")).toBeHidden();
    await publish("tmp/samples/parametric-bracket.glb", "v6");
    await selected(page, first);
    await expect(page.locator("#pending-banner")).toBeHidden();
    const fourth = (await publish("tmp/samples/occlusion-check.glb", "v7"))
      .model.id;
    await selected(page, fourth);
    await page.locator(`[data-version-id="${first}"]`).click();
    await selected(page, first);
    await expect(page.locator("#pending-banner")).toBeHidden();
  });
}
