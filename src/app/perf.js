import { DISPLAY_LABELS } from "./display-labels.js";
import { t } from "../i18n/index.js";
import {
  FrameWindow,
  PERF_IDLE_MS,
  performanceReport,
  softwareRenderer,
} from "../perf.js";
import { gpuTimer } from "../viewer/perf-gpu.js";

export function bindPerformance(review) {
  const viewer = review.viewer;
  let stop = null,
    snapshot = null,
    sampledFrames = 0;
  const stats = viewer.stats;
  viewer.stats = () => ({
    ...stats.call(viewer),
    performance: {
      enabled: !!stop,
      sampledFrames,
      snapshot,
    },
  });
  const labelKeys = {
    title: "perf.title",
    userAgent: "perf.userAgent",
    renderer: "perf.renderer",
    software: "perf.software",
    style: "perf.style",
    canvas: "perf.canvas",
    pixelRatio: "perf.pixelRatio",
    triangles: "perf.triangles",
    calls: "perf.calls",
    geometries: "perf.geometries",
    textures: "perf.textures",
    section: "perf.section",
    fps: "perf.fps",
    average: "perf.average",
    worst: "perf.worst",
    gpu: "perf.gpu",
    target: "perf.target",
    on: "perf.on",
    off: "perf.off",
    idle: "perf.idle",
    unavailable: "perf.unavailable",
    normal: "perf.normal",
    warning: "perf.warning",
    bad: "perf.bad",
  };
  const labels = Object.fromEntries(
    Object.entries(labelKeys).map(([key, value]) => [key, t(value)]),
  );
  review.commands.register({
    id: "performance",
    labelKey: "perf.title",
    captionKey: "perf.title",
    icon: "measure",
    group: "display",
    attributes: { id: "perf-toggle", "aria-pressed": "false" },
    run() {
      const button = review.$("#perf-toggle");
      if (stop) {
        stop();
        stop = null;
        button.setAttribute("aria-pressed", "false");
        return;
      }
      const panel = document.createElement("section");
      panel.id = "perf-panel";
      panel.setAttribute("aria-label", labels.title);
      const heading = document.createElement("strong");
      heading.textContent = labels.title;
      const output = document.createElement("pre");
      const copy = document.createElement("button");
      copy.id = "perf-copy";
      copy.textContent = t("perf.copy");
      copy.addEventListener("click", async () => {
        const copied = await review.copyText(
          performanceReport(snapshot, labels),
        );
        review.toast(t(copied ? "perf.copied" : "perf.copyFailed"));
      });
      panel.append(heading, output, copy);
      const shell = review.$(".viewer-shell");
      shell.append(panel);
      shell.classList.add("performance-open");
      button.setAttribute("aria-pressed", "true");
      const gl = viewer.renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : t("perf.unavailable");
      const timer = gpuTimer(gl);
      const window = new FrameWindow();
      let activeUntil = 0,
        paintedAt = -Infinity;
      const active = () => {
        activeUntil = performance.now() + PERF_IDLE_MS;
      };
      viewer.controls.addEventListener("change", active);
      const canvas = viewer.renderer.domElement;
      const events = ["pointerdown", "pointermove", "wheel"];
      for (const name of events)
        canvas.addEventListener(name, active, { passive: true });
      const onInput = (event) => {
        if (event.target.closest("#section-options, #display-menu")) active();
      };
      document.addEventListener("input", onInput);
      document.addEventListener("click", onInput);
      // Hooks occur after rendering. Scene callbacks bracket GPU work, but are
      // installed ONLY while enabled and restored on removal; OFF has neither
      // a frame hook, a timer query, nor an activity listener to run each frame.
      const before = viewer.scene.onBeforeRender,
        after = viewer.scene.onAfterRender;
      viewer.scene.onBeforeRender = function (...args) {
        before.apply(this, args);
        timer.begin();
      };
      viewer.scene.onAfterRender = function (...args) {
        timer.end();
        after.apply(this, args);
      };
      const sample = () => {
        const now = performance.now();
        sampledFrames++;
        const frame = window.sample(now, now < activeUntil);
        const info = viewer.renderer.info;
        snapshot = {
          ...frame,
          userAgent: navigator.userAgent,
          renderer,
          software: softwareRenderer(renderer),
          style: t(DISPLAY_LABELS[viewer.displayStyle]),
          width: canvas.width,
          height: canvas.height,
          pixelRatio: viewer.renderer.getPixelRatio(),
          triangles: info.render.triangles,
          calls: info.render.calls,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          section: !!viewer.section,
          gpuMs: timer.available ? timer.milliseconds : null,
          gpuAvailable: timer.available,
        };
        if (now - paintedAt < 200) return;
        paintedAt = now;
        panel.dataset.verdict = frame.verdict || "idle";
        // The clipboard includes user agent; on screen it needlessly takes
        // several lines of scarce space, so leave it to the report.
        output.textContent = performanceReport(snapshot, labels)
          .split("\n")
          .slice(2)
          .join("\n");
      };
      const unsubscribe = viewer.addFrameHook(sample);
      sample();
      stop = () => {
        unsubscribe();
        viewer.controls.removeEventListener("change", active);
        for (const name of events) canvas.removeEventListener(name, active);
        document.removeEventListener("input", onInput);
        document.removeEventListener("click", onInput);
        viewer.scene.onBeforeRender = before;
        viewer.scene.onAfterRender = after;
        timer.dispose();
        panel.remove();
        shell.classList.remove("performance-open");
        snapshot = null;
      };
    },
  });
}
