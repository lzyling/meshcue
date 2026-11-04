import { test, expect } from "./fixtures.mjs";
import { createServer } from "vite";
import fs from "node:fs";

/* Zooming out used to cost depth precision in proportion to the distance:
   the near plane sat at a ten-thousandth of it, so the depth buffer's step
   at the model was about 0.06% of the viewing distance and grew with every
   notch of the wheel. Two faces 0.4 mm apart run together from well under a
   metre away. The fixture draws that, a white insert 0.4 mm above a red base
   in a ~500 mm assembly, through the real viewer, at the fitted distance,
   two and four times it and the zoom limit, and counts red inside the
   insert.

   Fog is turned off for those counts only. It blends toward the backdrop
   from 10 to 35 preview units, so at the zoom limit the model is entirely
   backdrop colour and "no red" would hold whatever the depth buffer did. */
let server, url;
const evidence = `tmp/evidence/depth-precision/${process.env.DEPTH_EVIDENCE || "after"}`;
test.use({ viewport: { width: 1000, height: 1000 } });
test.beforeAll(async () => {
  server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  url = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/depth-precision/`;
  fs.mkdirSync(evidence, { recursive: true });
});
test.afterAll(async () => server?.close());

async function open(page) {
  await page.goto(url);
  await page.waitForFunction(() => window.ready);
  const loaded = await page.evaluate(() => window.ready);
  expect(loaded.meshes).toBe(5);
  expect(await page.evaluate(() => window.viewerError ?? null)).toBeNull();
}
const record = (name, data) =>
  fs.writeFileSync(`${evidence}/${name}.json`, JSON.stringify(data, null, 2));

for (const projection of ["perspective", "orthographic"]) {
  test(`a 0.4 mm insert stays white from fit to the zoom limit (${projection})`, async ({
    page,
  }) => {
    await open(page);
    const results = [];
    for (const tier of [1, 2, 4, "max"]) {
      const placed = await page.evaluate((o) => window.place(o), {
        tier,
        projection,
      });
      const counts = await page.evaluate(() => window.measure());
      const name = `${projection}-${tier}`;
      await page.screenshot({ path: `${evidence}/${name}.png` });
      results.push({ tier, ...placed, ...counts });
      record(name, { tier, ...placed, ...counts });
    }
    for (const r of results) {
      // Large enough at every distance for "no red pixel" to mean something.
      expect(r.coverage, `tier ${r.tier}`).toBeGreaterThan(900);
      expect(r.white, `tier ${r.tier}`).toBeGreaterThan(r.coverage * 0.9);
      expect(r.red, `tier ${r.tier}`).toBe(0);
    }
  });
}

test("a close-up of a 2 mm hole is not cut by the near plane", async ({
  page,
}) => {
  await open(page);
  // Outside the bushing's bounding sphere (radius ~4.4 mm), where near is
  // fitted to it; just inside it and at the closest the zoom limits allow,
  // where the distance-based near plane applies as before.
  for (const mm of [12, 3, 0.6]) {
    const result = await page.evaluate((mm) => window.closeUp({ mm }), mm);
    await page.screenshot({ path: `${evidence}/close-up-${mm}.png` });
    record(`close-up-${mm}`, result);
    expect(result.minDistance).toBeLessThanOrEqual(mm);
    expect(result.near, `${mm} mm`).toBeLessThan(mm);
    if (mm === 12) expect(result.near).toBeGreaterThan(result.legacyNear * 100);
    else expect(result.near, `${mm} mm`).toBeCloseTo(result.legacyNear, 9);
    // The reference keeps the old distance-only near plane, which at these
    // distances is a few micrometres away: anything cut would differ.
    expect(result.differing, `${mm} mm`).toBe(0);
  }
});

test("the ground in front of the model is still drawn when zoomed out", async ({
  page,
}) => {
  await open(page);
  for (const tier of [1, 2, 4]) {
    const result = await page.evaluate(
      (tier) => window.groundView({ tier }),
      tier,
    );
    await page.screenshot({ path: `${evidence}/ground-${tier}.png` });
    record(`ground-${tier}`, result);
    // Near really did move out, to the ground in view rather than the model.
    expect(result.near, `tier ${tier}`).toBeGreaterThan(result.legacyNear);
    expect(result.missing, `tier ${tier}`).toBe(0);
  }
});

/* Besides the parts, the colour pass draws things that are not on them, and
   near must reach those too. A kept measurement between parallel faces is
   read square to them, so one end of its line is on a plane's extension,
   and a circle's ring and centre are off the part it was taken on; seen as
   a reviewer turns and zooms, that end, ring and reading were in front of a
   near plane fitted to the parts, and were cut off once the measurement was
   kept. The lines drawn on surfaces (a region's boundary, the Agent's echo)
   are moved toward the eye in their shader, by a fixed lift and a share of
   the distance; on a small part nearest the camera, seen from far away, that
   took them in front of near too. */
async function openOverlays(page, scene) {
  // Still dashes and no arrival pulse: an echo frame is the same twice.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${url}overlays.html`);
  await page.waitForFunction(() => window.loadScene);
  const loaded = await page.evaluate((name) => window.loadScene(name), scene);
  expect(loaded.meshes).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.viewerError ?? null)).toBeNull();
}

