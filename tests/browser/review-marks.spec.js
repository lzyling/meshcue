import { clickControl, selectSetting } from "./r12-b-helpers.mjs";
import { expectCameraUnchanged } from "./camera-assertions.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { test, expect } from "./fixtures.mjs";
import {
  useReviewServer,
  repo,
  dir,
  env,
  request,
  publish,
  ready,
  point,
  writePlate,
  pin,
} from "./review-fixture.mjs";

/* Placing, editing and showing marks: pins, fills, capsules, notes and
   the view a mark keeps. */
useReviewServer();

test("actual double click creates a surface pin; refresh restores it and geometry ownership", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  expect(before.annotations[0].type).toBe("pin");
  expect(
    before.annotations[0].barycentric.reduce((a, b) => a + b, 0),
  ).toBeCloseTo(1, 4);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.owned).toBe(true);
  await page.screenshot({
    path: path.resolve(
      path.join(dir, "2026-09-09-3d-review-v02-pin-tested.png"),
    ),
    fullPage: true,
  });
});

test("a fill produces real face sets; undo, redo, delete and refresh retain the correct draft", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page, -35, 0);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const painted = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect(painted[0].type).toBe("region");
  expect(Object.values(painted[0].faces).flat().length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(painted);
  await page.screenshot({
    path: path.resolve(
      path.join(dir, "2026-09-09-3d-review-v02-brush-tested.png"),
    ),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Delete red area", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
});

test("a bucket fill stays on the mesh it was clicked and stores no coordinates", async ({
  page,
}) => {
  publish("occlusion-check.glb", "occlusion-test");
  await ready(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const a = d.annotations[0];
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifests", `${d.versionId}.json`), "utf8"),
  );
  const front = manifest.meshes.find((m) => m.name === "visible-front"),
    back = manifest.meshes.find((m) => m.name === "hidden-back");
  expect(Object.keys(a.faces)).toEqual([front.id]);
  expect(a.faces[back.id]).toBeUndefined();
  expect(a.coverage).toBe("source-v2");
  expect(a.faces[front.id].length).toBeGreaterThan(0);
  expect(a.surfacePatches).toEqual([]);
  expect(JSON.stringify(a)).not.toContain("vertices");
  /* What the service wrote down, not only what the page is holding — the two
     were not the same thing, and the page was the one being believed. Only
     `source-v2` is held to this: a v1 draft restored from disk legitimately
     carries its polygons and always will. */
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  );
  const v2 = Object.values(saved.drafts)
    .flatMap((d) => d.annotations)
    .filter((m) => m.coverage === "source-v2");
  expect(v2.length).toBeGreaterThan(0);
  for (const mark of v2) expect(mark.surfacePatches ?? []).toEqual([]);
});

test("the looking tool places nothing while either left or right drag rotates", async ({
  page,
}) => {
  await ready(page);
  const p = await point(page);
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  // View mode now lends the otherwise unused left button to the camera.
  // Marking tools keep their left button, covered separately below.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 45, p.y + 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const dragged = await page.evaluate(() => window.__reviewDiagnostics());
  expect(dragged.annotationCount).toBe(0);
  expect(dragged.camera).not.toEqual(before);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x + 45, p.y + 20, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(350);
  const moved = await page.evaluate(() => window.__reviewDiagnostics());
  expect(moved.annotationCount).toBe(0);
  expect(moved.camera).not.toEqual(dragged.camera);
  await page.locator("#home-view").click();
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  /* Everything above happened in the looking tool, which is why none of it
     made a mark: turning the model can no longer produce one by accident.
     Placing is a tool you choose, and then one click is enough. */
  await clickControl(page, '[data-mode="label"]');
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  /* The gesture this replaces was a double click, so the habit arrives with
     the reviewer — and it must leave one label, not two stacked on each other.
     The wait is what makes this a second gesture rather than a continuation of
     the first; without it the guard would rightly swallow the whole thing. */
  await page.waitForTimeout(700);
  await page.mouse.dblclick(p.x + 3, p.y + 2);
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(2);
  // A label meant for somewhere else is still a label, however soon it comes.
  await page.mouse.click(p.x + 40, p.y + 25);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(3);
  // Placing a label must not move the camera under the reviewer afterwards.
  const saved = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.waitForTimeout(150);
  expectCameraUnchanged(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
    saved,
  );
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(3);
});

