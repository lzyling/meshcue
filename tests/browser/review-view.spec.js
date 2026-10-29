import { clickControl, selectSetting } from "./r12-b-helpers.mjs";
import { expectCameraUnchanged } from "./camera-assertions.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { trackGpuTextures, gpuTextureSnapshot } from "./gpu-textures.mjs";
import { withEmbeddedTexture } from "../fixtures/textured-glb.mjs";
import { test, expect } from "./fixtures.mjs";
import {
  useReviewServer,
  repo,
  url,
  dir,
  env,
  publish,
  ready,
  point,
  writePlate,
  pin,
} from "./review-fixture.mjs";

/* Looking at the model: layouts, display and texture handling, the
   orientation cube, turning, zooming, and language and theme. */
useReviewServer();

test("compact viewport remains usable without page-wide horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await clickControl(page, '[data-mode="fill"]');
  // The tool's own control has room at this width; it was the brush's size
  // slider that stood here before the brush was shelved.
  await expect(page.locator("#fill-range")).toBeVisible();
  await page.screenshot({
    path: path.resolve(
      path.join(dir, "2026-09-09-3d-review-v02-compact-tested.png"),
    ),
    fullPage: true,
  });
});

test("generated textured GLB releases its GPU textures on every switch to STL", async ({
  page,
}) => {
  test.setTimeout(90000);
  const textured = path.join(dir, "textured-bracket.glb");
  fs.writeFileSync(
    textured,
    withEmbeddedTexture(fs.readFileSync("tmp/samples/parametric-bracket.glb")),
  );
  const stl = writePlate();
  await trackGpuTextures(page);
  await ready(page);
  const baseline = await gpuTextureSnapshot(page);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const file of [textured, stl]) {
      const result = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "scripts/reviewctl.mjs",
            "publish",
            file,
            "--name",
            "Texture lifecycle fixture",
            "--version",
            `cycle-${cycle}`,
          ],
          { cwd: repo, env, encoding: "utf8" },
        ),
      );
      await expect
        .poll(() =>
          page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
        )
        .toBe(result.model.id);
      await expect(page.locator("#loading")).toBeHidden();
      if (file === textured) {
        // Prove the test actually uploads its image: a missing/unused texture
        // must not turn the subsequent cleanup assertion into a vacuous pass.
        await expect
          .poll(async () => (await gpuTextureSnapshot(page)).count)
          .toBe(baseline.count + 1);
        const uploaded = await gpuTextureSnapshot(page);
        expect(uploaded.objects).toHaveLength(baseline.objects.length + 1);
      } else {
        // r186 owns a 16x16 DFG_LUT even before a textured model is loaded.
        // Match the actual pre-model WebGL objects, not a hard-coded count
        // of zero (or one), so a retained model texture still fails this test.
        await expect.poll(() => gpuTextureSnapshot(page)).toEqual(baseline);
      }
    }
  }
});

