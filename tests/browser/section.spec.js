import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
const repo = process.cwd();
const url = "http://127.0.0.1:43174";
const evidence = path.join(repo, "tmp/lane-a-evidence");
let child, dir, env;
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-section-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  env = {
    ...process.env,
    PORT: "43174",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
    REVIEW_SESSION_KEY: "test-only-review-session",
    REVIEW_ALLOWED_HOSTS: "review.test",
    REVIEW_UPDATE_CHECK: "off",
    REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  const log = fs.openSync(path.join(dir, "server.log"), "a");
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env,
    stdio: ["ignore", log, log],
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
});
test.afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
});

// A sealed hollow box: the inner shell's winding points into the cavity. All
// six outer and six inner faces are separate meshes, just like STEP faces.
async function hollowBox() {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((data) => {
        this.result = data;
        this.onloadend?.();
      });
    }
  };
  const group = new THREE.Group();
  for (const [size, inner] of [
    [[20, 15, 8], false],
    [[12, 9, 6], true],
  ]) {
    const box = new THREE.BoxGeometry(...size).toNonIndexed();
    const positions = box.attributes.position.array;
    for (let face = 0; face < 6; face++) {
      const coords = Array.from(positions.slice(face * 18, face * 18 + 18));
      if (inner)
        for (let triangle = 0; triangle < 2; triangle++) {
          const i = triangle * 9;
          const b = coords.slice(i + 3, i + 6);
          coords.splice(i + 3, 3, ...coords.slice(i + 6, i + 9));
          coords.splice(i + 6, 3, ...b);
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(coords, 3),
      );
      geometry.computeVertexNormals();
      group.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: 0xcdd7dc,
            metalness: 0,
            roughness: 0.7,
          }),
        ),
      );
    }
  }
  const bytes = await new GLTFExporter().parseAsync(group, { binary: true });
  const file = path.join(dir, "hollow.glb");
  fs.writeFileSync(file, Buffer.from(bytes));
  return file;
}
async function open(page, file) {
  ctl(
    "publish",
    file || (await hollowBox()),
    "--version",
    "section",
    "--units",
    "mm",
  );
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
}
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());
async function front(page) {
  // Cube faces are keyboard-reachable, without depending on their perspective
  // position or on a debug camera setter that reviewers do not have.
  await page.locator('[data-view="0,0,1"]').press("Enter");
}
async function screen(page, point, format = "glb") {
  const d = await diagnostics(page);
  const box = await page.locator("#viewer").boundingBox();
  const camera = new THREE.PerspectiveCamera(
    38,
    box.width / box.height,
    0.01,
    100,
  );
  camera.position.fromArray(d.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(d.camera.target));
  camera.updateMatrixWorld();
  const [x, y, z] = point;
  const at = new THREE.Vector3(...(format === "glb" ? [x, y, z] : [x, z, -y]))
    .multiplyScalar(0.15)
    .project(camera);
  return {
    x: box.x + ((at.x + 1) * box.width) / 2,
    y: box.y + ((1 - at.y) * box.height) / 2,
  };
}
async function clickAt(page, point) {
  const p = await screen(page, point);
  await page.mouse.click(p.x, p.y);
}
async function section(page, axis = "z") {
  await page.locator("#section-toggle").click();
  await page.locator("#section-axis").selectOption(axis);
}
async function offset(page, value) {
  await page.locator("#section-offset").fill(String(value));
  await page.locator("#section-offset").press("Enter");
}
async function amberPixels(page) {
  const shot = await page.locator("#viewer canvas").screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (
      let i = Math.ceil(canvas.height * 0.2) * canvas.width * 4;
      i < Math.floor(canvas.height * 0.8) * canvas.width * 4;
      i += 4
    )
      if (
        data[i] > 150 &&
        data[i + 1] > 85 &&
        data[i + 1] < data[i] * 0.88 &&
        data[i + 2] < data[i + 1] * 0.65
      )
        count++;
    return count;
  }, shot.toString("base64"));
}