test("marking never has to stop to turn the model, and does not consume point label numbers", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const before = await page.evaluate(() => window.__reviewDiagnostics());
  // The friction this replaces: with the camera on the left button too, turning
  // the model between marks meant holding Option or switching back to the view
  // tool and switching out again. The right button was free the whole time.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x + 30, p.y + 12, { steps: 4 });
  await page.mouse.up({ button: "right" });
  const after = await page.evaluate(() => window.__reviewDiagnostics());
  expect(after.annotations).toEqual(before.annotations);
  expect(after.camera).not.toEqual(before.camera);
  await page.locator("#home-view").click();
  await clickControl(page, '[data-mode="label"]');
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  const annotations = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect(annotations.find((a) => a.type === "pin").label).toBe("A");
});

test("iteration: stable letters, explicit focus, relocation, hide and undo preserve identity", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  const first = await page.evaluate(() => window.__reviewDiagnostics());
  expect(first.annotations[0].label).toBe("A");
  await page
    .getByRole("button", { name: "Delete label A", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await pin(page);
  const second = await page.evaluate(() => window.__reviewDiagnostics());
  expect(second.annotations[0].label).toBe("B");
  const p = await point(page, -80, -50);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.locator("#home-view").click();
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
  const camera = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.locator(".annotation-select").click();
  const selectedCamera = await page.evaluate(
    () => window.__reviewDiagnostics().camera,
  );
  for (const key of ["position", "target"])
    selectedCamera[key].forEach((v, i) =>
      expect(v).toBeCloseTo(camera[key][i], 8),
    );
  await page.getByRole("button", { name: "Move label B", exact: true }).click();
  const target = await point(page, -25, 30);
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotations[0].position),
    )
    .not.toEqual(second.annotations[0].position);
  expect(
    (await page.evaluate(() => window.__reviewDiagnostics().annotations[0])).id,
  ).toBe(second.annotations[0].id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().annotations))
    .toEqual(second.annotations);
  await clickControl(page, "#toggle-marks");
  await expect(page.locator(".model-pin")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().annotations))
    .toEqual(second.annotations);
  await clickControl(page, "#toggle-marks");
  // The control points the way the panel moves. A plus and a minus sat beside a
  // list that really can have marks added to it, and read as doing that.
  const iconRef = () =>
    page.locator("#toggle-annotations use").getAttribute("href");
  expect(await iconRef()).toBe("#mc-collapse-left");
  await page.locator("#toggle-annotations").click();
  await expect(page.locator("#annotations-list")).toBeHidden();
  expect(await iconRef()).toBe("#mc-expand-right");
  // The collapsed strip is navigation only; hand-over returns on expansion.
  await expect(page.locator("#submit-feedback")).toBeHidden();
  // Folded is the button and nothing else. A heading that stays behind keeps
  // the column roughly as wide as the words in it, in every language.
  await expect(page.locator("#sidebar-marks .sidebar-caption")).toBeHidden();
  await expect(page.locator("#toggle-annotations")).toBeVisible();
  const folded = await page.locator(".annotations-panel").boundingBox();
  expect(folded.width).toBeLessThan(60);
  await page.locator("#toggle-annotations").click();
  await expect(page.locator("#submit-feedback")).toBeVisible();
  await expect(page.locator("#sidebar-marks .sidebar-caption")).toBeVisible();
});

/* The preview has to be the promise: what the cursor shades before the click is
   exactly what the click claims, face for face.

   The second half used to erase part of the fill. With the eraser shelved, the
   way back from a fill is to undo it or delete the mark, and that is what is
   pinned here instead — a reviewer who fills the wrong surface is not stuck. */

