import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";

/* The Agent's echo, drawn on a model whose every face is known: a plate
   20 × 15 × 8 mm, modelled flat on +Z and centred on the origin. The page
   stands an STL up and fits it into three units by its long side, so the
   file's (x, y, z) is the preview's 0.15 × (x, z, -y). Faces 2 and 3 are the
   top, 4 and 5 the front (-Y), which is the side the page shows first. */

const repo = process.cwd();
const url = "http://127.0.0.1:43174";
let child, dir, env;

function writePlate() {
  const stl = path.join(dir, "plate.stl");
  const [lo, hi] = [
    [-10, -7.5, -4],
    [10, 7.5, 4],
  ];
  const corner = (i) => [0, 1, 2].map((k) => ((i >> k) & 1 ? hi : lo)[k]);
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const facet = (a, b, c) =>
    `facet normal 0 0 0\nouter loop\n${[a, b, c]
      .map((i) => `vertex ${corner(i).join(" ")}`)
      .join("\n")}\nendloop\nendfacet`;
  fs.writeFileSync(
    stl,
    `solid plate\n${quads
      .flatMap(([a, b, c, d]) => [facet(a, b, c), facet(a, c, d)])
      .join("\n")}\nendsolid plate\n`,
  );
  return stl;
}
const ctl = (...args) =>
  execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
  });

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-echo-"));
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
/* Pixels by what they read as. The reviewer's first colour is a coral red and
   the echo a pale yellow; the white and dark stripes that tell a mark from the
   model are neither, and the grey model is neither. */
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
      yellow = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      if (r > 170 && g < 160 && b < 150 && r - g > 50) red++;
      if (r > 170 && g > 170 && b < 150 && g - b > 50) yellow++;
    }
    return { red, yellow };
  }, shot.toString("base64"));
}
const around = (p, half) => ({
  x: p.x - half,
  y: p.y - half,
  width: half * 2,
  height: half * 2,
});

test("the echo outlines what the Agent means and never paints over the reviewer's marks", async ({
  page,
}) => {
  ctl("publish", writePlate(), "--version", "plate", "--units", "mm");
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  const top = await screenOf(page, [2, 1, 4]);
  const front = await screenOf(page, [2, -7.5, 0]);
  await page
    .getByRole("button", { name: "Paint bucket tool", exact: true })
    .click();
  await page.mouse.click(top.x, top.y);
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  // Out of the way, so the pointer's preview is not what gets measured.
  await page.getByRole("button", { name: "Orbit tool", exact: true }).click();
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
  const meshId = Object.keys(painted.faces)[0];
  const beforeTop = await colours(page, around(top, 8));
  expect(beforeTop.red).toBeGreaterThan(40);
  expect(beforeTop.yellow).toBe(0);
  /* What the Agent sent in the round this came from: the reviewer's own region
     handed back, and beside it the face it meant to change. */
  const file = path.join(dir, "echo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      submissionId: submission.id,
      versionId: submission.versionId,
      summary: "Raise the top; the front face moves with it",
      annotations: [
        painted,
        {
          id: crypto.randomUUID(),
          type: "region",
          coverage: "source-v2",
          label: "front",
          color: "#f5dc72",
          faces: { [meshId]: [4, 5] },
        },
      ],
    }),
  );
  ctl("echo", file);
  await expect(page.locator("#echo-panel")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.agentEchoId),
    )
    .not.toBeNull();
  // The reviewer's colour is still what the reviewer's region reads as.
  const echoedTop = await colours(page, around(top, 8));
  expect(echoedTop.yellow).toBe(0);
  expect(echoedTop.red).toBeGreaterThan(40);
  // The face the Agent meant is not filled in: its middle stays the model.
  const middle = await colours(page, around(front, 8));
  expect(middle.yellow).toBe(0);
  // It is outlined instead, along its edges.
  const corners = await Promise.all(
    [
      [-10, -7.5, -4],
      [10, -7.5, -4],
      [10, -7.5, 4],
      [-10, -7.5, 4],
    ].map((p) => screenOf(page, p)),
  );
  const xs = corners.map((c) => c.x),
    ys = corners.map((c) => c.y);
  const face = {
    x: Math.min(...xs) - 6,
    y: Math.min(...ys) - 6,
    width: Math.max(...xs) - Math.min(...xs) + 12,
    height: Math.max(...ys) - Math.min(...ys) + 12,
  };
  const outlined = await colours(page, face);
  expect(outlined.yellow).toBeGreaterThan(150);
  // An outline, not an area: a fraction of the face it goes round.
  expect(outlined.yellow).toBeLessThan((face.width * face.height) / 3);
  await page.screenshot({
    path: path.join(repo, "tmp/screenshots/2026-09-29-echo-outline.png"),
  });
});