test("section controls clip in model units, flip, hide pins and reset without editing the draft", async ({
  page,
}) => {
  await open(page);
  await front(page);
  await page.locator('[data-mode="label"]').click();
  await clickAt(page, [8, 0, 4]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  const before = await diagnostics(page);
  await page.locator("#section-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#section-options")).toBeVisible();
  await expect(page.locator("#section-offset")).toHaveAttribute("min", "-10");
  await expect(page.locator("#section-offset")).toHaveAttribute("max", "10");
  await expect(page.locator("#section-units")).toHaveText("mm");
  await expect(page.locator(".model-pin")).toBeHidden();
  await clickAt(page, [8, 2, 4]);
  expect((await diagnostics(page)).annotationCount).toBe(1);
  await page.locator("#section-range").fill("9");
  await expect(page.locator("#section-offset")).toHaveValue("9");
  await expect(page.locator(".model-pin")).toBeVisible();
  await offset(page, 0);
  await page.locator("#section-flip").click();
  await expect(page.locator(".model-pin")).toBeVisible();
  await clickAt(page, [-8, 2, 4]);
  expect((await diagnostics(page)).annotationCount).toBe(1);
  expect((await diagnostics(page)).annotations).toEqual(before.annotations);
  await page.locator("#section-off").click();
  await expect(page.locator("#section-toggle")).toBeFocused();
  await clickAt(page, [-8, 2, 4]);
  await expect(page.locator("#annotation-count")).toHaveText("2");
  await section(page, "x");
  await expect(page.locator("#section-offset")).toHaveValue("0");
  await expect(page.locator("#section-flip")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect((await diagnostics(page)).viewer.section).toBeNull();
  await expect(page.locator("#annotation-count")).toHaveText("2");
});

test("amber cut faces reject labels, bucket and measurement while exposed cavity faces accept them", async ({
  page,
}) => {
  await open(page);
  await front(page);
  await section(page);
  expect(await amberPixels(page)).toBeGreaterThan(500);
  await page.locator('[data-mode="label"]').click();
  await clickAt(page, [8, 0, -4]);
  expect((await diagnostics(page)).annotationCount).toBe(0);
  await page.locator('[data-mode="fill"]').click();
  await clickAt(page, [8, 0, -4]);
  expect((await diagnostics(page)).viewer.fillFaces).toBe(0);
  expect((await diagnostics(page)).annotationCount).toBe(0);
  await page.locator('[data-mode="measure"]').click();
  await clickAt(page, [8, 0, -4]);
  expect((await diagnostics(page)).measuring?.picks || 0).toBe(0);
  await clickAt(page, [-2, 0, -3]);
  await clickAt(page, [2, 0, -3]);
  await expect(page.locator("#measure-reading")).toHaveText("4.00 mm");
  await page.locator('[data-mode="label"]').click();
  await clickAt(page, [0, 0, -3]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  const mark = (await diagnostics(page)).annotations[0];
  expect(mark.position[2]).toBeCloseTo(-3);
  expect(mark.view.section).toBeUndefined();
  await page.locator('[data-mode="fill"]').click();
  await clickAt(page, [0, 2, -3]);
  await expect(page.locator("#annotation-count")).toHaveText("2");
  await offset(page, 4);
  expect(await amberPixels(page)).toBe(0);
  await page.locator("#section-off").click();
  expect(await amberPixels(page)).toBe(0);
});

test("section follows STEP source axes and resets when a new version loads", async ({
  page,
}) => {
  await open(page, "tests/fixtures/plate.step");
  await section(page, "z");
  const step = (await diagnostics(page)).viewer.section;
  expect(step.max - step.min).toBeCloseTo(8);
  expect(step.offset).toBeCloseTo((step.min + step.max) / 2);
  expect(await amberPixels(page)).toBeGreaterThan(100);
  ctl("publish", await hollowBox(), "--version", "next");
  await expect
    .poll(async () => (await diagnostics(page)).viewer.section)
    .toBeNull();
  await expect(page.locator("#section-options")).toBeHidden();
  await section(page, "z");
  expect((await diagnostics(page)).viewer.section).toMatchObject({
    axis: "z",
    min: -4,
    max: 4,
    offset: 0,
    flip: false,
  });
});

for (const format of ["glb", "step"])
  test(`section ${format} light and dark evidence`, async ({ page }) => {
    fs.mkdirSync(evidence, { recursive: true });
    await open(
      page,
      format === "step" ? "tests/fixtures/plate.step" : undefined,
    );
    await page.locator('[data-mode="label"]').click();
    // A visible pin on the outside disappears when the Z half facing home is cut.
    const canvas = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.click(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    );
    await expect(page.locator("#annotation-count")).toHaveText("1");
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-choice").selectOption(theme);
      await page.screenshot({
        path: path.join(evidence, `${format}-${theme}-off.png`),
      });
      await section(page, "z");
      await expect(page.locator(".model-pin")).toBeHidden();
      expect(await amberPixels(page)).toBeGreaterThan(100);
      await page.screenshot({
        path: path.join(evidence, `${format}-${theme}-on-hidden-pin.png`),
      });
      await page.locator("#section-off").click();
    }
  });

test("section rough frame-time evidence on the largest generated sample", async ({
  page,
}) => {
  test.setTimeout(120000);
  const samples = fs
    .readdirSync("tmp/samples")
    .filter((f) => f.endsWith(".glb"));
  // Source triangle count, rather than file bytes, selects the heaviest model.
  const { inspectModel } = await import("../../server/models.mjs");
  const models = samples.map((name) => ({
    name,
    triangles: inspectModel(fs.readFileSync(`tmp/samples/${name}`), "glb")
      .triangles,
  }));
  models.sort((a, b) => b.triangles - a.triangles);
  await open(page, `tmp/samples/${models[0].name}`);
  const frames = () =>
    page.evaluate(async () => {
      const spans = [];
      let last;
      for (let i = 0; i < 100; i++) {
        const now = await new Promise(requestAnimationFrame);
        if (i > 20) spans.push(now - last);
        last = now;
      }
      spans.sort((a, b) => a - b);
      return {
        samples: spans.length,
        meanMs: spans.reduce((a, b) => a + b, 0) / spans.length,
        medianMs: spans[Math.floor(spans.length / 2)],
        p95Ms: spans[Math.floor(spans.length * 0.95)],
      };
    });
  const off = await frames();
  await section(page, "x");
  const on = await frames();
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(
    path.join(evidence, "frame-times.json"),
    JSON.stringify(
      {
        model: models[0],
        renderer:
          "Chromium SwiftShader, 1440x1000; requestAnimationFrame intervals, 20 warmup frames then 79 intervals per mode, stationary home camera",
        off,
        on,
        diagnostics: (await diagnostics(page)).viewer,
      },
      null,
      2,
    ),
  );
  expect(on.samples).toBe(79);
});

test("section clips region paint, echo and wide measurement lines as well as their labels", async ({
  page,
}) => {
  await open(page);
  await front(page);
  await page.locator('[data-mode="fill"]').click();
  await clickAt(page, [0, 0, 4]);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await page.locator('[data-mode="measure"]').click();
  await clickAt(page, [-8, -6, 4]);
  await clickAt(page, [8, -6, 4]);
  await expect(page.locator("#measure-reading")).toHaveText("16.00 mm");
  await page.locator("#keep-measure").click();
  await expect(page.locator("#annotation-count")).toHaveText("2");
  await page.locator('[data-mode="orbit"]').click();
  await page.locator("#submit-feedback").click();
  const stateFile = path.join(dir, "state.json");
  await expect
    .poll(() => JSON.parse(fs.readFileSync(stateFile)).submissions.length)
    .toBe(1);
  const receipt = JSON.parse(fs.readFileSync(stateFile)).submissions[0];
  const submission = JSON.parse(ctl("read", receipt.id));
  const file = path.join(dir, "echo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: submission.id,
      versionId: submission.versionId,
      summary: "Section overlay test",
      annotations: submission.annotations.filter((a) => a.type === "region"),
    }),
  );
  ctl("echo", file);
  await expect
    .poll(async () => (await diagnostics(page)).viewer.echoLines)
    .toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await section(page, "x");
  await offset(page, -1);
  await expect(page.locator(".measure-label")).toBeHidden();
  await page.mouse.move(5, 5);
  const shown = await page.locator("#viewer canvas").screenshot();
  await page.locator("#toggle-marks").click();
  const hidden = await page.locator("#viewer canvas").screenshot();
  fs.writeFileSync(path.join(evidence, "overlays-shown.png"), shown);
  fs.writeFileSync(path.join(evidence, "overlays-hidden.png"), hidden);
  const difference = await page.evaluate(
    async ([a, b]) => {
      const data = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const [one, two] = await Promise.all([data(a), data(b)]);
      let left = 0,
        right = 0;
      // Canvas screenshots also contain DOM composited above the canvas.
      // Compare the model band, excluding the toolbar and floating controls.
      for (let y = Math.ceil(one.height * 0.2); y < one.height * 0.8; y++)
        for (let x = 0; x < one.width; x++) {
          const i = (y * one.width + x) * 4;
          if (
            [0, 1, 2].some(
              (c) => Math.abs(one.data[i + c] - two.data[i + c]) > 5,
            )
          ) {
            if (x > one.width / 2 + 3) right++;
            else left++;
          }
        }
      return { left, right };
    },
    [shown.toString("base64"), hidden.toString("base64")],
  );
  expect(difference.left).toBeGreaterThan(100);
  expect(difference.right).toBe(0);
  await page.locator("#toggle-marks").click();
  await page.locator("#section-off").click();
  await expect(page.locator(".measure-label")).toBeVisible();
  const hasSection = (v) =>
    v &&
    typeof v === "object" &&
    (Object.hasOwn(v, "section") || Object.values(v).some(hasSection));
  expect(hasSection(submission)).toBe(false);
});