test("iteration: bucket preview equals filled coverage, and a fill can be taken back", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.fillFaces),
    )
    .toBeGreaterThan(1);
  const count = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.fillFaces,
  );
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const filled = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  // The faces are the coverage now; the fill stores no polygons at all.
  expect(Object.values(filled[0].faces).flat().length).toBe(count);
  expect(filled[0].surfacePatches).toEqual([]);
  await page.locator(".delete-annotation").first().click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(0);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().annotations))
    .toEqual(filled);
});

test("iteration: changing tool cancels a bucket action awaiting edit ownership", async ({
  page,
}) => {
  await ready(page);
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let entered = false;
  await page.route("**/api/review/begin", async (route) => {
    entered = true;
    await blocked;
    await route.continue();
  });
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => entered).toBe(true);
  // Any other tool will do; what is being cancelled is the fill still waiting
  // for the draft to be claimed.
  await clickControl(page, '[data-mode="label"]');
  release();
  await expect
    .poll(async () => (await request("GET", "state")).data.locked)
    .toBe(true);
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
});

test("a mark points at the surface it is about, and says so when it lands", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="label"]');
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  // Placing a mark used to happen in silence, which reads as a double click
  // that missed rather than one that was taken.
  await expect(page.locator(".model-pin.landing")).toHaveCount(1);
  // The dot, not the floating capsule's box, is the surface anchor.
  const measure = () =>
    page.evaluate(
      ([x, y]) => {
        const pin = document.querySelector(".model-pin");
        const box = pin.getBoundingClientRect();
        const dot = getComputedStyle(pin, "::after");
        const tag = pin.querySelector(".pin-tag").getBoundingClientRect();
        return {
          dx: Math.abs(
            box.left + parseFloat(dot.left) + parseFloat(dot.width) / 2 - x,
          ),
          dy: Math.abs(
            box.top + parseFloat(dot.top) + parseFloat(dot.height) / 2 - y,
          ),
          below: tag.bottom < y,
          tipGap: y - tag.bottom,
          hasDot: dot.content !== "none" && dot.borderRadius === "50%",
        };
      },
      [spot.x, spot.y],
    );
  await expect.poll(async () => (await measure()).dx).toBeLessThan(3);
  await expect.poll(async () => (await measure()).dy).toBeLessThan(3);
  const gap = await measure();
  expect(gap.hasDot).toBe(true);
  expect(gap.below).toBe(true);
  expect(gap.tipGap).toBeGreaterThan(13);
  expect(gap.tipGap).toBeLessThan(19);
  // Redrawing is not placing: a refresh must not make every existing mark
  // re-enact its own arrival.
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator(".model-pin")).toHaveCount(1);
  await expect(page.locator(".model-pin.landing")).toHaveCount(0);
});

test("pin capsules retain display modes, selection, and pan passthrough", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="label"]');
  await page.locator('.color-button[data-color="#e6b64b"]').click();
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator(".model-pin")).toHaveCount(1);
  const pin = page.locator(".model-pin").first();
  await expect(pin).toHaveText("A");
  await expect(pin.locator(".pin-tag")).toHaveCSS("color", "rgb(48, 39, 0)");
  await page.locator('[data-mark-show="color"]').click();
  await page.mouse.click(spot.x + 20, spot.y + 20);
  await expect(page.locator(".model-pin.color-only")).toHaveCount(1);
  await expect(page.locator(".model-pin.color-only")).toHaveText("");
  await expect(page.locator(".model-pin.color-only .pin-tag")).toHaveCSS(
    "width",
    "14px",
  );
  await page.locator('[data-mark-show="label"]').click();
  await page.mouse.click(spot.x - 20, spot.y + 20);
  await expect(page.locator(".model-pin.label-only")).toHaveCount(1);
  await expect(page.locator(".model-pin.label-only .pin-tag")).toHaveCSS(
    "background-color",
    "rgb(107, 115, 120)",
  );
  await expect(page.locator(".model-pin.label-only .pin-tag")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await pin.locator(".pin-tag").click();
  await expect(pin).toHaveClass(/selected/);
  expect(
    await pin
      .locator(".pin-tag")
      .evaluate((el) => getComputedStyle(el).boxShadow),
  ).not.toBe("none");
  await clickControl(page, '[data-mode="pan"]');
  await expect(pin.locator(".pin-tag")).toHaveCSS("pointer-events", "none");
});