test("real textured GLB, large mesh and STL load sequentially without retaining old GPU resources", async ({
  page,
}) => {
  test.setTimeout(180000);
  // These are real models from the developer's own media library, not fixtures
  // this repository ships or generates: a textured GLB, the same head at full
  // density, and an STL. The case is worth keeping — nothing generated stresses
  // texture upload the way it does — but on a clone that does not have them it
  // has to say so instead of failing, the way the LAN case already does.
  const heavy = [
    ["TRex_Head_retopo.glb", "恐龍頭 · 重拓撲"],
    ["TRex_Head_baked.glb", "恐龍頭 · 高面數"],
    ["3dbenchy.stl", "STL 小船"],
  ];
  test.skip(
    !heavy.every(([file]) =>
      fs.existsSync(path.join(repo, "../../media/3d", file)),
    ),
    "needs the local media library: media/3d/TRex_Head_*.glb and 3dbenchy.stl",
  );
  await trackGpuTextures(page);
  await ready(page);
  const baseline = await gpuTextureSnapshot(page);
  const metrics = [];
  for (const [file, name] of [...heavy, ...heavy]) {
    const t = Date.now();
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/reviewctl.mjs",
          "publish",
          // A copy inside the clone: the library is outside what the server
          // will publish from, and is only read here to decide to run at all.
          (fs.copyFileSync(
            path.join(repo, "../../media/3d", file),
            path.join(dir, file),
          ),
          path.join(dir, file)),
          "--name",
          name,
          "--version",
          "format-check",
        ],
        { cwd: repo, env, encoding: "utf8" },
      ),
    );
    await expect
      .poll(
        () =>
          page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
        { timeout: 60000 },
      )
      .toBe(result.model.id);
    await expect(page.locator("#loading")).toBeHidden();
    const d = await page.evaluate(() => window.__reviewDiagnostics());
    expect(d.viewer.geometries).toBeLessThanOrEqual(d.viewer.meshes + 2);
    if (file.endsWith(".stl")) {
      await expect.poll(() => gpuTextureSnapshot(page)).toEqual(baseline);
    } else {
      await expect
        .poll(async () => (await gpuTextureSnapshot(page)).count)
        .toBeGreaterThan(baseline.count);
    }
    metrics.push({
      file,
      sourceTriangles: result.model.triangles,
      bytes: result.model.bytes,
      loadMs: Date.now() - t,
      ...d.viewer,
    });
    await page.screenshot({
      path: path.resolve(
        path.join(
          dir,
          `2026-09-09-3d-review-v02-real-${file.split(".")[0]}.png`,
        ),
      ),
      fullPage: true,
    });
  }
  fs.writeFileSync(
    path.join(dir, "model-metrics.json"),
    JSON.stringify(metrics, null, 2),
  );
  console.log("REAL MODEL METRICS", JSON.stringify(metrics));
});

