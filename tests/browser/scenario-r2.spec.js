import {
  clickControl,
  showParts,
  revealControl,
} from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { expectCameraUnchanged } from "./camera-assertions.mjs";
import { devices } from "@playwright/test";
import { startScenario } from "../../scripts/scenario-env.mjs";
import * as THREE from "three";
import fs from "node:fs";
import { primitiveGlb } from "../fixtures/primitive-glb.mjs";

const evidence = "tmp/b1-scenario-r2/evidence";
let environment;
test.afterEach(async () => environment?.stop());
const diag = (page) => page.evaluate(() => window.__reviewDiagnostics());
const settled = (page) =>
  expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
async function open(page, fixture = "tmp/b1-scenario-r2/box.stl") {
  fs.mkdirSync(evidence, { recursive: true });
  const positions = new THREE.BoxGeometry(20, 16, 10).toNonIndexed().attributes
    .position;
  let stl = "solid regression\n";
  for (let i = 0; i < positions.count; i += 3) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (let j = 0; j < 3; j++)
      stl += `vertex ${positions.getX(i + j)} ${positions.getY(i + j)} ${positions.getZ(i + j)}\n`;
    stl += "endloop\nendfacet\n";
  }
  fs.writeFileSync("tmp/b1-scenario-r2/box.stl", stl + "endsolid regression\n");
  environment = await startScenario({
    fixture,
    dist: process.env.REVIEW_TEST_DIST,
  });
  await page.goto(environment.url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect
    .poll(async () => (await diag(page)).viewer.meshes)
    .toBeGreaterThan(0);
  await settled(page);
}
async function screenshot(page, name) {
  await page.screenshot({
    path: `${evidence}/${name}-${process.env.R2_EVIDENCE || "green"}.png`,
  });
}
async function unobscured(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return (
      r.left >= 0 &&
      r.right <= innerWidth &&
      r.top >= 0 &&
      r.bottom <= innerHeight &&
      [0.15, 0.5, 0.85].every((x) =>
        [0.2, 0.8].every((y) =>
          el.contains(
            document.elementFromPoint(
              r.left + r.width * x,
              r.top + r.height * y,
            ),
          ),
        ),
      )
    );
  });
}
async function chooseTouchTool(page, mode) {
  await revealControl(page, `[data-mode="${mode}"]`);
  const button = page.locator(`[data-mode="${mode}"]`);
  const r = await button.boundingBox();
  // The caption remains reachable before the separate palette-overlap fix.
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height - 4);
  await expect(button).toHaveClass(/active/);
}
async function measureLayout(page) {
  // Drain the disclosure's queued toggle and the layout observers before
  // comparing rectangles, rather than depending on this machine's fonts.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      panel: rect("#tool-options"),
      hint: rect(".tool-hint-box"),
      reading: rect("#measure-reading"),
    };
  });
}
async function expectCanvasTap(page, point) {
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      point,
    ),
  ).toBe("CANVAS");
}
function expectPhoneMeasureClear(layout, points) {
  // Thirty-two CSS pixels of breathing room rules out a font-specific pass
  // by one or two pixels. The hint is at the top edge, controls at the bottom.
  expect(layout.panel.y).toBeGreaterThanOrEqual(
    Math.max(...points.map((p) => p.y)) + 32,
  );
  expect(layout.hint.y + layout.hint.height).toBeLessThanOrEqual(
    Math.min(...points.map((p) => p.y)) - 32,
  );
}
async function boxFacePoints(page) {
  const d = await diag(page),
    r = await page.locator("#viewer canvas").boundingBox();
  const camera = new THREE.PerspectiveCamera(
    d.camera.fov || 38,
    r.width / r.height,
    0.01,
    100,
  );
  camera.up.fromArray(d.screenUp);
  camera.position.fromArray(d.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(d.camera.target));
  camera.updateMatrixWorld();
  // The centred 20 × 16 × 10 STL is scaled by 3/20 and stood +Z up.
  // Aim at two known points on its front face: overlay-aware fitting can put
  // empty space at the canvas centre, especially with a narrow toolbar.
  return [-4, 4].map((x) => {
    const p = new THREE.Vector3(0.15 * x, -0.3, 1.2).project(camera);
    return {
      x: r.x + ((p.x + 1) * r.width) / 2,
      y: r.y + ((1 - p.y) * r.height) / 2,
    };
  });
}
for (const [device, locale] of [
  ["iPhone 13", "en"],
  ["iPhone 13", "de"],
  ["iPad (gen 7) landscape", "en"],
]) {
  test(`R2 bug 1: deliberate taps mark and touch gestures only navigate (${device}${locale === "en" ? "" : `, ${locale}`})`, async ({
    browser,
  }) => {
    test.setTimeout(100000);
    const context = await browser.newContext({
      ...devices[device],
      defaultBrowserType: undefined,
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(
        (locale) => localStorage.setItem("meshcue-locale", locale),
        locale,
      );
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.locator("#toggle-annotations").tap();
      // The renderer resizes in a ResizeObserver after the sidebar folds.
      // Use the final canvas, not the old pre-fold backing element size.
      await measureLayout(page);
      const r = await page.locator("#viewer canvas").boundingBox();
      const x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      await page.touchscreen.tap(x, y);
      expect((await diag(page)).annotationCount).toBe(0);
      await chooseTouchTool(page, "label");
      await page.touchscreen.tap(x, y);
      await expect.soft
        .poll(async () => (await diag(page)).annotationCount)
        .toBe(1);
      await chooseTouchTool(page, "fill");
      await expectCanvasTap(page, { x: x - 45, y: y + 35 });
      await page.touchscreen.tap(x - 45, y + 35);
      await expect.soft
        .poll(async () => (await diag(page)).annotationCount)
        .toBe(2);
      await chooseTouchTool(page, "measure");
      // This gesture check taps arbitrary points, not Smart objects. Close
      // the disclosure again so its phone layout does not cover those taps.
      await page.locator("#measure-advanced summary").tap();
      await page.locator('[data-measure="points"]').tap();
      await page.locator("#measure-advanced summary").tap();
      const taps = [
        { x: x - 45, y: y + 50 },
        { x: x + 35, y: y + 50 },
      ];
      const beforePick = await measureLayout(page);
      if (device === "iPhone 13") expectPhoneMeasureClear(beforePick, taps);
      await expectCanvasTap(page, taps[0]);
      await page.touchscreen.tap(taps[0].x, taps[0].y);
      expect((await diag(page)).measuring?.picks).toBe(1);
      const afterFirstPick = await measureLayout(page);
      if (device === "iPhone 13") {
        expect(afterFirstPick).toEqual(beforePick);
        expectPhoneMeasureClear(afterFirstPick, taps);
      }
      await expectCanvasTap(page, taps[1]);
      await page.touchscreen.tap(taps[1].x, taps[1].y);
      await expect.soft
        .poll(async () => (await diag(page)).measuring?.result?.value)
        .toBeGreaterThan(0);
      if (device === "iPhone 13") {
        const afterSecondPick = await measureLayout(page);
        expect(afterSecondPick).toEqual(beforePick);
        fs.mkdirSync("tmp/b1v-ci/evidence", { recursive: true });
        fs.writeFileSync(
          `tmp/b1v-ci/evidence/r2-${locale}-geometry.json`,
          JSON.stringify(
            { taps, beforePick, afterFirstPick, afterSecondPick },
            null,
            2,
          ),
        );
        await page.screenshot({
          path: `tmp/b1v-ci/evidence/r2-${locale}-two-picks.png`,
        });
      }
      const session = await context.newCDPSession(page);
      for (const mode of ["label", "fill", "measure"]) {
        await chooseTouchTool(page, mode);
        const before = (await diag(page)).camera;
        // Start in empty canvas, clear of the marks placed above.
        const x = r.x + 65,
          y = r.y + r.height * 0.4;
        expect(
          await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS",
            { x, y },
          ),
        ).toBe(true);
        for (const [type, touchPoints] of [
          ["touchStart", [{ x, y }]],
          ["touchMove", [{ x: x + 40, y: y + 20 }]],
          ["touchMove", [{ x, y }]],
          ["touchEnd", []],
          [
            "touchStart",
            [
              { x: x - 20, y },
              { x: x + 20, y },
            ],
          ],
          [
            "touchMove",
            [
              { x: x - 40, y },
              { x: x + 40, y },
            ],
          ],
          ["touchEnd", []],
        ])
          await session.send("Input.dispatchTouchEvent", { type, touchPoints });
        expect((await diag(page)).annotationCount).toBe(2);
        expect((await diag(page)).camera).not.toEqual(before);
        if (mode === "measure")
          expect((await diag(page)).measuring?.picks || 0).toBe(0);
      }
      await session.detach();
    } finally {
      await context.close();
    }
  });
}

