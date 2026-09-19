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

/* Read from the middle of the frame, which at these views is model and nothing
   else: no toolbar, no cube, no ground. Everything the rig has to hold — how
   far the model sits from its paper, how much tone it occupies, how dark its
   shaded side goes — is a number out of this one crop. */
async function centreStats(page, frac = 0.4) {
  const box = await page.locator("#viewer").boundingBox();
  const edge = (1 - frac) / 2;
  const shot = await page.screenshot({
    clip: {
      x: box.x + box.width * edge,
      y: box.y + box.height * edge,
      width: box.width * frac,
      height: box.height * frac,
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
      let onBackdrop = 0,
        colour = 0,
        onModel = 0;
      for (let i = 0; i < px.length; i += 4) {
        hist.push(lum(px[i], px[i + 1], px[i + 2]));
        if (flat.every((v, k) => Math.abs(px[i + k] - v) < 6)) {
          onBackdrop++;
          continue;
        }
        onModel++;
        const hi = Math.max(px[i], px[i + 1], px[i + 2]),
          lo = Math.min(px[i], px[i + 1], px[i + 2]);
        colour += hi ? (hi - lo) / hi : 0;
      }
      hist.sort((a, b) => a - b);
      const q = (p) => +hist[Math.floor(hist.length * p)].toFixed(1);
      return {
        bgLum: +bgLum.toFixed(1),
        p05: q(0.05),
        median: q(0.5),
        p95: q(0.95),
        gap: +(bgLum - q(0.5)).toFixed(1),
        // What is left of the model once the curve has had it. A washed-out
        // render is a silhouette with no modelling inside it.
        spread: +(q(0.95) - q(0.05)).toFixed(1),
        // How much colour is left in the pixels that are the model. A curve
        // with a shoulder pulls everything bright towards white and takes the
        // hue with it, and that shows here long before it shows in luminance.
        colour: +(onModel ? colour / onModel : 0).toFixed(3),
        // If the model ever stops filling the middle this stops being a
        // measurement of the model, and the case should say so rather than
        // quietly grade the paper.
        onBackdrop: +(onBackdrop / hist.length).toFixed(3),
      };
    },
    [shot.toString("base64"), backdrop],
  );
}

async function goHome(page, { dark = false } = {}) {
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Label tool", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1200);
}

async function turnUnder(page) {
  // The bottom face is on the far side of the cube from home, so it cannot be
  // clicked directly: go via the front-bottom edge, exactly as a reviewer does.
  await page.locator('[data-view="0,-1,1"]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-view="0,-1,0"]').click();
  await page.waitForTimeout(1200); // orbit damping settles
}

async function bottomView(page) {
  await goHome(page);
  await turnUnder(page);
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
  await goHome(page);
  const seen = await centreStats(page);
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

/* Plain view exists to take a model's own colours off it and show it in the
   one grey an unpainted model already wears. On a model that never had any,
   there is by definition nothing to take off, so the button has nothing to do
   — and for two versions it did something anyway, because the grey it painted
   with was a second constant that had drifted away from the first. */
test("plain view leaves an already unpainted model alone", async ({ page }) => {
  publish("no-material-bracket.glb", "plain");
  await goHome(page);
  const before = await centreStats(page);
  await page.locator("#neutral-view").click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.neutral),
    )
    .toBe(true);
  await page.waitForTimeout(600);
  const after = await centreStats(page);
  console.log("PLAIN", JSON.stringify({ before, after }));
  expect(before.onBackdrop).toBeLessThan(0.45);
  expect(Math.abs(after.median - before.median)).toBeLessThan(4);
});

/* The shaded side has a floor as well as a ceiling. "Not black" was the only
   rail it had, and a rig change slid the whole window down until the underside
   was a hair above black with every case still green. */
test("the shaded side keeps enough light to read", async ({ page }) => {
  // The part that carries its own colour, because that is the one a change to
  // the lamps takes down: an unpainted one has its grey re-solved with them.
  publish("parametric-bracket.glb", "floor");
  await goHome(page);
  await turnUnder(page);
  const seen = await centreStats(page);
  console.log("FLOOR", JSON.stringify(seen));
  expect(seen.onBackdrop).toBeLessThan(0.45);
  expect(seen.median).toBeGreaterThan(45);
});

/* A model that brought its own colours has to keep the tone that distinguishes
   one surface from the next. A curve with a shoulder rolls them together at
   the top: a whole building came back as one flat sheet of near-white with a
   silhouette around it. */
test("a coloured model keeps the tone between its surfaces", async ({
  page,
}) => {
  publish("bunny-figurine.glb", "tone");
  await goHome(page);
  const seen = await centreStats(page);
  console.log("TONE", JSON.stringify(seen));
  expect(seen.onBackdrop).toBeLessThan(0.8);
  expect(seen.colour).toBeGreaterThan(0.15);
});