// Boxes along the viewing ray deliberately put a retained front face against
// (touching) or inside (overlapping) another solid. A back-face paint pass
// either fights that face or lets its colour and its pick through the cut.
async function joinedBoxes(kind) {
  await hollowBox(); // Installs the exporter FileReader shim.
  const group = new THREE.Group();
  const add = (size, center, color) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(...center);
    group.add(mesh);
  };
  if (kind === "touching") {
    add([14, 15, 5], [-3, 0, 1.5], 0x2356aa);
    add([14, 15, 3], [-3, 0, -2.5], 0x33cc77);
  } else {
    add([14, 15, 8], [-3, 0, 0], 0x2356aa);
    add([10, 11, 2], [-3, 0, -2], 0x33cc77);
  }
  // An isolated retained surface must remain pickable next to the cap.
  add([2, 4, 2], [9, 0, -2], 0xcc3355);
  const bytes = await new GLTFExporter().parseAsync(group, { binary: true });
  const file = path.join(dir, `${kind}.glb`);
  fs.writeFileSync(file, Buffer.from(bytes));
  return file;
}

async function cutPixels(page, corners) {
  const polygon = [];
  const box = await page.locator("#viewer canvas").boundingBox();
  for (const corner of corners) {
    const p = await screen(page, corner);
    polygon.push([p.x - box.x, p.y - box.y]);
  }
  const shot = await page.locator("#viewer canvas").screenshot();
  const color = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--section-fill")
      .trim(),
  );
  return page.evaluate(
    async ({ b64, polygon, color }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      const rgb = color.match(/[a-f0-9]{2}/gi).map((c) => parseInt(c, 16));
      let total = 0,
        nonAmber = 0;
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          let inside = false;
          for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [ax, ay] = polygon[i],
              [bx, by] = polygon[j];
            if (
              ay > y !== by > y &&
              x < ((bx - ax) * (y - ay)) / (by - ay) + ax
            )
              inside = !inside;
          }
          if (!inside) continue;
          total++;
          const at = (y * img.width + x) * 4;
          if (rgb.some((v, c) => Math.abs(pixels[at + c] - v) > 3)) nonAmber++;
        }
      return { total, nonAmber, fraction: nonAmber / total };
    },
    { b64: shot.toString("base64"), polygon, color },
  );
}