test("annotation-badge capsules match model tags across themes and narrow screens", async ({
  page,
}) => {
  await ready(page);
  await pin(page);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const clientId = await page.evaluate(() =>
    sessionStorage.getItem("3d-review-client"),
  );
  const base = d.annotations[0];
  const annotations = [
    { ...base, id: "badge-af", label: "AF", color: "#e6b64b" },
    { ...base, id: "badge-ag", label: "AG", color: "#d15a45" },
    { ...base, id: "badge-color", label: "AH", show: "color" },
    { ...base, id: "badge-label", label: "AI", show: "label" },
    {
      id: "badge-edge",
      type: "edge",
      label: "AJ",
      color: "#e6b64b",
      meshId: base.meshId,
      space: "model",
      points: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      length: 1,
      curved: false,
      sourceFaceIndex: 0,
    },
    {
      id: "badge-part",
      type: "part",
      label: "AK",
      color: "#d15a45",
      partIds: ["part-0"],
      meshIds: [base.meshId],
      names: ["Part"],
      bounds: {
        space: "model",
        centroid: [0, 0, 0],
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
    },
  ];
  expect(
    (
      await request("PUT", "draft", {
        versionId: d.versionId,
        clientId,
        revision: d.revision,
        annotations,
        camera: d.camera,
      })
    ).status,
  ).toBe(200);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  for (const theme of ["light", "dark"]) {
    await selectSetting(page, "#theme-choice", theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const badge = page.locator(".annotation-badge");
      await expect(badge.nth(0)).toHaveText("AF");
      await expect(badge.nth(1)).toHaveText("AG");
      await expect(badge.nth(0)).toHaveCSS("color", "rgb(48, 39, 0)");
      await expect(badge.nth(1)).toHaveCSS("color", "rgb(255, 255, 255)");
      await expect(badge.nth(2)).toHaveText("");
      await expect(badge.nth(2)).toHaveCSS("width", "14px");
      await expect(badge.nth(2)).toHaveCSS("height", "14px");
      await expect(badge.nth(3)).toHaveCSS(
        "background-color",
        "rgb(107, 115, 120)",
      );
      await expect(badge.nth(3)).toHaveCSS("color", "rgb(255, 255, 255)");
      const layout = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".annotation-select")];
        const props = [
          "height",
          "borderRadius",
          "padding",
          "minWidth",
          "boxShadow",
          "fontSize",
          "fontWeight",
          "whiteSpace",
        ];
        const tag = getComputedStyle(
          document.querySelector(".model-pin:not(.selected) .pin-tag"),
        );
        return rows.map((row) => {
          const b = row.querySelector(".annotation-badge");
          const r = b.getBoundingClientRect();
          const column = b.parentElement.getBoundingClientRect();
          const style = getComputedStyle(b);
          return {
            left: row.lastElementChild.getBoundingClientRect().left,
            centered:
              Math.abs(r.top + r.height / 2 - column.top - column.height / 2) <
              1,
            fits: b.scrollWidth <= b.clientWidth,
            matches: props.every((p) => style[p] === tag[p]),
            colorOnly: b.classList.contains("color-only"),
          };
        });
      });
      expect(new Set(layout.map((r) => r.left)).size).toBe(1);
      expect(layout.every((r) => r.centered && r.fits)).toBe(true);
      expect(layout.filter((r) => !r.colorOnly).every((r) => r.matches)).toBe(
        true,
      );
      await badge.nth(0).click();
      await expect(page.locator('[data-annotation-id="badge-af"]')).toHaveClass(
        /selected/,
      );
      // List selection belongs to the row, not a second 3D-style halo.
      await expect(badge.nth(0)).toHaveCSS(
        "box-shadow",
        await badge.nth(1).evaluate((el) => getComputedStyle(el).boxShadow),
      );
    }
  }
});