for (const [kind, views] of [
  [
    "planes",
    [
      { direction: [0, 0, 1], tier: 1 },
      { direction: [0, 0, 1], tier: 3 },
      { direction: [0.4, 0.25, 1], tier: 1.5 },
    ],
  ],
  [
    "circle",
    [
      // From above the circle's plane: edge on, its near half would be
      // drawn over its far half.
      { direction: [0, 0.5, 1], tier: 1.5 },
      { direction: [0, 0.5, 1], tier: 4 },
      { direction: [0.3, 0.6, 1], tier: 2 },
    ],
  ],
]) {
  test(`a kept ${kind} measurement keeps its line and reading as the view turns and zooms`, async ({
    page,
  }) => {
    await openOverlays(page, kind);
    const mark = await page.evaluate((k) => window.measureAndKeep(k), kind);
    expect(mark?.kind).toBe(kind);
    for (const [i, view] of views.entries()) {
      const result = await page.evaluate(
        (v) => window.keptMeasureView(v),
        view,
      );
      await page.screenshot({ path: `${evidence}/kept-${kind}-${i}.png` });
      record(`kept-${kind}-${i}`, { view, ...result });
      expect(result.samples, `view ${i}`).toBeGreaterThan(40);
      expect(result.inked, `view ${i}`).toBeGreaterThan(result.samples * 0.9);
      expect(result.anchorInFrame, `view ${i}`).toBe(true);
      expect(result.readingHidden, `view ${i}`).toBe(false);
    }
  });
}

test("a region's boundary and an echo on a small nearest part show at the zoom limit", async ({
  page,
}) => {
  await openOverlays(page, "ball");
  for (const [i, [part, view]] of [
    ["ball", { direction: [0, 0, 1], tier: "max" }],
    ["ball", { direction: [0.2, 0.3, 1], tier: "max" }],
    ["ball", { direction: [0, 0, 1], tier: 1 }],
    ["cube", { direction: [0, 0, 1], tier: "max" }],
    ["cube", { direction: [0.2, 0.3, 1], tier: "max" }],
  ].entries()) {
    const result = await page.evaluate(
      ([v, p]) => window.surfaceLines(v, p),
      [view, part],
    );
    await page.screenshot({ path: `${evidence}/surface-lines-${i}.png` });
    record(`surface-lines-${i}`, { part, view, ...result });
    expect(result.faces, `view ${i}`).toBeGreaterThan(part === "ball" ? 10 : 1);
    expect(result.outline.lines, `view ${i}`).toBeGreaterThan(0);
    expect(result.echo.lines, `view ${i}`).toBeGreaterThan(0);
    // As much as the distance-only near plane draws, which cuts nothing.
    for (const lines of [result.outline, result.echo]) {
      expect(lines.reference, `view ${i}`).toBeGreaterThan(10);
      expect(lines.pixels, `view ${i}`).toBeGreaterThan(lines.reference * 0.9);
    }
  }
});