for (const kind of ["touching", "overlapping", "per-face hollow"])
  test(`global section cap is opaque and pick-safe: ${kind}`, async ({
    page,
  }) => {
    await open(
      page,
      kind === "per-face hollow" ? await hollowBox() : await joinedBoxes(kind),
    );
    await front(page);
    await section(page);
    const hollow = kind === "per-face hollow";
    const corners = hollow
      ? [
          [-9, -3, 0],
          [-7, -3, 0],
          [-7, 3, 0],
          [-9, 3, 0],
        ]
      : [
          [-8, -4, 0],
          [1, -4, 0],
          [1, 4, 0],
          [-8, 4, 0],
        ];
    // The oblique shell view distinguishes a plane-depth cap from an amber
    // back wall, even when both happen to look flat from straight ahead.
    if (hollow) await page.locator('[data-view="1,0,1"]').press("Enter");
    for (const theme of ["light", "dark"]) {
      await page.locator("#theme-choice").selectOption(theme);
      const pixels = await cutPixels(page, corners);
      fs.mkdirSync("tmp/lane-c-evidence", { recursive: true });
      fs.writeFileSync(
        `tmp/lane-c-evidence/${kind}-${theme}-pixels.json`,
        JSON.stringify(pixels),
      );
      expect(pixels.total).toBeGreaterThan(200);
      expect(pixels.fraction).toBeLessThan(0.01);
    }
    await front(page);
    await page.locator('[data-mode="label"]').click();
    await clickAt(page, hollow ? [-8, 0, 0] : [-3, 0, 0]);
    expect((await diagnostics(page)).annotationCount).toBe(0);
    await page.locator('[data-mode="measure"]').click();
    await clickAt(page, hollow ? [-8, 0, 0] : [-3, 0, 0]);
    expect((await diagnostics(page)).measuring?.picks || 0).toBe(0);
    await page.locator('[data-mode="fill"]').click();
    await clickAt(page, hollow ? [-8, 0, 0] : [-3, 0, 0]);
    expect((await diagnostics(page)).annotationCount).toBe(0);
    if (hollow) {
      const cavity = await cutPixels(page, [
        [-3, -2, 0],
        [3, -2, 0],
        [3, 2, 0],
        [-3, 2, 0],
      ]);
      expect(cavity.fraction).toBeGreaterThan(0.99);
    }
    await page.locator('[data-mode="label"]').click();
    await clickAt(page, hollow ? [0, 0, -3] : [9, 0, -1]);
    await expect(page.locator("#annotation-count")).toHaveText("1");
    expect((await diagnostics(page)).annotations[0].position[2]).toBeCloseTo(
      hollow ? -3 : 1,
    );
  });