test("a mark arrives at its point instead of flying in from the corner", async ({
  page,
}) => {
  await ready(page);
  await clickControl(page, '[data-mode="label"]');
  // Stretch the arrival so it can be measured while it is still running. Every
  // existing assertion polls until the animation has settled, so none of them
  // could see where a mark travelled on its way in — and travelling is the
  // whole defect: individual transform properties compose translate → rotate →
  // scale → transform, so a scale written next to a position in `transform`
  // multiplies the position too, about the label layer's own origin.
  await page.addStyleTag({
    content:
      ".model-pin.landing{animation-duration:20s !important}.pin-ripple{animation-duration:20s !important}",
  });
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator(".model-pin.landing")).toHaveCount(1);
  // 0.6% into an arrival that now lasts twenty seconds. This used to be the
  // time allowed for the render loop to place the label, and a slow runner
  // sometimes needed more; a label is placed as it is made now (see the next
  // test), so the wait is only how far into the arrival this looks.
  await page.waitForTimeout(120);
  const travel = await page.evaluate(
    ([x, y]) => {
      const box = document.querySelector(".model-pin").getBoundingClientRect();
      const ripple = document
        .querySelector(".pin-ripple")
        ?.getBoundingClientRect();
      return {
        pin: Math.hypot(
          box.left + box.width / 2 - x,
          box.top + box.height / 2 - y,
        ),
        ripple: ripple
          ? Math.hypot(
              ripple.left + ripple.width / 2 - x,
              ripple.top + ripple.height / 2 - y,
            )
          : null,
      };
    },
    [spot.x, spot.y],
  );
  expect(travel.pin).toBeLessThan(6);
  // Not merely "near the point": a number at all. The ripple lived in the layer
  // that is rebuilt whenever the marks change, so placing a mark removed the
  // ripple acknowledging it in the same synchronous block — it had never been
  // on screen for a single frame.
  expect(travel.ripple).toBeLessThan(6);
});

test("a mark is on its point the first time it is drawn", async ({ page }) => {
  await ready(page);
  // Every label is rebuilt whenever the marks change, and the rebuild runs in
  // an animation frame of its own — usually after the render loop's in the same
  // frame, because the loop asked for its frame first. So a rebuilt label was
  // painted once where nothing had placed it yet, the corner of the view, and
  // moved onto its point a frame later. A fast machine hides that in sixteen
  // milliseconds; a slow runner held it long enough for the arrival test above
  // to measure a label 635 px from where it was put, on every retry. What keeps
  // it from being painted there is that a label is placed as it is made, and
  // that does not depend on how fast frames are: the observer runs before the
  // browser can paint what was added.
  await page.evaluate(() => {
    window.__unplacedPins = 0;
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node.classList?.contains("model-pin") && !node.style.translate)
            window.__unplacedPins++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await clickControl(page, '[data-mode="label"]');
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await page.mouse.click(spot.x + 8, spot.y + 8);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  // Choosing a mark redraws every label as well, not only placing one.
  await page.locator("#annotations-list [data-annotation-id]").first().click();
  await expect(page.locator(".model-pin.selected")).toHaveCount(1);
  expect(await page.locator(".model-pin").count()).toBe(2);
  expect(await page.evaluate(() => window.__unplacedPins)).toBe(0);
});

/* A note is the reviewer saying what should change at a mark, in the words
   they would have typed into the conversation. It belongs to the chosen mark
   and sits under the list, because the list is rebuilt on every change and a
   text box rebuilt under someone typing loses what they were typing. */

test("a note is written on the chosen mark and keeps its words", async ({
  page,
}) => {
  await ready(page);
  const marks = () => page.evaluate(() => window.__reviewDiagnostics());
  await clickControl(page, '[data-mode="label"]');
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const placed = (await marks()).annotations[0].view;
  expect(placed.space).toBe("model");
  expect(placed.fov).toBe(38);
  // The mark just placed is the chosen one, so its note is right there.
  const box = page.getByRole("textbox", { name: "Note on A" });
  await expect(box).toBeVisible();
  // Turned before writing: the view that travels is the one the words were
  // written from, not the one the mark was placed from.
  await page.locator('.orient-region[data-view="1,1,1"]').click();
  await box.click();
  await page.keyboard.type("Make this hole 6 mm", { delay: 10 });
  await expect
    .poll(async () => (await marks()).annotations[0].note)
    .toBe("Make this hole 6 mm");
  await expect.poll(async () => (await marks()).dirty).toBe(false);
  // Saved while typing, and the list rebuilt with it; the box was not.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(
    "mark-note-text",
  );
  // Mid-composition an input method holds a guess, not a word; only the word
  // it settles on is kept.
  await page.evaluate(() => {
    const text = document.querySelector("#mark-note-text");
    text.value += ", not 5";
    text.dispatchEvent(new InputEvent("input", { isComposing: true }));
  });
  expect((await marks()).annotations[0].note).toBe("Make this hole 6 mm");
  await page.evaluate(() =>
    document
      .querySelector("#mark-note-text")
      .dispatchEvent(new CompositionEvent("compositionend")),
  );
  await expect
    .poll(async () => (await marks()).annotations[0].note)
    .toBe("Make this hole 6 mm, not 5");
  await expect.poll(async () => (await marks()).dirty).toBe(false);
  const written = (await marks()).annotations[0].view;
  expect(written.position).not.toEqual(placed.position);
  // In the list, the note stands in for the line saying how the mark was made.
  await expect(page.locator("#annotations-list .annotation-note")).toHaveText(
    "Make this hole 6 mm, not 5",
  );
  // One visit to the box is one step back, not one step per keystroke.
  await page.locator("#home-view").click();
  await page.locator("#undo").click();
  await expect
    .poll(async () => (await marks()).annotations[0]?.note ?? null)
    .toBe(null);
  expect((await marks()).annotationCount).toBe(1);
  await page.locator("#redo").click();
  await expect
    .poll(async () => (await marks()).annotations[0]?.note ?? null)
    .toBe("Make this hole 6 mm, not 5");
  await expect.poll(async () => (await marks()).dirty).toBe(false);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#annotations-list .annotation-select").click();
  await expect(page.getByRole("textbox", { name: "Note on A" })).toHaveValue(
    "Make this hole 6 mm, not 5",
  );
  expect((await marks()).annotations[0].view).toEqual(written);
});

