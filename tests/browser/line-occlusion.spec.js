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

/* Marks on one part only 0.015 mm thick, seen at an angle: the rear face's
   edges lie just behind the part's own front face. An edge mark and the
   whole-part outline are tested against the faces either side of each
   segment, not against any face of the part, and a segment turned away on
   both sides of a front-faces-only solid is not drawn. Front edges stay whole.
   With file faces, crease patches, and before the patches are built. */
for (const projection of ["perspective", "orthographic"]) {
  test(`marks hide the rear edges of a 0.015 mm part (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.thinMark);
    const results = [];
    const run = async (options) => {
      const result = await page.evaluate((o) => window.thinMark(o), {
        projection,
        ...options,
      });
      const name = `thin-${projection}-${options.kind}-${options.faces}-${options.eye.join("_")}${options.double ? "-double" : ""}`;
      results.push({ name, ...result });
    };
    for (const kind of ["edge", "part"])
      for (const faces of ["brep", "mesh", "pending"])
        for (const eye of [
          [5, 2, 10],
          [9, 3, 4],
          [2, 7, 7],
        ])
          await run({ kind, faces, eye });
    // Drawn double-sided nothing is set aside by facing: own faces decide.
    // The counterexample's own view, 800 px, 30 degrees, from (5, 2, 10).
    if (projection === "perspective")
      for (const kind of ["edge", "part"])
        for (const faces of ["brep", "mesh"])
          await run({ kind, faces, eye: [5, 2, 10], double: true });
    fs.writeFileSync(
      `tmp/evidence/${phase}/thin-marks-${projection}.json`,
      JSON.stringify(results, null, 2),
    );
    for (const result of results) {
      expect(result.hidden, result.name).toBe(0);
      expect(result.front, result.name).toBeGreaterThan(500);
      expect(result.coverage, result.name).toBe(1);
    }
  });

  /* The field shell's cavity edge, 0.015 mm behind the outer fillet, faces
     the eye on both sides: only its own faces can hide it. */
  test(`marks on the field shell stay off the outer fillet (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.fieldMark);
    const results = [];
    for (const kind of ["edge", "part"])
      for (const distance of [500, 1000, 2000]) {
        const result = await page.evaluate((o) => window.fieldMark(o), {
          kind,
          distance,
          projection,
        });
        const name = `field-mark-${kind}-${projection}-${distance}`;
        await page.screenshot({ path: `tmp/evidence/${phase}/${name}.png` });
        results.push({ name, ...result });
      }
    fs.writeFileSync(
      `tmp/evidence/${phase}/field-marks-${projection}.json`,
      JSON.stringify(results, null, 2),
    );
    for (const result of results) {
      expect(result.fillet, result.name).toBe(0);
      expect(result.front, result.name).toBe(1);
      if (result.name.includes("part"))
        expect(result.total, result.name).toBeGreaterThan(200);
    }
  });

  /* A surface the colour pass cuts away by alpha test hides nothing there:
     an edge behind the hole is drawn whole, behind the solid half it is not. */
  test(`alpha-tested holes do not hide the edges behind them (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.cutout);
    const result = await page.evaluate((o) => window.cutout(o), {
      projection,
    });
    await page.screenshot({
      path: `tmp/evidence/${phase}/cutout-${projection}.png`,
    });
    expect(result.hole).toBe(1);
    expect(result.behind).toBe(0);
  });
}
