import test from "node:test";
import assert from "node:assert/strict";
import {
  FrameWindow,
  performanceVerdict,
  softwareRenderer,
  performanceReport,
} from "../src/perf.js";
import { gpuTimer } from "../src/viewer/perf-gpu.js";
import en from "../src/i18n/en/perf.js";
const labels = Object.fromEntries(
  Object.entries(en).map(([key, value]) => [key.slice(5), value]),
);

test("performance window measures average and worst delivered frame intervals", () => {
  const window = new FrameWindow();
  window.sample(0, true);
  window.sample(20, true);
  const result = window.sample(60, true);
  assert.equal(result.samples, 2);
  assert.equal(result.averageMs, 30);
  assert.equal(result.worstMs, 40);
  assert.equal(result.fps, 1000 / 30);
});

test("performance window expires old samples and excludes idle gaps", () => {
  const window = new FrameWindow();
  window.sample(0, true);
  window.sample(50, true);
  for (let now = 100; now <= 1100; now += 20) window.sample(now, true);
  assert.equal(window.snapshot().worstMs, 20);
  assert.equal(window.sample(2000, false).idle, true);
  assert.equal(window.sample(3000, true).fps, null);
  assert.equal(window.sample(3020, true).fps, 50);
});

test("performance verdict uses the fixed 30 FPS target and 20 FPS warning boundary", () => {
  assert.equal(performanceVerdict(30), "normal");
  assert.equal(performanceVerdict(29.99), "warning");
  assert.equal(performanceVerdict(20), "warning");
  assert.equal(performanceVerdict(19.99), "bad");
});

test("performance recognizes software renderers without classifying hardware as software", () => {
  for (const name of [
    "ANGLE (SwiftShader Device)",
    "llvmpipe (LLVM)",
    "Software Rasterizer",
    "Microsoft Basic Render Driver",
  ])
    assert.equal(softwareRenderer(name), true);
  for (const name of ["", "Apple M3", "NVIDIA RTX", "AMD Radeon", "Intel Iris"])
    assert.equal(softwareRenderer(name), false);
});

test("performance report includes only an allowlisted snapshot and honest unavailable GPU time", () => {
  const text = performanceReport(
    {
      userAgent: "browser-test",
      renderer: "SwiftShader",
      software: true,
      style: "Shaded",
      width: 800,
      height: 600,
      pixelRatio: 2,
      triangles: 500,
      calls: 4,
      geometries: 2,
      textures: 0,
      section: true,
      fps: 25,
      averageMs: 40,
      worstMs: 60,
      verdict: "warning",
      gpuMs: null,
      gpuAvailable: false,
      filename: "secret.step",
      model: { positions: [12345] },
      annotations: ["private"],
    },
    labels,
  );
  for (const value of [
    "browser-test",
    "SwiftShader",
    "Shaded",
    "800 × 600",
    "30 FPS",
    "Below target",
    "GPU time (ms): Not available",
  ])
    assert.ok(text.includes(value));
  assert.doesNotMatch(text, /secret|12345|private/);
  const idle = performanceReport({ idle: true, gpuAvailable: false }, labels);
  assert.match(idle, /FPS: Idle/);
  assert.match(idle, /GPU time \(ms\): Not available/);
});

test("GPU timer without the extension never submits queries", () => {
  const timer = gpuTimer({ getExtension: () => null });
  timer.begin();
  timer.end();
  timer.dispose();
  assert.equal(timer.available, false);
  assert.equal(timer.milliseconds, null);
});

test("GPU timer polls asynchronously, discards disjoint results and frees queries", () => {
  let available = false,
    disjoint = false,
    deleted = 0,
    begun = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ GPU_DISJOINT_EXT: 3, TIME_ELAPSED_EXT: 4 }),
    isContextLost: () => false,
    getParameter: () => disjoint,
    createQuery: () => ({}),
    beginQuery: () => begun++,
    endQuery() {},
    deleteQuery: () => deleted++,
    getQueryParameter: (_, parameter) =>
      parameter === 1 ? available : 2500000,
  };
  const timer = gpuTimer(gl);
  timer.begin();
  timer.end();
  timer.begin();
  assert.equal(begun, 1);
  assert.equal(timer.milliseconds, null);
  available = true;
  timer.begin();
  timer.end();
  assert.equal(timer.milliseconds, 2.5);
  disjoint = true;
  timer.begin();
  assert.equal(timer.milliseconds, null);
  assert.equal(deleted, 2);
  timer.dispose();
});