test("narrow embedded review fixture remains interactive without a duplicated conversation", async ({
  page,
}) => {
  await page.route(`${url}/host-fixture`, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<style>body{margin:0;display:flex}aside{flex:1}iframe{width:460px;height:850px;border:0}</style><aside>Original conversation fixture — not Control UI</aside><iframe name="review" src="${url}/"></iframe>`,
    }),
  );
  await page.goto(`${url}/host-fixture`);
  const frame = page.frame({ name: "review" });
  await expect(frame.locator("#loading")).toBeHidden();
  expect(
    await frame.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(frame.locator("#chat-input")).toHaveCount(0);
  await clickControl(frame, '[data-mode="label"]');
  const box = await frame.locator("#viewer").boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await expect
    .poll(() =>
      frame.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(1);
  await expect(frame.locator("#save-status")).toHaveText("Draft saved");
  await frame.getByRole("button", { name: /Send to Agent/ }).click();
  await expect(frame.locator("#feedback-status")).toContainText(
    "delivered to the original conversation",
  );
});

test("medium and wide review layouts do not retain an empty chat column", async ({
  page,
}) => {
  await ready(page);
  for (const width of [900, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await page.locator(".review-panel").boundingBox();
    expect(box.width).toBeGreaterThan(width * 0.95);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("iteration: no heading row above the model, and saving is still said", async ({
  page,
}) => {
  await ready(page);
  // A name that arrived with the link, a version the tab strip already carries
  // and a word about saving held a whole row across the top of the page. The
  // height is the model's now.
  expect(await page.locator(".model-heading").count()).toBe(0);
  const panel = await page.locator(".review-panel").boundingBox();
  const shell = await page.locator(".viewer-shell").boundingBox();
  expect(shell.y - panel.y).toBeLessThan(16);
  // Taking the row away is not the same as going quiet. The state is still
  // written down where a screen reader reaches it, and a save that fails still
  // says so out loud in a toast.
  await expect(page.locator("#save-status")).toHaveText("No marks yet");
  const said = await page.locator(".review-panel > .sr-only").boundingBox();
  expect(said.height).toBeLessThanOrEqual(1);
});

test("iteration: the orientation cube sits in the corner it is read from", async ({
  page,
}) => {
  await ready(page);
  const shell = await page.locator(".viewer-shell").boundingBox();
  const cube = await page.locator(".orient-stage").boundingBox();
  // It was parked a row below the top, clearing a pill that never appears on
  // that side — which reads as a widget that drifted out of its corner.
  expect(cube.y - shell.y).toBeLessThan(16);
  expect(shell.x + shell.width - (cube.x + cube.width)).toBeLessThan(16);
});

test("iteration: marks visibility lives in Display toolbar and plain colour in Style menu", async ({
  page,
}) => {
  await ready(page);
  const marks = page.locator('.toolbar [data-menu="display"] #toggle-marks');
  await page.locator("#display-toggle").click();
  const plain = page.locator('#display-menu [role="menuitemcheckbox"]');
  // They used to float over the model in a corner of their own, which is the
  // one place on the page that is meant to be the model.
  await expect(marks).toBeVisible();
  await expect(plain).toBeVisible();
  const iconOf = (b) => b.locator("use").getAttribute("href");
  expect(await iconOf(marks)).toBe("#mc-eye");
  await expect(marks).toHaveAttribute("aria-label", "Hide marks");
  // Named on the face like every other button in the row. The caption is what
  // the switch is about; the icon is which way it is set.
  await expect(marks.locator("span")).toHaveText("Marks");
  await expect(plain.locator(".menu-option-label")).toHaveText(
    "Plain colour (ignore model colours)",
  );
  await clickControl(page, "#toggle-marks");
  expect(await iconOf(marks)).toBe("#mc-eye-off");
  // Redrawing the icon must not take the caption with it.
  await expect(marks.locator("span")).toHaveText("Marks");
  await expect(marks).toHaveAttribute("aria-pressed", "false");
  await expect(marks).toHaveAttribute("aria-label", "Show marks");
  await clickControl(page, "#neutral-view");
  await expect(plain).toHaveAttribute("aria-checked", "true");
  await expect(plain).toHaveAttribute("title", "Original colours");
  await expect(page.locator("#display-toggle")).toHaveClass(/neutral-active/);
  // Picking a tool brings the marks back, so the switch has to admit it.
  await clickControl(page, '[data-mode="label"]');
  expect(await iconOf(marks)).toBe("#mc-eye");
  await expect(marks).toHaveAttribute("aria-pressed", "true");
});

test("iteration: the options panel is gone whenever the tool has no options", async ({
  page,
}) => {
  await ready(page);
  const panel = page.locator("#tool-options");
  const palette = page.locator(".palette");
  // The page opens on the orbit tool, so the colours must already be gone —
  // not merely gone once some other tool has been visited first.
  await expect(palette).toBeHidden();
  await expect(panel).toBeHidden();
  await clickControl(page, '[data-mode="label"]');
  await expect(palette).toBeVisible();
  await expect(panel).toBeVisible();
  await clickControl(page, '[data-mode="orbit"]');
  await expect(palette).toBeHidden();
  // An empty frame still reads as a window that failed to close.
  await expect(panel).toBeHidden();
});

test("iteration: colored texture survives annotation, hide and neutral display round trips", async ({
  page,
}) => {
  await ready(page);
  const texture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ef3030";
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = "#2050ef";
    context.fillRect(0, 0, 16, 16);
    context.fillRect(16, 16, 16, 16);
    return canvas.toDataURL("image/png");
  });
  const original = fs.readFileSync(
    path.resolve("tmp/samples/parametric-bracket.glb"),
  );
  const jsonSize = original.readUInt32LE(12);
  const doc = JSON.parse(original.toString("utf8", 20, 20 + jsonSize));
  doc.images = [{ uri: texture }];
  doc.textures = [{ source: 0 }];
  doc.extensionsUsed = [
    ...new Set([...(doc.extensionsUsed || []), "KHR_materials_unlit"]),
  ];
  for (const material of doc.materials) {
    material.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
    material.extensions = { KHR_materials_unlit: {} };
  }
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const header = Buffer.from(original.subarray(0, 20));
  const tail = original.subarray(20 + jsonSize);
  header.writeUInt32LE(20 + padded.length + tail.length, 8);
  header.writeUInt32LE(padded.length, 12);
  const file = path.join(dir, "colored-texture.glb");
  fs.writeFileSync(file, Buffer.concat([header, padded, tail]));
  const model = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        file,
        "--name",
        "彩色貼圖驗證",
        "--version",
        "color-proof",
      ],
      { cwd: repo, env, encoding: "utf8" },
    ),
  ).model;
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.versionId),
    )
    .toBe(model.id);
  await expect(page.locator("#loading")).toBeHidden();
  const canvas = page.locator("#viewer canvas");
  const box = await canvas.boundingBox();
  // Compare model pixels, excluding the deliberately changing toolbar/list receipts.
  // The toolbar and its options moved from the left edge to a bottom-centred
  // cluster, so the band that has to stay out of the comparison is the bottom
  // of the canvas rather than its left side.
  const capture = () =>
    page.screenshot({
      clip: {
        x: box.x + box.width * 0.25,
        y: box.y + box.height * 0.15,
        width: box.width * 0.53,
        height: box.height * 0.52,
      },
    });
  const clean = await capture();
  const cleanCamera = await page.evaluate(
    () => window.__reviewDiagnostics().camera,
  );
  async function colors(bytes) {
    return page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let red = 0,
        blue = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > pixels[i + 2] * 1.5 && pixels[i] > 100) red++;
        if (pixels[i + 2] > pixels[i] * 1.5 && pixels[i + 2] > 100) blue++;
      }
      return { red, blue };
    }, bytes.toString("base64"));
  }
  const colored = await colors(clean);
  expect(colored.red).toBeGreaterThan(1000);
  expect(colored.blue).toBeGreaterThan(1000);
  await pin(page);
  await clickControl(page, '[data-mode="fill"]');
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().annotationCount),
    )
    .toBe(2);
  const annotations = await page.evaluate(
    () => window.__reviewDiagnostics().annotations,
  );
  expect((await capture()).equals(clean)).toBe(false);
  await page.screenshot({
    path: path.resolve(
      path.join(dir, "2026-09-09-3d-review-v03-colored-annotations.png"),
    ),
  });
  await clickControl(page, "#toggle-marks");
  const hidden = await capture();
  expectCameraUnchanged(
    await page.evaluate(() => window.__reviewDiagnostics().camera),
    cleanCamera,
  );
  expect(hidden.equals(clean)).toBe(true);
  await clickControl(page, "#neutral-view");
  const neutral = await colors(await capture());
  expect(neutral.red + neutral.blue).toBeLessThan(100);
  await clickControl(page, "#neutral-view");
  expect((await capture()).equals(clean)).toBe(true);
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotations),
  ).toEqual(annotations);
});

test("a cube face reframes from a named side without changing the framing", async ({
  page,
}) => {
  publish();
  await ready(page);
  // Model readiness precedes the overlay ResizeObserver's initial fit. Take
  // the baseline after that layout frame, so this compares the cube action
  // with the settled framing rather than with the provisional loading fit.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  const spun = await page.locator("#orient-cube").getAttribute("style");
  await page.locator('.orient-face[data-view="1,0,0"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { position, target } = window.__reviewDiagnostics().camera;
        return Math.abs(position[1] - target[1]);
      }),
    )
    .toBeLessThan(0.01);
  const after = await page.evaluate(() => window.__reviewDiagnostics().camera);
  // Looking from +X: level with the target and square on to it.
  expect(after.position[0]).toBeGreaterThan(after.target[0]);
  expect(Math.abs(after.position[2] - after.target[2])).toBeLessThan(0.01);
  // The side changed; what is being looked at, and how closely, did not.
  // Camera interpolation can round an unchanged target in its last bits.
  // Match the eight-decimal camera tolerance used by the restore regression.
  after.target.forEach((value, i) =>
    expect(value).toBeCloseTo(before.target[i], 8),
  );
  const span = (c) => Math.hypot(...c.position.map((v, i) => v - c.target[i]));
  expect(Math.abs(span(after) - span(before))).toBeLessThan(0.01);
  // The compass followed rather than sat still. Polled, because the camera
  // moves on the click and the compass on the frame after it.
  await expect
    .poll(() => page.locator("#orient-cube").getAttribute("style"))
    .not.toBe(spun);
});

/* A look straight down or straight up used to lay the up vector along the
   floor, and OrbitControls reads that vector once, when it is built. The orbit
   went on turning about +Y while every frame was aimed by ±Z, so the right
   button turned the model some other way -- a sideways drag hardly turned it at
   all -- until a side face or home put the vector back. */

test("the right button turns the model the same way after a look straight down or up", async ({
  page,
}) => {
  publish();
  await ready(page);
  const view = () =>
    page.evaluate(() => {
      const d = window.__reviewDiagnostics();
      const [p, t] = [d.camera.position, d.camera.target];
      const span = Math.hypot(...p.map((v, i) => v - t[i]));
      return {
        up: d.cameraUp,
        screenUp: d.screenUp,
        height: (p[1] - t[1]) / span,
      };
    });
  const turnSideways = async () => {
    const p = await point(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(p.x + 150, p.y, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(1200); // orbit damping settles
  };
  // The bottom face is on the far side of the cube from home: reach it by the
  // front-bottom edge, as a reviewer does.
  const sides = [
    { path: ["0,1,0"], height: 1, screenZ: -1 },
    { path: ["0,-1,1", "0,-1,0"], height: -1, screenZ: 1 },
  ];
  for (const side of sides) {
    await page.locator("#home-view").click();
    for (const face of side.path) {
      await page.locator(`[data-view="${face}"]`).click();
      await page.waitForTimeout(900);
    }
    await expect
      .poll(async () => (await view()).height * side.height)
      .toBeGreaterThan(0.9999);
    const before = await view();
    expect(before.up).toEqual([0, 1, 0]);
    // The same picture the floor-bound up vector gave: -Z at the top of the
    // screen from above, +Z from below.
    expect(before.screenUp[2] * side.screenZ).toBeGreaterThan(0.99);
    await turnSideways();
    const after = await view();
    expect(after.up).toEqual([0, 1, 0]);
    // Still looking straight down or up, and the picture turned with the drag
    // -- about the vertical, as it does from anywhere else.
    expect(after.height * side.height).toBeGreaterThan(0.999);
    const cos = before.screenUp.reduce(
      (n, v, i) => n + v * after.screenUp[i],
      0,
    );
    expect(Math.acos(Math.min(1, cos))).toBeGreaterThan(0.35);
  }
  await page.locator("#home-view").click();
  await expect
    .poll(async () => (await view()).screenUp[1])
    .toBeGreaterThan(0.8);
});

/* STEP and STL carry no up axis, and MeshCue gives them +Z. The same plate,
   20 × 15 × 8 mm and modelled flat, used to stand on its long edge: the 15 mm
   side went up the screen and the 8 mm one into it. */

test("a STEP and an STL stand on +Z", async ({ page }) => {
  const stl = writePlate();
  // Fitted into three units by the long side: 20 → 3, so 8 → 1.2 and 15 → 2.25.
  const standing = [3, 1.2, 2.25];
  for (const [file, version] of [
    ["tests/fixtures/plate.step", "step"],
    [stl, "stl"],
  ]) {
    execFileSync(
      process.execPath,
      ["scripts/reviewctl.mjs", "publish", file, "--version", version],
      { cwd: repo, env, encoding: "utf8" },
    );
    await ready(page);
    const extent = await page.evaluate(
      () => window.__reviewDiagnostics().viewer.extent,
    );
    extent.forEach((v, i) => expect(v).toBeCloseTo(standing[i], 2));
  }
});

/* Six named sides are the views you can describe; the three-quarter views are
   the ones a modeller actually works from, and until the edges and corners were
   clickable there was no way to reach one except by dragging until it looked
   about right. */

test("an edge and a corner are three-quarter views you can click", async ({
  page,
}) => {
  publish();
  await ready(page);
  await expect(page.locator(".orient-region")).toHaveCount(26);
  await expect(page.locator(".orient-face")).toHaveCount(6);

  const direction = async () => {
    const c = await page.evaluate(() => window.__reviewDiagnostics().camera);
    const d = c.position.map((v, i) => v - c.target[i]);
    const n = Math.hypot(...d);
    return d.map((v) => v / n);
  };
  for (const view of ["1,0,1", "1,1,1"]) {
    // Playwright refuses a click the page would not deliver, so this is also
    // the assertion that nothing is sitting on top of the region.
    await page.locator(`.orient-region[data-view="${view}"]`).click();
    const want = view.split(",").map(Number);
    const n = Math.hypot(...want);
    await expect
      .poll(async () => {
        const got = await direction();
        return Math.max(...got.map((v, i) => Math.abs(v - want[i] / n)));
      })
      .toBeLessThan(0.01);
  }
});

/* Reaching a region is not the same as its centre being clickable, and the
   difference is where this went wrong: drawn as clipped triangles, the corners
   kept their outline and lost most of their hit area, leaving two dozen
   viewpoints from which a visible corner could not be clicked anywhere at all.
   So measure the target a reviewer actually has, not one convenient point. */

test("every region a reviewer can see is a target they can hit", async ({
  page,
}) => {
  publish();
  await ready(page);
  const worst = await page.evaluate(() => {
    const cube = document.getElementById("orient-cube");
    const was = cube.style.transform;
    const dirs = [...cube.children].map((e) =>
      e.dataset.view.split(",").map(Number),
    );
    const unit = (d) => {
      const n = Math.hypot(...d);
      return d.map((v) => v / n);
    };
    let found = null;
    for (const cam of dirs) {
      const u = unit(cam);
      const [yaw, pitch] = [
        (Math.atan2(u[0], u[2]) * 180) / Math.PI,
        (Math.asin(u[1]) * 180) / Math.PI,
      ];
      cube.style.transform = `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`;
      for (const el of cube.children) {
        const v = unit(el.dataset.view.split(",").map(Number));
        const facing = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        if (facing < 0.25) continue; // edge on, or round the back
        const b = el.getBoundingClientRect();
        let px = 0;
        for (let x = Math.floor(b.x); x <= Math.ceil(b.right); x += 2)
          for (let y = Math.floor(b.y); y <= Math.ceil(b.bottom); y += 2)
            if (document.elementFromPoint(x, y) === el) px++;
        if (!found || px < found.px)
          found = {
            px,
            region: el.dataset.view,
            kind: el.dataset.kind,
            from: cam.join(","),
          };
      }
    }
    cube.style.transform = was;
    return found;
  });
  // Four sampled pixels is a target roughly 6px across: small, but aimable.
  expect(worst, `smallest target: ${JSON.stringify(worst)}`).toBeTruthy();
  expect(worst.px, `smallest target: ${JSON.stringify(worst)}`).toBeGreaterThan(
    4,
  );
});

/* The cube projects well outside the box it occupies, and the reset button sits
   directly beneath it. Given only its flat size it leans over that button at
   some angles and swallows the click — with nothing on screen to explain why
   the button stopped working. */

test("the reset-view button stays clickable at every angle", async ({
  page,
}) => {
  publish();
  await ready(page);
  const covered = await page.evaluate(() => {
    const cube = document.getElementById("orient-cube");
    const home = document.getElementById("home-view");
    const was = cube.style.transform;
    const b = home.getBoundingClientRect();
    const probes = [
      [b.x + b.width / 2, b.y + b.height / 2],
      [b.x + 3, b.y + 3],
      [b.x + b.width - 3, b.y + 3],
    ];
    const hits = [];
    for (let yaw = 0; yaw < 360; yaw += 10)
      for (let pitch = -90; pitch <= 90; pitch += 10) {
        cube.style.transform = `rotateX(${-pitch}deg) rotateY(${-yaw}deg)`;
        for (const [x, y] of probes)
          if (!document.elementFromPoint(x, y)?.closest("#home-view"))
            hits.push(`${yaw}/${pitch}`);
      }
    cube.style.transform = was;
    return hits.slice(0, 5);
  });
  expect(covered).toEqual([]);
  await page.locator("#home-view").click();
});

test("the reviewer can overrule the automatic language and theme", async ({
  page,
}) => {
  await ready(page);
  // Dark was decided by a media query, which script cannot overrule — so the
  // case that could not be expressed is this one: the system says dark and the
  // reviewer wants light anyway.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("dark");
  const darkCanvas = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.background,
  );
  await selectSetting(page, "#theme-choice", "light");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("light");
  // The page repaints itself from CSS variables; the model is painted by us and
  // will not, so a switch that leaves the canvas dark is a switch that failed.
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.background),
    )
    .not.toBe(darkCanvas);
  // The system moving on does not undo a decision that was made deliberately.
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe("light");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe("light");

  // Language: the control existed in full — catalogues, matching, storage — and
  // nothing in the product ever called setLocale. Six languages, no way in.
  await expect(page.locator("#locale-choice")).toHaveValue("en");
  await selectSetting(page, "#locale-choice", "ja");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#locale-choice")).toHaveValue("ja");
  await expect(
    page.getByRole("button", { name: "エージェントへ送る" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ja");
  // A language is named in its own language; finding 日本語 must not require
  // already reading the language you are trying to leave.
  expect(
    await page.locator("#locale-choice option[value='zh-Hans']").textContent(),
  ).toBe("简体中文");
});

test("the wheel zooms and Shift+wheel pans, whatever is turning it", async ({
  page,
}) => {
  await ready(page);
  const p = await point(page);
  await page.mouse.move(p.x, p.y);

  /* Nothing is chosen or detected first, and that is the point. The page used
     to guess mouse-or-trackpad from the size of the deltas, which macOS makes
     unanswerable — it accelerates a mouse wheel into the same small fractional
     stream a trackpad sends — so every Mac was read as a trackpad and had its
     wheel turned into a pan. The gestures no longer depend on the answer. */
  const start = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(200);
  const zoomed = await page.evaluate(() => window.__reviewDiagnostics().camera);
  // Cursor-directed zoom shifts the pivot across the screen plane while
  // increasing the orbit distance; it must still preserve the view direction.
  const offset = (c) =>
    new THREE.Vector3(...c.position).sub(new THREE.Vector3(...c.target));
  expect(offset(zoomed).length()).toBeGreaterThan(offset(start).length());
  expect(offset(zoomed).normalize().dot(offset(start).normalize())).toBeCloseTo(
    1,
    8,
  );
  expect(zoomed.position).not.toEqual(start.position);

  // Pan is Shift plus that same gesture — two fingers or a wheel, either way.
  const before = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(40, 60);
  await page.waitForTimeout(200);
  const panned = await page.evaluate(() => window.__reviewDiagnostics().camera);
  await page.keyboard.up("Shift");
  // Panning translates the pivot; cursor-directed zoom may also translate it.
  expect(panned.target).not.toEqual(before.target);
  const travelled = Math.hypot(
    panned.target[0] - before.target[0],
    panned.target[1] - before.target[1],
    panned.target[2] - before.target[2],
  );
  expect(travelled).toBeGreaterThan(0.001);
  // Nothing about this places marks or disturbs the review.
  expect(
    await page.evaluate(() => window.__reviewDiagnostics().annotationCount),
  ).toBe(0);
});
