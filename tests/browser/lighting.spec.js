import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

const repo = process.cwd(),
  url = "http://127.0.0.1:43174";
let child, dir, env;

function publish(file, version) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/reviewctl.mjs",
        "publish",
        `../../media/3d/3d-agent-review/samples/${file}`,
        "--name",
        "lighting",
        "--version",
        version,
      ],
      { cwd: repo, env, encoding: "utf8" },
    ),
  );
}

test.beforeEach(async () => {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp", "light-"));
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

/* Reads the canvas back through the browser: a WebGL drawing buffer cannot be
   sampled after the frame, but a screenshot of it can be decoded by the same
   page that produced it. */
async function viewerLuminance(page) {
  const shot = await page.locator("#viewer").screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    const hist = [];
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      hist.push(l);
      if (l < 25) dark++;
    }
    hist.sort((a, b) => a - b);
    return {
      total: hist.length,
      darkFraction: +(dark / hist.length).toFixed(4),
      p01: +hist[Math.floor(hist.length * 0.01)].toFixed(1),
      median: +hist[Math.floor(hist.length * 0.5)].toFixed(1),
    };
  }, shot.toString("base64"));
}

/* How far the model sits from the paper it is drawn on, read from the middle
   of the frame — which at the opening view is model and nothing else, no
   toolbar, no cube, no ground. */
async function separationFromBackdrop(page) {
  const box = await page.locator("#viewer").boundingBox();
  const shot = await page.screenshot({
    clip: {
      x: box.x + box.width * 0.3,
      y: box.y + box.height * 0.3,
      width: box.width * 0.4,
      height: box.height * 0.4,
    },
  });
  const backdrop = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.background,
  );
  return page.evaluate(
    async ([b64, bg]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      const px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const flat = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
      const bgLum = lum(...flat);
      const hist = [];
      let onBackdrop = 0;
      for (let i = 0; i < px.length; i += 4) {
        hist.push(lum(px[i], px[i + 1], px[i + 2]));
        if (flat.every((v, k) => Math.abs(px[i + k] - v) < 6)) onBackdrop++;
      }
      hist.sort((a, b) => a - b);
      const median = hist[Math.floor(hist.length * 0.5)];
      return {
        bgLum: +bgLum.toFixed(1),
        median: +median.toFixed(1),
        gap: +(bgLum - median).toFixed(1),
        // If the model ever stops filling the middle this stops being a
        // measurement of the model, and the case should say so rather than
        // quietly grade the paper.
        onBackdrop: +(onBackdrop / hist.length).toFixed(3),
      };
    },
    [shot.toString("base64"), backdrop],
  );
}

async function bottomView(page) {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Label tool", exact: true }),
  ).toBeEnabled();
  // The bottom face is on the far side of the cube from home, so it cannot be
  // clicked directly: go via the front-bottom edge, exactly as a reviewer does.
  await page.locator('[data-view="0,-1,1"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-view="0,-1,0"]').click();
  await page.waitForTimeout(1200); // orbit damping settles
  return viewerLuminance(page);
}

test("a model that carries its own materials is readable from below", async ({
  page,
}) => {
  publish("parametric-bracket.glb", "control");
  const seen = await bottomView(page);
  console.log("WITH MATERIALS", JSON.stringify(seen));
  expect(seen.darkFraction).toBeLessThan(0.02);
});

test("a model with no materials at all is readable from below", async ({
  page,
}) => {
  publish("no-material-bracket.glb", "repro");
  const seen = await bottomView(page);
  console.log("NO MATERIALS", JSON.stringify(seen));
  expect(seen.darkFraction).toBeLessThan(0.02);
});

/* The other edge of the same knife. 1.0.2 fixed a black underside by giving
   these models a grey, and the grey it gave them was bright enough that a part
   lit from above came out level with the paper: the shape was there, the
   fillets and the parting lines were not. Only the dark end was nailed down,
   so the fix was free to run past the far end without a single case going red.
   Both ends are nailed down now. */
test("a model stands out from the paper it is drawn on", async ({ page }) => {
  publish("no-material-bracket.glb", "washout");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Label tool", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1200);
  const seen = await separationFromBackdrop(page);
  console.log("WASHOUT", JSON.stringify(seen));
  expect(seen.onBackdrop).toBeLessThan(0.45);
  expect(seen.gap).toBeGreaterThan(30);
});

/* The substitute is for a file that names no material at all. A file that does
   name one has already said what it wants to look like, and the answer to a
   dark underside is never to paint over someone's model. */
test("a model that brought its own colour keeps it", async ({ page }) => {
  publish("bunny-figurine.glb", "coloured");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  const shot = await page.locator("#viewer").screenshot();
  const backdrop = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.background,
  );
  const warmth = await page.evaluate(
    async ([b64, bg]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      const px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const flat = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
      let red = 0,
        blue = 0,
        seen = 0;
      for (let i = 0; i < px.length; i += 4) {
        // The canvas is one flat colour behind the model, and the ground is
        // drawn from two more of the same family. Anything far enough from it
        // is the model itself.
        if (flat.every((v, k) => Math.abs(px[i + k] - v) < 18)) continue;
        red += px[i];
        blue += px[i + 2];
        seen++;
      }
      return { seen, red: red / seen, blue: blue / seen };
    },
    [shot.toString("base64"), backdrop],
  );
  console.log("OWN MATERIALS", JSON.stringify(warmth));
  // The figurine is cream; the substitute grey is colder than its own paper.
  expect(warmth.seen).toBeGreaterThan(10000);
  expect(warmth.red).toBeGreaterThan(warmth.blue);
});

/* The ground is a floor, not a pane of glass held under the model. */
test("the ground stays out of the way of the model and of a look from below", async ({
  page,
}) => {
  publish("no-material-bracket.glb", "ground");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  const home = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.ground,
  );
  expect(home.visible).toBe(true);
  // The fit puts the longest axis at ±1.5, so a ground left at -1.4 cuts the
  // base off every model that stands taller than it is wide.
  expect(home.y).toBeLessThanOrEqual(-1.5);

  await page.locator('[data-view="0,-1,1"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-view="0,-1,0"]').click();
  await page.waitForTimeout(1200);
  const below = await page.evaluate(
    () => window.__reviewDiagnostics().viewer.ground,
  );
  expect(below.visible).toBe(false);
});
