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
