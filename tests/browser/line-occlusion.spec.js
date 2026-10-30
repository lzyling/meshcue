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

  /* Drawn double-sided, nothing is set aside by facing and the pixel test
     alone decides. The rear bottom edge seen from (5, 2, 10) lies a third of
     a pixel inside the part's own outline at 800 px orthographic: deciding
     by the pixel centres either side is half a pixel out, and this is where
     it showed. Every view, both face sources, at drawing-buffer ratio 1. */
  test(`double-sided marks hide the rear edges of a 0.015 mm part (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.thinMark);
    const results = [];
    for (const kind of ["edge", "part"])
      for (const faces of ["brep", "mesh"])
        for (const eye of [
          [5, 2, 10],
          [9, 3, 4],
          [2, 7, 7],
        ]) {
          const result = await page.evaluate((o) => window.thinMark(o), {
            projection,
            kind,
            faces,
            eye,
            double: true,
          });
          const name = `thin-double-${projection}-${kind}-${faces}-${eye.join("_")}`;
          results.push({ name, ...result });
        }
    // Nor may it take the visible rim: the rear face's right and top edges,
    // a fraction of a pixel outside the front face, where the right and top
    // faces turn to the eye (in perspective only from (9, 3, 4): the others
    // see one of them edge on). Drawn whole, double-sided or not.
    for (const double of [true, false])
      for (const faces of ["brep", "mesh"])
        for (const eye of projection === "perspective"
          ? [[9, 3, 4]]
          : [
              [5, 2, 10],
              [9, 3, 4],
              [2, 7, 7],
            ]) {
          const result = await page.evaluate((o) => window.thinMark(o), {
            projection,
            kind: "edge",
            faces,
            eye,
            double,
            rim: true,
          });
          const name = `thin-rim-${projection}-${double ? "double" : "single"}-${faces}-${eye.join("_")}`;
          results.push({ name, ...result });
        }
    fs.writeFileSync(
      `tmp/evidence/${phase}/thin-double-marks-${projection}.json`,
      JSON.stringify(results, null, 2),
    );
    for (const result of results) {
      expect(result.hidden, result.name).toBe(0);
      expect(result.front, result.name).toBeGreaterThan(500);
      expect(result.coverage, result.name).toBe(1);
    }
  });

  /* What the rule above must not take: a double-sided open roof seen from
     below, its ridge turned away on both sides and in plain sight. */
  test(`double-sided marks seen from behind their faces stay whole (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.backRoof);
    const results = [];
    for (const kind of ["edge", "part"])
      for (const faces of ["brep", "mesh"])
        for (const eye of [
          [3, -5, 2],
          [-4, -3, -3],
          [1, -6, 0.3],
        ]) {
          const result = await page.evaluate((o) => window.backRoof(o), {
            projection,
            kind,
            faces,
            eye,
          });
          results.push({
            name: `back-roof-${projection}-${kind}-${faces}-${eye.join("_")}`,
            ...result,
          });
        }
    fs.writeFileSync(
      `tmp/evidence/${phase}/back-roof-${projection}.json`,
      JSON.stringify(results, null, 2),
    );
    for (const result of results) {
      expect(result.total, result.name).toBeGreaterThan(200);
      expect(result.coverage, result.name).toBe(1);
    }
  });

  /* Known limitation, kept as a test of what should happen. The same roof
     narrowed to a strip a fraction of a pixel wide on both sides: still
     double-sided, still open, still turned away on both sides and in plain
     sight, so its ridge mark should be drawn whole. It is not. A line seen
     from behind its double-sided faces is shown only where a pixel's front
     surface is one of its own faces, and two panels this thin cover almost
     no pixel centre, so the edge mark breaks up (0.0003) or vanishes
     (0.0001, orthographic). Fixing it needs another way to sample whether a
     sub-pixel face is in front, not a looser tolerance. The part outline of
     the same strip, and display edges, are unaffected, and that much is
     asserted outright before the case is marked as expected to fail, so a
     fixture that stops rendering fails for real rather than as expected.
     When the edge mark is fixed this starts passing, Playwright reports
     that, and the marking comes off. */
  test(`double-sided marks on a sub-pixel open strip seen from behind stay whole (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.backRoof);
    const results = [];
    for (const width of [0.0003, 0.0001])
      for (const kind of ["edge", "part"]) {
        const result = await page.evaluate((o) => window.backRoof(o), {
          projection,
          kind,
          width,
        });
        results.push({
          name: `narrow-roof-${projection}-${kind}-${width}`,
          kind,
          ...result,
        });
      }
    fs.writeFileSync(
      `tmp/evidence/${phase}/narrow-roof-${projection}.json`,
      JSON.stringify(results, null, 2),
    );
    for (const result of results.filter((r) => r.kind === "part")) {
      expect(result.total, result.name).toBeGreaterThan(200);
      expect(result.coverage, result.name).toBe(1);
    }
    test.fail(
      true,
      "Known limitation: edge marks on a double-sided open strip whose faces are both turned away and both narrower than a pixel break up or vanish.",
    );
    for (const result of results.filter((r) => r.kind === "edge"))
      expect(result.coverage, result.name).toBeGreaterThan(0.95);
  });

  /* The same part stored at coordinates far from its origin, the mesh moved
     back to the same place: nothing in the world differs, so neither may
     what is drawn. Finding a segment's faces must not count the distance
     from the origin as model size, or the front wall 0.015 away counts as
     the rear edge's own face. */
  test(`marks on a part stored far from its origin hide the same rear edges (${projection})`, async ({
    page,
  }) => {
    await page.goto(url);
    await page.waitForFunction(() => window.thinMark);
    const results = [];
    for (const offset of [
      [1e5, 0, 0],
      [-1e5, 1e5, 0],
    ])
      for (const kind of ["edge", "part"])
        for (const faces of ["brep", "mesh", "pending"])
          for (const eye of [
            [5, 2, 10],
            [9, 3, 4],
          ]) {
            const result = await page.evaluate((o) => window.thinMark(o), {
              projection,
              kind,
              faces,
              eye,
              offset,
            });
            const name = `thin-far-${projection}-${kind}-${faces}-${eye.join("_")}-${offset.join("_")}`;
            results.push({ name, ...result });
          }
    fs.writeFileSync(
      `tmp/evidence/${phase}/thin-far-marks-${projection}.json`,
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