for (const locale of ["en", "de"]) {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    test(`phone measurement layout stays put across kinds and larger reading fonts (${locale}, ${viewport.width}×${viewport.height})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        ...devices["iPhone 13"],
        viewport,
        defaultBrowserType: undefined,
      });
      try {
        const page = await context.newPage();
        await page.addInitScript(
          (locale) => localStorage.setItem("meshcue-locale", locale),
          locale,
        );
        await open(page);
        await page.locator("#toggle-annotations").tap();
        await chooseTouchTool(page, "measure");
        // Deliberately exaggerate font metrics beyond either host's defaults.
        // The next-point text must wrap/scroll without growing the panel.
        await page.addStyleTag({
          content: "#measure-reading { font-size: 18px; letter-spacing: 1px; }",
        });
        const layouts = [];
        for (const kind of ["smart", "points", "edge", "planes", "circle"]) {
          if (kind === "smart")
            await page.locator('[data-measure="smart"]').tap();
          else {
            await page.locator("#measure-advanced summary").tap();
            await page.locator(`[data-measure="${kind}"]`).tap();
            await page.locator("#measure-advanced summary").tap();
          }
          const before = await measureLayout(page);
          const points = await boxFacePoints(page);
          expectPhoneMeasureClear(before, points);
          for (const point of points) {
            await expectCanvasTap(page, point);
            await page.touchscreen.tap(point.x, point.y);
            expect(await measureLayout(page)).toEqual(before);
          }
          if (["points", "circle"].includes(kind))
            expect((await diag(page)).measuring?.picks).toBe(2);
          layouts.push({
            kind,
            points,
            before,
            after: await measureLayout(page),
          });
        }
        fs.mkdirSync("tmp/b1v-ci/evidence", { recursive: true });
        fs.writeFileSync(
          `tmp/b1v-ci/evidence/kinds-${locale}-${viewport.width}-${viewport.height}.json`,
          JSON.stringify(layouts, null, 2),
        );
      } finally {
        await context.close();
      }
    });
  }
}

for (const [width, height] of [
  [1440, 900],
  [1024, 768],
]) {
  test(`R2 bug 2: Section leaves cube arrows clickable (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    await clickControl(page, "#section-toggle");
    // Cube arrows are hover affordances now. Reveal them as a desktop user
    // would before checking that Section leaves their whole targets clear.
    await page.locator(".orient-stage").hover();
    await screenshot(page, `bug2-section-${width}`);
    for (const control of await page
      .locator(".navigation-arrow, .navigation-roll")
      .all()) {
      await expect(control).toBeVisible();
      expect(await unobscured(control)).toBe(true);
    }
    const arrow = page.locator(".navigation-arrow-left");
    const before = (await diag(page)).camera;
    await arrow.click({ timeout: 3000 });
    await settled(page);
    expect((await diag(page)).camera).not.toEqual(before);
  });
}
test("R2 bug 3: Display choices win over measurement options", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await clickControl(page, '[data-mode="measure"]');
  for (const style of ["hidden", "xray"]) {
    await clickControl(page, "#display-toggle");
    await screenshot(page, `bug3-display-${style}`);
    const choice = page.locator(`[data-style="${style}"]`);
    expect(await unobscured(choice)).toBe(true);
    await choice.click({ timeout: 3000 });
    await expect(choice).toHaveAttribute("aria-checked", "true");
  }
});
for (const locale of ["en", "zh-Hans", "zh-Hant", "ja", "de", "fr"]) {
  for (const theme of ["light", "dark"]) {
    test(`R2 bug 4: narrow toolbar fits with Parts (${locale}, ${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.addInitScript(
        ({ locale, theme }) => {
          localStorage.setItem("meshcue-locale", locale);
          localStorage.setItem("meshcue-theme", theme);
        },
        { locale, theme },
      );
      await open(page);
      await showParts(page);
      await expect(page.locator("#parts-panel")).toBeVisible();
      await screenshot(page, `bug4-toolbar-${locale}-${theme}`);
      for (const button of await page
        .locator(".toolbar button:visible")
        .all()) {
        expect
          .soft(
            await unobscured(button),
            await button.getAttribute("data-command"),
          )
          .toBe(true);
      }
      expect(
        await page.locator(".toolbar").evaluate((toolbar) => {
          const bounds = toolbar
            .closest(".viewer-shell")
            .getBoundingClientRect();
          const buttons = [...toolbar.querySelectorAll("button")].filter(
            (b) => b.getClientRects().length,
          );
          return buttons.every((b) => {
            const r = b.getBoundingClientRect();
            return (
              r.left >= bounds.left &&
              r.right <= bounds.right &&
              [...b.querySelectorAll("span")].every((s) => {
                const text = s.getBoundingClientRect();
                return text.left >= r.left && text.right <= r.right;
              })
            );
          });
        }),
      ).toBe(true);
    });
  }
}
test("R2 bug 5: phone palettes leave every toolbar icon tappable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 664 },
  });
  try {
    const page = await context.newPage();
    await open(page);
    await page.locator("#toggle-annotations").tap();
    for (const mode of ["label", "fill"]) {
      await chooseTouchTool(page, mode);
      await screenshot(page, `bug5-palette-${mode}`);
      for (const button of await page.locator(".toolbar button:visible").all())
        expect.soft(await unobscured(button)).toBe(true);
    }
    await revealControl(page, '[data-mode="measure"]');
    const measure = page.locator('[data-mode="measure"] svg').first();
    await measure.tap({ timeout: 3000 });
    await expect(page.locator('[data-mode="measure"]')).toHaveClass(/active/);
  } finally {
    await context.close();
  }
});

async function expectFramed(page) {
  await settled(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document
          .querySelector("#viewer canvas")
          .getBoundingClientRect();
        const toolbar = document
          .querySelector(".toolbar")
          .getBoundingClientRect();
        return window.__navigationDiagnostics().bounds.every(([x, y]) => {
          const px = canvas.left + ((x + 1) * canvas.width) / 2;
          const py = canvas.top + ((1 - y) * canvas.height) / 2;
          return (
            px >= canvas.left &&
            px <= canvas.right &&
            py >= canvas.top + 30 &&
            py < toolbar.top - 4
          );
        });
      }),
    )
    .toBe(true);
}
for (const projection of ["perspective", "orthographic"]) {
  test(`R2 bug 6: initial, fit, home and restored views clear overlays (${projection})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.addInitScript(
      (p) => localStorage.setItem("meshcue-projection", p),
      projection,
    );
    await open(page);
    await screenshot(page, `bug6-initial-${projection}`);
    await expectFramed(page);
    await page.locator("#sidebar-marks").click();
    await page.keyboard.press("F");
    await expectFramed(page);
    await clickControl(page, '[data-mode="label"]');
    const r = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height * 0.45);
    await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
    const markView = (await diag(page)).annotations[0].view;
    await clickControl(page, '[data-mode="orbit"]');
    await page.keyboard.press("F");
    await expectFramed(page);
    await page.locator("#submit-feedback").click();
    await expect(page.locator("#feedback-line")).toContainText("Marks sent");
    await page.reload();
    await expect(page.locator("#loading")).toBeHidden();
    await showParts(page);
    await expect(page.locator("#parts-panel")).toBeVisible();
    await expectFramed(page);
    expect((await diag(page)).annotations[0].view).toEqual(markView);
    await screenshot(page, `bug6-restored-${projection}`);
    await page.keyboard.press("Home");
    await expectFramed(page);
    // A deliberate zoom must survive subsequent panel changes.
    const canvas = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.move(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height * 0.45,
    );
    await page.mouse.wheel(0, -100);
    // Settle the wheel and pointer-leave render before measuring the sidebar
    // change alone. Keep the exact camera equality assertion below.
    await page.mouse.move(5, 5);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const moved = (await diag(page)).camera;
    await page.locator("#sidebar-marks").click();
    await expect.poll(async () => (await diag(page)).camera).toEqual(moved);
  });
}

