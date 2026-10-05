import { clickControl } from "./b1u-shell-helpers.mjs";
import { test, expect } from "./fixtures.mjs";
import { browserServerUrl } from "../helpers/browser-server.mjs";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { bracketGltf, externalGltf } from "../fixtures/gltf-fixtures.mjs";

const repo = process.cwd();
const evidence = path.join(repo, "tmp/b1-g/evidence");
let dir, env, child, url;
const ctl = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, ["scripts/reviewctl.mjs", ...args], {
      env,
      encoding: "utf8",
    }),
  );
test.beforeEach(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  dir = fs.mkdtempSync(path.join(repo, "tmp/gltf-browser-"));
  env = {
    ...process.env,
    PORT: "0",
    REVIEW_DATA_DIR: dir,
    REVIEW_MEDIA_DIR: path.join(dir, "models"),
    REVIEW_DIST_DIR: process.env.REVIEW_TEST_DIST,
    REVIEW_SESSION_KEY: "test-only-review-session",
    REVIEW_UPDATE_CHECK: "off",
  };
  const log = fs.openSync(path.join(dir, "server.log"), "a");
  child = spawn(process.execPath, ["server/index.mjs"], {
    env,
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  url = await browserServerUrl(child, dir);
});
test.afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
async function publish(page, kind) {
  let file = path.join(dir, `${kind}.glb`);
  if (kind === "external") {
    externalGltf(path.join(dir, "external"));
    file = path.join(dir, "external/bracket.gltf");
  } else fs.writeFileSync(file, bracketGltf(kind));
  const published = ctl(
    "publish",
    file,
    "--name",
    "Bracket",
    "--version",
    kind,
  );
  await page.goto(url);
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator('[data-mode="label"]')).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().modelFilename))
    .toBe(published.model.filename);
  // Model readiness precedes the state poll that populates the tab strip.
  // Wait for that layout and its ResizeObserver before comparing canvases.
  if (kind !== "external")
    await expect(page.locator("#version-tabs")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewer = document.querySelector("#viewer");
        const canvas = viewer.querySelector("canvas");
        return (
          Math.abs(
            canvas.getBoundingClientRect().height -
              viewer.getBoundingClientRect().height,
          ) < 1
        );
      }),
    )
    .toBe(true);
  // First-use hints are intentionally absent on subsequent loads. Dismiss the
  // initial one so the format comparison measures the same visible UI state.
  if (await page.locator("#dismiss-tool-hint").isVisible())
    await page.locator("#dismiss-tool-hint").click();
  await page.locator('[data-view="0,0,1"]').press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.__reviewDiagnostics().viewer.meshes))
    .toBe(3);
  // Camera damping settles before comparing raster output and clicking a face.
  await page.waitForTimeout(500);
}
async function screenshot(page, name) {
  const shot = await page.locator("#viewer canvas").screenshot();
  fs.writeFileSync(path.join(evidence, `${name}.png`), shot);
  return shot.toString("base64");
}
async function pin(page) {
  await clickControl(page, '[data-mode="label"]');
  const box = await page.locator("#viewer").boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.42);
  await expect(page.locator("#annotation-count")).toHaveText("1");
  await expect(page.locator("#save-status")).toHaveText("Draft saved");
  return page.evaluate(() => {
    const { meshId, sourceFaceIndex } =
      window.__reviewDiagnostics().annotations[0];
    return { meshId, sourceFaceIndex };
  });
}
async function manifest(page) {
  const id = await page.evaluate(() => window.__reviewDiagnostics().versionId);
  const saved = JSON.parse(
    fs.readFileSync(path.join(dir, "manifests", `${id}.json`), "utf8"),
  );
  return saved.meshes.map(({ matrixWorld, ...entry }) => entry);
}
async function difference(page, first, second) {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const a = await decode(first),
        b = await decode(second);
      if (a.length !== b.length)
        throw new Error("Screenshot dimensions changed");
      let changed = 0;
      for (let i = 0; i < a.length; i += 4)
        if (
          Math.max(...[0, 1, 2].map((c) => Math.abs(a[i + c] - b[i + c]))) > 12
        )
          changed++;
      return changed / (a.length / 4);
    },
    [first, second],
  );
}
for (const kind of ["draco", "meshopt", "quantized"]) {
  test(`${kind} renders offline like the plain bracket and pins the same source face`, async ({
    page,
  }) => {
    const external = [];
    await page.route("**/*", (route) => {
      const request = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(request.protocol) &&
        request.origin !== url
      ) {
        external.push(request.href);
        return route.abort();
      }
      return route.continue();
    });
    // Seed an unrelated version so both compared files are new latest tabs,
    // with the same tab-strip layout and no earlier-version overlay.
    const seeded = path.join(dir, "seed.glb");
    fs.writeFileSync(
      seeded,
      bracketGltf(kind === "quantized" ? "draco" : "quantized"),
    );
    ctl("publish", seeded, "--name", "Bracket", "--version", "seed");
    await publish(page, "plain");
    const plain = await screenshot(page, `${kind}-plain`);
    const plainPin = await pin(page);
    const plainManifest = await manifest(page);
    await publish(page, kind);
    const compressed = await screenshot(page, kind);
    const ratio = await difference(page, plain, compressed);
    expect(ratio).toBeLessThan(0.005);
    expect(await pin(page)).toEqual(plainPin);
    expect(await manifest(page)).toEqual(plainManifest);
    await screenshot(page, `${kind}-marked`);
    expect(plainPin.sourceFaceIndex).toEqual(expect.any(Number));
    expect(plainPin.meshId).toEqual(expect.any(String));
    expect(external).toEqual([]);
    // Routing disables HTTP cache; reloading creates new decoder workers,
    // so the local review package must supply the decoder again.
    await page.reload();
    await expect(page.locator("#loading")).toBeHidden();
    expect(
      await page.evaluate(
        () => window.__reviewDiagnostics().annotations[0].sourceFaceIndex,
      ),
    ).toBe(plainPin.sourceFaceIndex);
    fs.writeFileSync(
      path.join(evidence, `${kind}.json`),
      JSON.stringify(
        {
          changedPixelFraction: ratio,
          pin: plainPin,
          externalRequests: external,
        },
        null,
        2,
      ),
    );
  });
}
test("external glTF publishes, renders its embedded PNG and keeps a saved mark", async ({
  page,
}) => {
  await publish(page, "external");
  await expect
    .poll(() =>
      page.evaluate(() => window.__reviewDiagnostics().viewer.textures),
    )
    .toBeGreaterThan(0);
  const mark = await pin(page);
  await screenshot(page, "external-gltf");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(
      () => window.__reviewDiagnostics().annotations[0].sourceFaceIndex,
    ),
  ).toBe(mark.sourceFaceIndex);
  const filename = await page.evaluate(
    () => window.__reviewDiagnostics().modelFilename,
  );
  expect(filename).toMatch(/\.glb$/);
});
