import { clickControl } from "./b1u-shell-helpers.mjs";
import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";

import { writePlate, writeInwardPlate } from "./echo-models.mjs";

const repo = process.cwd();
// Standalone red/green runs can use an isolated build and port without
// touching another worktree's source, build, server or Playwright results.
let url;
let child, dir, env;

const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  const dataRoot = path.resolve(repo, process.env.ECHO_TEST_DATA_ROOT || "tmp");
  fs.mkdirSync(dataRoot, { recursive: true });
  dir = fs.mkdtempSync(path.join(dataRoot, "be-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  env = {
    ...process.env,
    PORT: "0",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR: path.resolve(
      repo,
      process.env.ECHO_TEST_DIST ||
        process.env.REVIEW_TEST_DIST ||
        "tmp/refinement-dist",
    ),
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
  fs.closeSync(log);
  await expect
    .poll(async () => {
      if (child.exitCode !== null)
        throw new Error(fs.readFileSync(path.join(dir, "server.log"), "utf8"));
      try {
        return (await fetch(`${url}/api/health`)).ok;
      } catch {
        return false;
      }
    })
    .toBe(true);
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

// Where a point of the plate is on the screen, from the camera the page holds.
async function screenOf(page, [x, y, z]) {
  const d = await page.evaluate(() => window.__reviewDiagnostics());
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
  const p = new THREE.Vector3(0.15 * x, 0.15 * z, -0.15 * y).project(camera);
  return {
    x: box.x + ((p.x + 1) / 2) * box.width,
    y: box.y + ((1 - p.y) / 2) * box.height,
  };
}
/* Pixels by what they read as. A painted region has a translucent coral
   tint and a solid coral outline; the echo is cyan, and the grey model is
   neither. Keep the cyan test separate even when the two boundaries overlap. */
async function colours(page, clip) {
  const shot = await page.screenshot({ clip });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const px = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0,
      cyan = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      // The old classifier required the opaque red between white stripes.
      // A solid translucent fill blends with grey, so identify the same coral
      // hue by its channel differences instead. Grey and cyan cannot match;
      // the pixel-count and unpainted-interior assertions stay unchanged.
      if (r > 150 && r - g > 24 && r - b > 28 && (r - g) / (r - b) > 0.7) red++;
      if (g > 145 && b > 170 && b - r > 55 && g - r > 35) cyan++;
    }
    return { red, cyan };
  }, shot.toString("base64"));
}
const around = (p, half) => ({
  x: p.x - half,
  y: p.y - half,
  width: half * 2,
  height: half * 2,
});

async function submitTop(page, file) {
  ctl("publish", file, "--version", "plate", "--units", "mm");
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  const top = await screenOf(page, [2, 1, 4]);
  await clickControl(page, '[data-mode="fill"]');
  await page.mouse.click(top.x, top.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  await clickControl(page, '[data-mode="orbit"]');
  await page.mouse.move(5, 5);
  await page.getByRole("button", { name: /Send to Agent/ }).click();
  await expect
    .poll(
      () =>
        JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"))
          .submissions.length,
    )
    .toBe(1);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json"), "utf8"),
  ).submissions[0];
  const submission = JSON.parse(ctl("read", receipt.id));
  const [painted] = submission.annotations;
  expect(painted.type).toBe("region");
  return { submission, painted, meshId: Object.keys(painted.faces)[0], top };
}

async function echo(
  page,
  submission,
  annotations,
  summary = "Echo regression",
) {
  const file = path.join(dir, "echo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: submission.id,
      versionId: submission.versionId,
      summary,
      annotations,
    }),
  );
  const previous = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.agentEchoId,
  );
  ctl("echo", file);
  await expect(page.locator("#echo-panel")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.agentEchoId),
    )
    .not.toBe(previous);
}
const region = (meshId, faces, extra = {}) => ({
  id: crypto.randomUUID(),
  type: "region",
  coverage: "source-v2",
  label: "echo surface",
  color: "#f5dc72",
  faces: { [meshId]: faces },
  ...extra,
});
const diagnostics = (page) =>
  page.evaluate(() => window.__reviewDiagnostics().viewer);

async function shot(page, testInfo, name) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}
async function edgeColours(page, points) {
  const corners = await Promise.all(points.map((p) => screenOf(page, p)));
  // Sample thin strips *on each edge*, not a whole face that could pass if
  // its interior was filled. Several separated spots cover dash gaps.
  let cyan = 0,
    red = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i],
      b = corners[(i + 1) % corners.length];
    for (const t of [0.25, 0.5, 0.75]) {
      const c = await colours(
        page,
        around({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 5),
      );
      cyan += c.cyan;
      red += c.red;
    }
  }
  return { cyan, red };
}
const topEdges = [
  [-10, -7.5, 4],
  [10, -7.5, 4],
  [10, 7.5, 4],
  [-10, 7.5, 4],
];
const frontEdges = [
  [-10, -7.5, -4],
  [10, -7.5, -4],
  [10, -7.5, 4],
  [-10, -7.5, 4],
];

