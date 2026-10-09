import { clickControl } from "./b1u-shell-helpers.mjs";
import { browserServerUrl, browserOrigin } from "../helpers/browser-server.mjs";
import { test, expect } from "./fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import * as THREE from "three";
import { convertStepDetached } from "../../server/step.mjs";

/* Measuring, on a model whose every dimension is known: a plate 20 × 15 × 8,
   modelled flat on +Z and centred on the origin. The page stands an STL up and
   fits it into three units by its long side, so the file's (x, y, z) is the
   preview's 0.15 × (x, z, -y); that is all a test needs to aim at a corner. */

const repo = process.cwd();
let url;
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
  dir = fs.mkdtempSync(path.join(repo, "tmp", "browser-measure-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync("tests/fake-openclaw.mjs", path.join(bin, "openclaw"));
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
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

async function open(page, units, file = writePlate()) {
  ctl(
    "publish",
    file,
    "--version",
    "plate",
    ...(units ? ["--units", units] : []),
  );
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await clickControl(page, '[data-mode="measure"]');
  await expect(page.locator("#measure-options")).toBeVisible();
  // These regressions exercise the original explicit kinds, now in Advanced.
  await page.locator("#measure-advanced summary").click();
  await page.locator('[data-measure="points"]').click();
}
// Where a point of the plate is on the screen, from the camera the page holds.
// Every default-up format maps file (x,y,z) to preview 0.15 × (x,z,-y).
async function screenOf(page, [x, y, z], format) {
  // Cube changes now animate. Sample screen coordinates only once the camera
  // has arrived, so the following click still tests the intended source face.
  await expect
    .poll(() => page.evaluate(() => window.__navigationDiagnostics().animating))
    .toBe(false);
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
// A click a few pixels in from a corner, towards the middle of a face: close
// enough that the corner is taken, far enough in that the face is what is hit.
async function nearCorner(page, corner, face) {
  const [c, m] = [await screenOf(page, corner), await screenOf(page, face)];
  const d = Math.hypot(m.x - c.x, m.y - c.y);
  return { x: c.x + ((m.x - c.x) / d) * 4, y: c.y + ((m.y - c.y) / d) * 4 };
}
const click = async (page, at) => {
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
};
const reading = (page) => page.locator("#measure-reading");
const diagnostics = (page) => page.evaluate(() => window.__reviewDiagnostics());

test("measuring reads between corners, along an edge and between faces, and keeps nothing", async ({
  page,
}) => {
  await open(page, "mm");
  const before = await diagnostics(page);
  const top = [0, 0, 4];

  // Two corners of the front of the top face, 20 apart. Neither click lands
  // on its corner; both are taken to it.
  await click(page, await nearCorner(page, [-10, -7.5, 4], top));
  await expect(reading(page)).toHaveText("Click the second point");
  await click(page, await nearCorner(page, [10, -7.5, 4], top));
  await expect(reading(page)).toHaveText("20.00 mm");
  // The next click starts another; Esc puts it away.
  await click(page, await screenOf(page, top));
  await expect(reading(page)).toHaveText("Click the second point");
  await page.keyboard.press("Escape");
  await expect(reading(page)).toHaveText("");

  // The same front edge, taken from its middle: one straight edge, end to end.
  await page.getByRole("button", { name: "Edge length", exact: true }).click();
  const front = await screenOf(page, [0, -7.5, 4]);
  await click(page, { x: front.x, y: front.y + 3 });
  await expect(reading(page)).toHaveText("20.00 mm");
  // An upright edge of the same plate is its thickness.
  const upright = await screenOf(page, [10, -7.5, 0]);
  await click(page, { x: upright.x - 3, y: upright.y });
  await expect(reading(page)).toHaveText("8.00 mm");

  // The top and the front meet square.
  await page.getByRole("button", { name: "Two faces", exact: true }).click();
  await click(page, await screenOf(page, top));
  await expect(reading(page)).toHaveText("Click the second face");
  // A second click on the face already taken is not a second face.
  await click(page, await screenOf(page, [3, 2, 4]));
  await expect(page.locator("#toast")).toHaveText(
    "That is the same face — click a different one.",
  );
  await click(page, await screenOf(page, [0, -7.5, 0]));
  await expect(reading(page)).toHaveText("90.00°");
  // The top and the bottom are 8 apart; the bottom is seen from below, and
  // turning the model does not put the measurement down.
  await click(page, await screenOf(page, top));
  await page.locator('.orient-face[data-view="0,-1,0"]').dispatchEvent("click");
  await click(page, await screenOf(page, [2, 3, -4]));
  await expect(reading(page)).toHaveText("8.00 mm");

  // None of it touched the draft.
  const after = await diagnostics(page);
  expect(after.annotationCount).toBe(0);
  expect(after.revision).toBe(before.revision);
  expect(after.dirty).toBe(false);
  await expect(page.locator("#undo")).toBeDisabled();
  // Another tool puts it away.
  await clickControl(page, '[data-mode="orbit"]');
  expect((await diagnostics(page)).measuring).toBe(null);
});

test("a kept measurement is a mark: listed, noted, undone and sent", async ({
  page,
}) => {
  await open(page, "mm");
  const keep = page.getByRole("button", { name: "Keep", exact: true });
  await expect(keep).toBeDisabled();
  const top = [0, 0, 4];
  await click(page, await nearCorner(page, [-10, -7.5, 4], top));
  await click(page, await nearCorner(page, [10, -7.5, 4], top));
  await expect(reading(page)).toHaveText("20.00 mm");
  await keep.click();
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const [mark] = (await diagnostics(page)).annotations;
  expect(mark).toMatchObject({
    type: "measure",
    label: "M1",
    kind: "points",
    quantity: "length",
    space: "model",
  });
  expect(mark.value).toBeCloseTo(20, 4);
  expect(mark.points).toEqual([
    [-10, -7.5, 4],
    [10, -7.5, 4],
  ]);
  expect(mark.view.space).toBe("model");
  // Kept, it is no longer the measurement on screen, and it is in the list.
  await expect(reading(page)).toHaveText("");
  const row = page.locator(".annotation-row");
  await expect(row).toHaveCount(1);
  await expect(row.locator("strong")).toHaveText("20.00 mm");
  await expect(row.locator(".annotation-badge")).toHaveText("M1");
  await expect(row.locator(".measure-badge")).toHaveCSS("height", "20px");
  await expect(row.locator(".measure-badge")).toHaveCSS("border-radius", "7px");
  await expect(row.locator(".measure-badge")).toHaveCSS(
    "background-color",
    "rgb(20, 32, 42)",
  );
  await expect(row.locator(".measure-badge")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".measure-label")).toContainText("20.00 mm");

  await expect(page.locator("#mark-note-title")).toHaveText(
    "Note on measurement M1",
  );
  await page.locator("#mark-note-text").fill("Make this 22 mm.");
  await expect(page.locator("#save-status")).toHaveText("Draft saved");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).annotations[0]?.note)
    .toBe(undefined);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).annotationCount)
    .toBe(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await diagnostics(page)).annotations[0]?.note)
    .toBe("Make this 22 mm.");
  await expect(page.locator("#save-status")).toHaveText("Draft saved");

  await page.locator("#submit-feedback").click();
  await expect
    .poll(() => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
        ).calls.find((c) => c.method === "chat.send")?.params.message;
      } catch {
        return null;
      }
    })
    .toMatch(/M1: measurement, 20 mm point to point[^\n]* — has a note/);
});