test("R2 bug 6: GLB triangle stays above toolbar when Parts opens after load", async ({
  page,
}) => {
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync("tmp/b1-scenario-r2/triangle.glb", primitiveGlb());
  await page.setViewportSize({ width: 1000, height: 768 });
  await open(page, "tmp/b1-scenario-r2/triangle.glb");
  await expectFramed(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await showParts(page);
  await expect(page.locator("#parts-panel")).toBeVisible();
  await expectFramed(page);
  await page.keyboard.press("F");
  await expectFramed(page);
  await screenshot(page, "bug6-triangle");
});

const lostConnection = {
  en: "Connection lost",
  "zh-Hans": "连接已断开",
  "zh-Hant": "連線已中斷",
  ja: "接続が切れました",
  de: "Verbindung unterbrochen",
  fr: "Connexion perdue",
};
for (const [locale, message] of Object.entries(lostConnection)) {
  test(`R2 bug 8: offline draft guidance and Send recover (${locale})`, async ({
    page,
    context,
  }) => {
    await page.addInitScript(
      (locale) => localStorage.setItem("meshcue-locale", locale),
      locale,
    );
    await open(page);
    await clickControl(page, '[data-mode="label"]');
    const r = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height * 0.45);
    await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
    const note = page.locator("#mark-note-text");
    await note.fill("Before the outage");
    await expect.poll(async () => (await diag(page)).dirty).toBe(false);
    await context.setOffline(true);
    await note.fill("Kept while disconnected");
    await expect(page.locator("#submit-feedback")).toBeDisabled();
    await expect(page.locator("#save-status")).toContainText(message);
    const saved = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(window.__reviewDiagnostics().draftCacheKey),
      ),
    );
    expect(saved.annotations[0].note).toBe("Kept while disconnected");
    expect(saved.dirty).toBe(true);
    await page.mouse.click(r.x + r.width / 2 + 40, r.y + r.height * 0.45 + 35);
    await expect(page.locator("#toast")).toContainText(message);
    expect((await diag(page)).annotationCount).toBe(1);
    await screenshot(page, `bug8-offline-${locale}`);
    await context.setOffline(false);
    await expect(page.locator("#submit-feedback")).toBeEnabled();
    await page.locator("#submit-feedback").click();
    await expect.poll(async () => (await diag(page)).dirty).toBe(false);
    await page.reload();
    await expect(page.locator("#loading")).toBeHidden();
    expect((await diag(page)).annotations[0].note).toBe(
      "Kept while disconnected",
    );
  });
}
test("R2 bug 8: denied storage never claims the offline draft is saved", async ({
  page,
  context,
}) => {
  await open(page);
  await clickControl(page, '[data-mode="label"]');
  const r = await page.locator("#viewer canvas").boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height * 0.45);
  const note = page.locator("#mark-note-text");
  await note.fill("Before the outage");
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await context.setOffline(true);
  await note.fill("Only in this open page");
  await expect(page.locator("#save-status")).toContainText(
    "could not be saved on this device",
  );
  await expect(page.locator("#submit-feedback")).toBeDisabled();
  expect((await diag(page)).annotations[0].note).toBe("Only in this open page");
});

