import { test, expect } from "./fixtures.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "../scenarios/kit.mjs";
import { selectSetting } from "./b1u-shell-helpers.mjs";
import fs from "node:fs";

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
