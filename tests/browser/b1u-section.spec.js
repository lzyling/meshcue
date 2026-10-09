import { installFakeOpenClaw } from "../helpers/fake-openclaw.mjs";
import { clickControl, selectSetting, showParts } from "./r12-b-helpers.mjs";
import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
const repo = process.cwd();
let url;
const evidence = path.join(
  repo,
  process.env.MESHCUE_SECTION_EVIDENCE || "tmp/b1u-x/evidence",
);
let child, dir, env;
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-b1u-section-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  installFakeOpenClaw(bin);
  env = {
    ...process.env,
    PORT: "0",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR:
      process.env.REVIEW_TEST_DIST || path.join(repo, "tmp/refinement-dist"),
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
  url = await browserServerUrl(child, dir);
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
  group.rotation.x = Math.PI / 2;
  group.updateMatrixWorld(true);
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
  // Project every pixel-check polygon from one settled view, rather than
  // sampling different camera positions during the cube's 300 ms animation.
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
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
async function section(page, axis = "y") {
  await clickControl(page, "#section-toggle");
  await page.locator("#section-axis").selectOption(axis);
  if (axis === "y") await page.locator("#section-flip").click();
}
async function offset(page, value) {
  await page.locator("#section-offset").fill(String(value));
  await page.locator("#section-offset").press("Enter");
}

async function boxes(count = 2, same = false) {
  await hollowBox(); // Exporter FileReader shim.
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(count === 2 ? 8 : 1.5, count === 2 ? 12 : 1.5, 8),
      new THREE.MeshStandardMaterial({
        color: same ? 0xb8c2cc : i % 2 ? 0x48b890 : 0xdd7855,
      }),
    );
    mesh.name = `Solid ${i + 1}`;
    mesh.position.set(
      count === 2 ? (i ? 6 : -6) : ((i % 10) - 4.5) * 2,
      count === 2 ? 0 : (Math.floor(i / 10) - 2) * 2,
      0,
    );
    group.add(mesh);
  }
  group.rotation.x = Math.PI / 2;
  group.updateMatrixWorld(true);
  const file = path.join(dir, "solids.glb");
  fs.writeFileSync(
    file,
    Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true })),
  );
  return file;
}