test("R2 bug 6: keyboard pan, zoom and Frame prevent later automatic refitting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await open(page);
  for (const action of ["Control+Shift+ArrowRight", "Z", "Frame"]) {
    await page.reload();
    await expect(page.locator("#loading")).toBeHidden();
    await settled(page);
    await showParts(page);
    await expect(page.locator("#parts-panel")).toBeVisible();
    const before = (await diag(page)).camera;
    if (action === "Frame") {
      await clickControl(page, '[data-mode="label"]');
      const r = await page.locator("#viewer canvas").boundingBox();
      await page.mouse.click(r.x + r.width / 2 + 40, r.y + r.height * 0.4);
      await expect.poll(async () => (await diag(page)).annotationCount).toBe(1);
      await page.locator("#sidebar-marks").click();
      await page
        .locator(".annotation-row.selected .annotation-action")
        .first()
        .click();
    } else await page.keyboard.press(action);
    await expect
      .poll(async () => (await diag(page)).camera)
      .not.toEqual(before);
    const moved = (await diag(page)).camera;
    await page.locator("#toggle-annotations").click();
    await page.waitForFunction(() => {
      const viewer = document.querySelector("#viewer"),
        canvas = viewer.querySelector("canvas");
      return Math.abs(viewer.clientWidth - canvas.clientWidth) < 1;
    });
    expectCameraUnchanged((await diag(page)).camera, moved);
  }
});

