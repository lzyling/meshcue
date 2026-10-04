import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { acquireBrowserLock } from "../../scripts/browser-lock.mjs";
import { startScenario } from "../../scripts/scenario-env.mjs";
import { scenarioKit } from "./kit.mjs";

const release = await acquireBrowserLock();
let environment, browser;
try {
  environment = await startScenario({
    fixture: process.argv[2] || "tmp/samples/parametric-bracket.glb",
  });
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    reducedMotion: "reduce",
  });
  const kit = scenarioKit(page, environment);
  await kit.open(environment.url);
  const screenshot = await kit.screenshot("smoke", { viewerOnly: true });
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let differing = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        Math.abs(data[i] - data[0]) +
          Math.abs(data[i + 1] - data[1]) +
          Math.abs(data[i + 2] - data[2]) >
        30
      )
        differing++;
    return { differing, total: data.length / 4 };
  }, fs.readFileSync(screenshot).toString("base64"));
  assert.ok(
    pixels.differing > pixels.total * 0.01,
    "Fixture screenshot must contain rendered detail",
  );
  console.log(
    JSON.stringify({ passed: 1, failed: 0, screenshot, ...pixels }, null, 2),
  );
} finally {
  await browser?.close();
  await environment?.stop();
  release();
}