async function scan(page, a, b) {
  const start = await screen(page, a),
    end = await screen(page, b);
  const box = await page.locator("#viewer canvas").boundingBox();
  const shot = await page
    .locator("#viewer canvas")
    .screenshot({ scale: "css" });
  return page.evaluate(
    async ({ b64, start, end, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data,
        values = [];
      for (let x = Math.ceil(start.x - box.x); x < end.x - box.x; x++) {
        const i = (Math.floor(start.y - box.y) * c.width + x) * 4;
        values.push(Array.from(data.slice(i, i + 3)));
      }
      return values;
    },
    { b64: shot.toString("base64"), start, end, box },
  );
}
const average = (pixels) =>
  [0, 1, 2].map((c) => pixels.reduce((n, p) => n + p[c], 0) / pixels.length);

test("two part caps have distinct hues and hiding or ghosting removes only that cap", async ({
  page,
}) => {
  fs.mkdirSync(evidence, { recursive: true });
  await open(page, await boxes());
  await front(page);
  await page.screenshot({ path: path.join(evidence, "before.png") });
  await section(page);
  await page.screenshot({ path: path.join(evidence, "caps-initial.png") });
  const left = average(await scan(page, [-9, 0, 0], [-3, 0, 0]));
  const right = average(await scan(page, [3, 0, 0], [9, 0, 0]));
  expect(left[0] - left[1]).toBeGreaterThan(25);
  expect(right[1] - right[0]).toBeGreaterThan(25);
  for (const theme of ["light", "dark"]) {
    await selectSetting(page, "#theme-choice", theme);
    await page.screenshot({ path: path.join(evidence, `caps-${theme}.png`) });
  }
  await showParts(page);
  const row = page.locator(".parts-row").filter({
    has: page.getByRole("button", { name: "Solid 1", exact: true }),
  });
  await row.locator(".parts-name").click();
  await page.keyboard.press("y");
  const hidden = average(await scan(page, [-9, 0, 0], [-3, 0, 0]));
  expect(
    Math.abs(hidden[0] - left[0]) + Math.abs(hidden[1] - left[1]),
  ).toBeGreaterThan(30);
  expect(average(await scan(page, [3, 0, 0], [9, 0, 0]))).toEqual(right);
  await page.keyboard.press("Shift+Y");
  await page.keyboard.press("Shift+T");
  const ghost = average(await scan(page, [-9, 0, 0], [-3, 0, 0]));
  expect(
    Math.abs(ghost[0] - left[0]) + Math.abs(ghost[1] - left[1]),
  ).toBeGreaterThan(30);
});

for (const dpr of [1, 2])
  test.describe(`hatching DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("screen pitch stays constant through zoom and plain mode separates identical colours", async ({
      page,
    }) => {
      await open(page, await boxes(2, true));
      await front(page);
      await section(page);
      for (const zoom of ["far", "near"]) {
        const pixels = await scan(page, [-9, 0, 0], [-3, 0, 0]);
        const light = pixels.map((p) => p.reduce((a, b) => a + b, 0));
        const min = Math.min(...light),
          max = Math.max(...light);
        expect(max - min).toBeGreaterThan(70);
        const centers = [];
        for (let i = 1; i < light.length; i++)
          if (light[i] < (min + max) / 2 && light[i - 1] >= (min + max) / 2)
            centers.push(i);
        expect(centers.length).toBeGreaterThan(4);
        const pitch = (centers.at(-1) - centers[0]) / (centers.length - 1);
        // 8 px measured perpendicular to a 45 degree line => sqrt(2)*8 horizontally.
        expect(pitch).toBeGreaterThan(10);
        expect(pitch).toBeLessThan(12.5);
        const left = average(pixels),
          right = average(await scan(page, [3, 0, 0], [9, 0, 0]));
        expect(Math.hypot(...left.map((v, i) => v - right[i]))).toBeGreaterThan(
          50,
        );
        await page.screenshot({
          path: path.join(evidence, `hatch-${zoom}-dpr${dpr}.png`),
        });
        const box = await page.locator("#viewer").boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -180);
        await page.waitForTimeout(600);
      }
      await clickControl(page, "#neutral-view");
      const left = average(await scan(page, [-9, 0, 0], [-3, 0, 0])),
        right = average(await scan(page, [3, 0, 0], [9, 0, 0]));
      expect(Math.hypot(...left.map((v, i) => v - right[i]))).toBeGreaterThan(
        50,
      );
    });
  });

test("section frame times on the largest multipart sample and fifty solids", async ({
  page,
}) => {
  test.setTimeout(180000);
  fs.mkdirSync(evidence, { recursive: true });
  const { inspectModel } = await import("../../server/models.mjs");
  const models = fs
    .readdirSync("tmp/samples")
    .filter((f) => f.endsWith(".glb"))
    .map((name) => ({
      name,
      triangles: inspectModel(fs.readFileSync(`tmp/samples/${name}`), "glb")
        .triangles,
    }))
    .sort((a, b) => b.triangles - a.triangles);
  const results = [];
  for (const file of [`tmp/samples/${models[0].name}`, await boxes(50, true)]) {
    await open(page, file);
    await expect
      .poll(async () => (await diagnostics(page)).viewer.display.pending)
      .toBe(false);
    await clickControl(page, "#perf-toggle");
    const sample = () =>
      page.evaluate(async () => {
        const times = [];
        let last;
        const canvas = document.querySelector("#viewer canvas");
        for (let i = 0; i < 100; i++) {
          canvas.dispatchEvent(
            new PointerEvent("pointermove", { clientX: 700, clientY: 450 }),
          );
          const now = await new Promise(requestAnimationFrame);
          if (i > 20) times.push(now - last);
          last = now;
        }
        times.sort((a, b) => a - b);
        const meanMs = times.reduce((a, b) => a + b, 0) / times.length;
        return {
          samples: times.length,
          meanMs,
          fps: 1000 / meanMs,
          p95Ms: times[Math.floor(times.length * 0.95)],
          performance: window.__reviewDiagnostics().viewer.performance,
        };
      });
    const off = await sample();
    await section(page, "z");
    const on = await sample();
    results.push({ file, off, on, viewer: (await diagnostics(page)).viewer });
    await page.screenshot({
      path: path.join(evidence, `performance-${results.length}.png`),
    });
    await clickControl(page, "#perf-toggle");
  }
  fs.writeFileSync(
    path.join(evidence, "frame-times.json"),
    JSON.stringify(
      {
        renderer: results[0].on.performance.snapshot.renderer,
        method:
          "1440x1000, 20 warmup frames and 79 intervals, stationary home view with pointer activity",
        models,
        results,
      },
      null,
      2,
    ),
  );
  expect(results[1].on.samples).toBe(79);
});

for (const format of ["glb", "stl"])
  test(`a single ${format} part caps while its internal cavity remains open`, async ({
    page,
  }) => {
    await hollowBox();
    const { mergeGeometries } =
      await import("three/addons/utils/BufferGeometryUtils.js");
    const outer = new THREE.BoxGeometry(20, 15, 8).toNonIndexed();
    const inner = new THREE.BoxGeometry(12, 9, 6).toNonIndexed();
    const attr = inner.attributes.position;
    for (let i = 0; i < attr.count; i += 3) {
      const b = new THREE.Vector3().fromBufferAttribute(attr, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(attr, i + 2);
      attr.setXYZ(i + 1, c.x, c.y, c.z);
      attr.setXYZ(i + 2, b.x, b.y, b.z);
    }
    inner.computeVertexNormals();
    const mesh = new THREE.Mesh(
      mergeGeometries([outer, inner]),
      new THREE.MeshStandardMaterial({ color: 0xcdd7dc }),
    );
    const file = path.join(dir, `single-hollow.${format}`);
    mesh.rotation.x = Math.PI / 2;
    mesh.updateMatrixWorld();
    if (format === "glb")
      fs.writeFileSync(
        file,
        Buffer.from(
          await new GLTFExporter().parseAsync(mesh, { binary: true }),
        ),
      );
    else {
      const { STLExporter } =
        await import("three/addons/exporters/STLExporter.js");
      // Both formats use the same canonical Z-up conversion.
      mesh.rotation.x = Math.PI / 2;
      mesh.updateMatrixWorld();
      fs.writeFileSync(file, new STLExporter().parse(mesh));
    }
    await open(page, file);
    await front(page);
    await section(page, "y");
    const wall = await scan(page, [-9, 0, 0], [-7, 0, 0]);
    const hole = await scan(page, [-3, 0, 0], [3, 0, 0]);
    const variation = (p) =>
      Math.max(...p.map((c) => c[0])) - Math.min(...p.map((c) => c[0]));
    expect(variation(wall)).toBeGreaterThan(25);
    expect(variation(hole)).toBeLessThan(5);
    await clickControl(page, '[data-mode="label"]');
    await clickAt(page, [-8, 0, 0]);
    expect((await diagnostics(page)).annotationCount).toBe(0);
    await clickAt(page, [0, 0, -3]);
    await expect(page.locator("#annotation-count")).toHaveText("1");
    await page.screenshot({
      path: path.join(evidence, `cavity-${format}.png`),
    });
  });