test("R2 bug 8: Send recovers when a new version arrives during an outage", async ({
  page,
  context,
}) => {
  if (process.env.MESHCUE_CI_CPU_RATE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: Number(process.env.MESHCUE_CI_CPU_RATE),
    });
  }
  await open(page);
  const original = (await diag(page)).versionId;
  await clickControl(page, '[data-mode="label"]');
  const r = await page.locator("#viewer canvas").boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height * 0.45);
  const note = page.locator("#mark-note-text");
  await note.fill("Before the outage");
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  await context.setOffline(true);
  await note.fill("Keep this on the earlier version");
  await expect(page.locator("#submit-feedback")).toBeDisabled();
  fs.copyFileSync(
    "tmp/samples/bunny-figurine.glb",
    `${environment.workspace}/next.glb`,
  );
  await environment.ipc("/publish", {
    file: "next.glb",
    name: "Next version",
    version: "v2",
  });
  // Hold polling until the offline draft has saved. This is the ordering a
  // slow renderer can reach naturally when a save finishes before its poll.
  let releasePoll;
  const pollGate = new Promise((resolve) => (releasePoll = resolve));
  await page.route("**/api/state?**", async (route) => {
    await pollGate;
    await route.continue();
  });
  await context.setOffline(false);
  await note.fill("Keep this on the earlier versio");
  await note.fill("Keep this on the earlier version");
  await expect.poll(async () => (await diag(page)).dirty).toBe(false);
  releasePoll();
  await expect.poll(async () => (await diag(page)).versions.length).toBe(2);
  await expect(page.locator("#submit-feedback")).toBeEnabled();
  expect((await diag(page)).versionId).toBe(original);
  await page.locator("#submit-feedback").click();
  await expect
    .poll(async () => {
      const batches = await environment.ipc("/submissions");
      return batches.find((b) => b.versionId === original)?.annotations[0]
        ?.note;
    })
    .toBe("Keep this on the earlier version");
  // A successful Send releases the outage hold; normal following resumes.
  await expect
    .poll(async () => (await diag(page)).versionId)
    .not.toBe(original);
});