test("with no declared unit a measurement is a bare number that says so", async ({
  page,
}) => {
  await open(page);
  const top = [0, 0, 4];
  await click(page, await nearCorner(page, [-10, -7.5, 4], top));
  await click(page, await nearCorner(page, [10, -7.5, 4], top));
  await expect(reading(page)).toHaveText("20.00 (no units)");
});

/* The same plate as a STEP, with its four upright corners rounded at radius 2
   and a hole of diameter 5 through its middle (`tests/fixtures/plate.step`).
   The service tessellates it and records which of the file's faces each
   triangle came from; measuring on it reads that, which is the only way the
   line where the front runs into a round is an edge at all. */
test("on a STEP a face and an edge are the file's own, and three points on a rim give its diameter", async ({
  page,
}) => {
  await open(page, "mm", "tests/fixtures/plate.step");
  const before = await diagnostics(page);

  // The top meets the front between the two rounds: 20 less two radii.
  await page.getByRole("button", { name: "Edge length", exact: true }).click();
  const front = await screenOf(page, [0, -7.5, 4]);
  await click(page, { x: front.x, y: front.y + 3 });
  await expect(reading(page)).toHaveText("16.00 mm");
  // The front and the round beside it do not turn where they meet; the file
  // still has an edge there, the height of the plate.
  const tangent = await screenOf(page, [8, -7.5, 0]);
  await click(page, { x: tangent.x - 3, y: tangent.y });
  await expect(reading(page)).toHaveText("8.00 mm");

  // A round is a face of the file, and not a flat one.
  await page.getByRole("button", { name: "Two faces", exact: true }).click();
  await click(
    page,
    await screenOf(page, [8 + Math.SQRT2, -5.5 - Math.SQRT2, 0]),
  );
  await expect(page.locator("#toast")).toHaveText(
    "That face is curved; only flat faces can be measured.",
  );
  await expect(reading(page)).toHaveText("");

  /* Three clicks just outside the rim of the hole, each beside one of the
     vertices the tessellation put on it, a sixth of the way round from each
     other; each is taken at its vertex, which is on the circle itself. */
  await page
    .getByRole("button", { name: "3-point circle", exact: true })
    .click();
  const rim = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [2.6 * Math.cos(a), 2.6 * Math.sin(a), 4];
  };
  await click(page, await screenOf(page, rim(60)));
  await expect(reading(page)).toHaveText("Click the second point");
  // The same point again is not a second one.
  await click(page, await screenOf(page, rim(60)));
  await expect(page.locator("#toast")).toHaveText(
    "No circle runs through those points — click three separate points spread around the rim.",
  );
  await click(page, await screenOf(page, rim(180)));
  await expect(reading(page)).toHaveText("Click the third point");
  await click(page, await screenOf(page, rim(300)));
  await expect(reading(page)).toHaveText("⌀5.00 mm");
  expect((await diagnostics(page)).annotationCount).toBe(
    before.annotationCount,
  );

  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  const [mark] = (await diagnostics(page)).annotations;
  expect(mark).toMatchObject({
    type: "measure",
    label: "M1",
    kind: "circle",
    quantity: "diameter",
    space: "model",
  });
  expect(mark.value).toBeCloseTo(5, 4);
  expect(mark.points).toHaveLength(3);
  expect(mark.picks).toHaveLength(3);
  mark.center.forEach((v, i) => expect(v).toBeCloseTo([0, 0, 4][i], 4));
  // Out of the face the hole is drilled into, towards where it was seen from.
  mark.normal.forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i], 6));
  const row = page.locator(".annotation-row");
  await expect(row.locator("strong")).toHaveText("⌀5.00 mm");
  await expect(row).toContainText("Circle");
  await expect(page.locator(".measure-label")).toContainText("⌀5.00 mm");

  // Measured again, the same hole's two readings are not printed one over the
  // other, and neither sits on the hole.
  for (const deg of [60, 180, 300])
    await click(page, await screenOf(page, rim(deg)));
  await expect(reading(page)).toHaveText("⌀5.00 mm");
  const boxes = await page
    .locator(".measure-label")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(2);
  const [a, b] = boxes;
  expect(
    a.bottom <= b.top ||
      b.bottom <= a.top ||
      a.right <= b.left ||
      b.right <= a.left,
  ).toBe(true);
  const near = await screenOf(page, rim(270));
  for (const box of boxes) expect(box.top).toBeGreaterThan(near.y);

  // Three points in a line fit no circle; the third is asked for again.
  await click(page, await screenOf(page, [-7, 4, 4]));
  await click(page, await screenOf(page, [-5, 4, 4]));
  await click(page, await screenOf(page, [-3, 4, 4]));
  await expect(page.locator("#toast")).toHaveText(
    "No circle runs through those points — click three separate points spread around the rim.",
  );
  await expect(reading(page)).toHaveText("Click the third point");

  await page.locator("#submit-feedback").click();
  await expect
    .poll(() => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(dir, "fake-gateway.json"), "utf8"),
        ).calls.find((c) => c.method === "chat.send")?.params.message;
      } catch {
        return null;
      }
    })
    .toMatch(
      /M1: measurement, 5 mm diameter, the circle through three points on mesh-0 source face \d+, mesh-0 source face \d+ and mesh-0 source face \d+\n/,
    );
});

test("a GLB is measured as triangles, even carrying a STEP's face ranges", async ({
  page,
}) => {
  /* The plate's own tessellation published as a GLB: the same triangles, and
     in its extras the same face ranges, which are trusted only from a STEP the
     service converted. As triangles, where the front runs into a round there
     is nothing to take. GLB now uses the same Z-up frame as the STEP source. */
  const { glb } = await convertStepDetached(
    fs.readFileSync(path.join(repo, "tests/fixtures/plate.step")),
  );
  const file = path.join(dir, "plate-mesh.glb");
  fs.writeFileSync(file, glb);
  await open(page, "mm", file);
  await page.locator('.orient-face[data-view="0,0,1"]').dispatchEvent("click");
  await page.getByRole("button", { name: "Edge length", exact: true }).click();
  const tangent = await screenOf(page, [8, -7.5, 0], "glb");
  await click(page, { x: tangent.x - 3, y: tangent.y });
  await expect(page.locator("#toast")).toHaveText(
    "No straight edge there — point closer to a sharp edge.",
  );
  await expect(reading(page)).toHaveText("");
});