test("cyan echo edges leave overlapping red marks and face interiors unfilled", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { submission, painted, meshId, top } = await submitTop(
    page,
    writePlate(dir),
  );
  const before = await colours(page, around(top, 8));
  expect(before.red).toBeGreaterThan(40);
  expect(before.cyan).toBe(0);
  await echo(page, submission, [painted, region(meshId, [4, 5])]);
  await shot(page, testInfo, "cyan-overlap-and-unfilled-front");
  const middle = await colours(
    page,
    around(await screenOf(page, [2, -7.5, 0]), 8),
  );
  expect(middle.cyan).toBe(0);
  expect(middle.red).toBe(0);
  const after = await colours(page, around(top, 8));
  expect(after.cyan).toBe(0);
  expect(after.red).toBeGreaterThan(40);
  expect(
    (await edgeColours(page, topEdges)).cyan,
    "cyan must remain visible on the red region boundary",
  ).toBeGreaterThan(80);
  expect(
    (await edgeColours(page, frontEdges)).cyan,
    "unpainted face has cyan edges, not a fill",
  ).toBeGreaterThan(80);
});

test("echo diagnostics animate, freeze under reduced motion, and resume on a live media switch", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { submission, painted } = await submitTop(page, writePlate(dir));
  await echo(page, submission, [painted]);
  const d = await diagnostics(page);
  expect(d.echoLines).toBe(1);
  expect(d.echoSegments).toBeGreaterThanOrEqual(4);
  expect(Number.isFinite(d.echoDashOffset)).toBe(true);
  await expect
    .poll(async () => (await diagnostics(page)).echoDashOffset)
    .not.toBe(d.echoDashOffset);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Wait on rendered frames, not a timeout that could sample before the
  // media-query change has been consumed by the animation loop.
  const offsets = await page.evaluate(async () => {
    const frame = () => new Promise(requestAnimationFrame);
    await frame();
    await frame();
    const values = [];
    for (let i = 0; i < 12; i++) {
      await frame();
      values.push(window.__reviewDiagnostics().viewer.echoDashOffset);
    }
    return values;
  });
  expect(new Set(offsets).size).toBe(1);
  expect(Number.isFinite(offsets[0])).toBe(true);
  await shot(page, testInfo, "reduced-motion-still");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(async () => (await diagnostics(page)).echoDashOffset)
    .not.toBe(offsets[0]);
  const resumed = (await diagnostics(page)).echoDashOffset;
  await expect
    .poll(async () => (await diagnostics(page)).echoDashOffset)
    .not.toBe(resumed);
});

for (const withNormals of [true, false]) {
  test(`DoubleSide inward GLB ${withNormals ? "outward vertex normals" : "missing normals"}: surface edges stay visible and hidden back edges are occluded`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { submission, meshId } = await submitTop(
      page,
      writeInwardPlate(dir, withNormals),
    );
    // A small triangle fully inside the front face, not at the silhouette:
    // a line sunk below the surface cannot accidentally peek around its edge.
    // Face 4 has corners (-10,-4), (10,4), (10,-4) in front-plane x/z.
    const visible = [
      [2, -7.5, -2],
      [6, -7.5, 0],
      [6, -7.5, -2],
    ];
    const patch = (points) => points; // GLB now shares the STL Z-up source frame
    await echo(page, submission, [
      region(meshId, [4], {
        surfacePatches: [
          {
            meshId,
            faceIndex: 4,
            sourceFaceIndex: 4,
            vertices: patch(visible),
          },
        ],
      }),
    ]);
    await shot(
      page,
      testInfo,
      `inward-${withNormals ? "normals" : "missing"}-visible`,
    );
    expect(
      (await edgeColours(page, visible)).cyan,
      "cyan edges must sit above the inward-wound surface",
    ).toBeGreaterThan(60);
    expect(
      (await colours(page, around(await screenOf(page, [4.7, -7.5, -1.3]), 3)))
        .cyan,
      "patch interior is not filled",
    ).toBe(0);
    // Bottom face, hidden well inside the plate. Depth-test-off strokes would
    // show through its top/front. Use an inset triangle to avoid silhouettes.
    const hidden = [
      [-2, -2, -4],
      [2, 2, -4],
      [2, -2, -4],
    ];
    await echo(
      page,
      submission,
      [
        region(meshId, [0], {
          surfacePatches: [
            {
              meshId,
              faceIndex: 0,
              sourceFaceIndex: 0,
              vertices: patch(hidden),
            },
          ],
        }),
      ],
      "Hidden underside",
    );
    await shot(
      page,
      testInfo,
      `inward-${withNormals ? "normals" : "missing"}-occluded`,
    );
    expect(
      (await edgeColours(page, hidden)).cyan,
      "back edges must not penetrate the opaque model",
    ).toBe(0);
    // A positive structural guard stops an empty/missing overlay passing the
    // no-cyan check: it exists, but depth testing occludes it.
    expect((await diagnostics(page)).echoLines).toBe(1);
    expect((await diagnostics(page)).echoSegments).toBe(3);
  });
}