/* The camera the page stores for a batch is the preview's: the model scaled
   into three units and, for an STL, stood up. A mark's view is the same
   camera in the file's own frame and units, with the top of the screen — so
   rebuilt from nothing but the view and the file, it puts the mark back where
   the reviewer clicked. The plate is modelled flat on +Z, which the preview
   draws as +Y; an answer in the preview's frame would say so. */

test("a mark's view puts the reviewer's screen back together in the model's own frame", async ({
  page,
}) => {
  execFileSync(
    process.execPath,
    ["scripts/reviewctl.mjs", "publish", writePlate(), "--version", "stl"],
    { cwd: repo, env, encoding: "utf8" },
  );
  await ready(page);
  await clickControl(page, '[data-mode="label"]');
  const spot = await point(page);
  await page.mouse.click(spot.x, spot.y);
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  const d = await page.evaluate(() => window.__reviewDiagnostics());
  const { position, view } = d.annotations[0];
  expect(view.space).toBe("model");
  // From the home view the top of the screen is mostly the file's +Z.
  expect(view.up[2]).toBeGreaterThan(0.8);
  expect(Math.hypot(...view.up)).toBeCloseTo(1, 4);
  const camera = new THREE.PerspectiveCamera(view.fov, view.aspect, 0.01, 1e5);
  camera.position.fromArray(view.position);
  camera.up.fromArray(view.up);
  camera.lookAt(new THREE.Vector3().fromArray(view.target));
  camera.updateMatrixWorld();
  const seen = new THREE.Vector3().fromArray(position).project(camera);
  const box = await page.locator("#viewer").boundingBox();
  expect(seen.x).toBeCloseTo(((spot.x - box.x) / box.width) * 2 - 1, 2);
  expect(seen.y).toBeCloseTo(1 - ((spot.y - box.y) / box.height) * 2, 2);
  // Millimetres, not the preview's units: 20 mm was fitted into 3.
  const far = (c) => Math.hypot(...c.position.map((v, i) => v - c.target[i]));
  expect(far(view) / far(d.camera)).toBeCloseTo(20 / 3, 3);
});
