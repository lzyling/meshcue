import { test, expect } from "./fixtures.mjs";
import { createServer } from "vite";
import fs from "node:fs";
let server, url;
const phase = process.env.LINE_EVIDENCE || "after";
test.beforeAll(async () => {
  server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  url = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/line-occlusion/`;
  fs.mkdirSync(`tmp/evidence/${phase}`, { recursive: true });
});
test.afterAll(async () => server?.close());
async function render(page, options, name) {
  await page.goto(url);
  await page.waitForFunction(() => window.setup);
  await page.evaluate((o) => window.setup(o), options);
  await page.screenshot({ path: `tmp/evidence/${phase}/${name}.png` });
  const pixels = await page.evaluate(() => window.probe());
  fs.writeFileSync(
    `tmp/evidence/${phase}/${name}.json`,
    JSON.stringify(pixels, null, 2),
  );
  if (name.startsWith("thin-wall")) {
    await page.evaluate(({ distance }) => {
      const label = document.createElement("div");
      label.textContent =
        "Red box: internal edges behind 2 mm wall — must contain no magenta ink";
      label.style.cssText =
        "position:absolute;left:20px;top:810px;color:red;font:16px sans-serif";
      document.body.append(label);
      const region = document.createElement("div");
      const w = 180000 / distance,
        h = 150000 / distance;
      region.style.cssText = `position:absolute;pointer-events:none;border:2px solid red;left:${400 - w / 2}px;top:${400 - h / 2}px;width:${w}px;height:${h}px`;
      document.body.append(region);
    }, options);
    await page.screenshot({ path: `tmp/evidence/${phase}/${name}-marked.png` });
  }
  return pixels;
}
for (const projection of ["perspective", "orthographic"]) {
  for (const kind of ["edge", "part"]) {
    test(`${kind} mark is continuous in front and occluded behind (${projection})`, async ({
      page,
    }) => {
      const front = await render(
        page,
        { kind, projection },
        `${kind}-${projection}-front`,
      );
      expect(front.total).toBeGreaterThan(70);
      expect(front.coverage).toBe(1);
      for (const yaw of [0.2, 0.5, 0.9]) {
        const angled = await render(
          page,
          { kind, projection, yaw },
          `${kind}-${projection}-yaw-${yaw}`,
        );
        expect(angled.coverage).toBe(1);
      }
      const back = await render(
        page,
        { kind, projection, back: true },
        `${kind}-${projection}-back`,
      );
      expect(back.total).toBe(0);
      const ghost = await render(
        page,
        { kind, projection, back: true, ghost: true },
        `${kind}-${projection}-ghost`,
      );
      expect(ghost.total).toBeGreaterThan(70);
    });
  }
  for (const distance of [500, 1000, 2000]) {
    test(`2 mm wall hides internal feature edges at ${distance} mm (${projection})`, async ({
      page,
    }) => {
      const pixels = await render(
        page,
        { distance, projection },
        `thin-wall-${projection}-${distance}`,
      );
      expect(pixels.total).toBeGreaterThan(100);
      expect(pixels.coverage).toBe(1);
      expect(pixels.interior).toBe(0);
    });
  }
}

test("local Mac mini v0.4 screenshot evidence", async ({ page }) => {
  test.skip(
    !process.env.LINE_MAC_EVIDENCE,
    "Local read-only STEP sample is not shipped",
  );
  const field = [];
  for (const options of [
    { distance: 500, edge: true, name: "mac-front" },
    { distance: 500, edge: true, back: true, name: "mac-back" },
    { distance: 500, name: "mac-edges-500" },
    { distance: 1000, name: "mac-edges-1000" },
    { distance: 2000, name: "mac-edges-2000" },
    // The field report's three-quarter view of the top right fillet.
    { distance: 500, view: "field", name: "mac-field-500" },
    { distance: 1000, view: "field", name: "mac-field-1000" },
    { distance: 2000, view: "field", name: "mac-field-2000" },
  ]) {
    await page.goto(url);
    await page.waitForFunction(() => window.setupMac);
    const info = await page.evaluate((o) => window.setupMac(o), options);
    fs.writeFileSync(
      `tmp/evidence/${phase}/${options.name}.json`,
      JSON.stringify(info, null, 2),
    );
    await page.screenshot({
      path: `tmp/evidence/${phase}/${options.name}.png`,
    });
    if (options.view) field.push({ name: options.name, ...info });
  }
  for (const pose of field) {
    expect(pose.total, pose.name).toBeGreaterThan(200);
    expect(pose.fillet, pose.name).toBe(0);
  }
});

for (const change of ["reveal", "explode"]) {
  test("first demand frame after " + change, async ({ page }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.firstDemandFrame);
    const result = await page.evaluate(
      (change) => window.firstDemandFrame(change),
      change,
    );
    expect(result.ink).toBe(24964);
    expect(result.renders).toBe(1);
    expect(result.requests).toBe(0);
  });
}
/* A rear edge 0.2 mm behind a cylinder seen at a grazing angle, and genuine
   edges on the curved surface and on steep creases. Depth offsets could not do
   both; face identity does. */
test("grazing curved surface hides close rear edge without breaking visible edge", async ({
  page,
}) => {
  await page.goto(url);
  await page.waitForFunction(() => window.grazing);
  const result = await page.evaluate(() => window.grazing());
  expect(result.hidden).toBe(0);
  expect(result.coverage).toBe(1);
});

/* Field case: an edge 0.015 mm behind a curved wall. No depth tolerance can
   separate the two, so this checks that a line is drawn only where its own
   faces are in front; with file faces and with crease-bounded mesh faces. */
for (const projection of ["perspective", "orthographic"]) {
  test(`thin non-concentric fillet hides cavity edges at every distance (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.fieldShell);
    const results = [];
    for (const brep of [true, false])
      for (const distance of [500, 1000, 2000]) {
        const result = await page.evaluate((o) => window.fieldShell(o), {
          distance,
          projection,
          brep,
        });
        const name = `field-${brep ? "brep" : "mesh"}-${projection}-${distance}`;
        await page.screenshot({ path: `tmp/evidence/${phase}/${name}.png` });
        results.push({ name, ...result });
      }
    fs.writeFileSync(
      `tmp/evidence/${phase}/field-${projection}.json`,
      JSON.stringify(results, null, 2),
    );
    for (const result of results) {
      expect(result.total, result.name).toBeGreaterThan(200);
      expect(result.fillet, result.name).toBe(0);
      expect(result.front, result.name).toBe(1);
      expect(result.tangent, result.name).toBe(1);
    }
  });
}
