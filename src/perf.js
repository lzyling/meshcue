export const PERF_TARGET = 30;
export const PERF_WARNING = 20;
export const PERF_WINDOW_MS = 1000;
export const PERF_IDLE_MS = 300;
export function performanceVerdict(fps) {
  return fps >= PERF_TARGET
    ? "normal"
    : fps >= PERF_WARNING
      ? "warning"
      : "bad";
}
export function softwareRenderer(renderer = "") {
  return /swiftshader|llvmpipe|software|microsoft basic render driver/i.test(
    renderer,
  );
}

// Intervals measure delivered render cadence (including scheduling/GPU stalls),
// not JavaScript alone. Idle frames must neither inflate the next interaction's
// FPS nor turn a stationary continuous loop into a performance claim.
export class FrameWindow {
  constructor() {
    this.samples = [];
    this.last = null;
    this.activeUntil = 0;
    this.pendingActivity = false;
  }
  activity(now) {
    this.activeUntil = now + PERF_IDLE_MS;
    this.pendingActivity = true;
  }
  sample(now, active = this.pendingActivity || now < this.activeUntil) {
    // Sampling happens after rendering, which can itself exceed the idle grace
    // period on software renderers. Consume input once at the next sample so
    // slow interaction frames still count; do not extend the deadline from the
    // frame's end, or a stationary render loop could keep claiming activity.
    this.pendingActivity = false;
    if (!active) {
      this.samples = [];
      this.last = null;
      return this.snapshot();
    }
    if (this.last !== null && now > this.last)
      this.samples.push({ at: now, ms: now - this.last });
    this.last = now;
    this.samples = this.samples.filter((s) => s.at > now - PERF_WINDOW_MS);
    return this.snapshot();
  }
  snapshot() {
    if (!this.samples.length)
      return {
        idle: this.last === null,
        fps: null,
        averageMs: null,
        worstMs: null,
        verdict: null,
        samples: 0,
      };
    const averageMs =
      this.samples.reduce((n, s) => n + s.ms, 0) / this.samples.length;
    const fps = 1000 / averageMs;
    return {
      idle: false,
      fps,
      averageMs,
      worstMs: Math.max(...this.samples.map((s) => s.ms)),
      verdict: performanceVerdict(fps),
      samples: this.samples.length,
    };
  }
}

// Explicit allowlist: callers may hold filenames, source geometry or marks,
// but none can accidentally enter a report by spreading a diagnostics object.
export function performanceReport(snapshot, labels) {
  const value = (v) =>
    v == null
      ? labels.unavailable
      : typeof v === "number"
        ? Number(v.toFixed(2))
        : v;
  const yes = (v) => (v ? labels.on : labels.off);
  return [
    labels.title,
    `${labels.userAgent}: ${snapshot.userAgent}`,
    `${labels.fps}: ${snapshot.idle ? labels.idle : value(snapshot.fps)}`,
    `${labels.average}: ${snapshot.idle ? labels.idle : value(snapshot.averageMs)}`,
    `${labels.worst}: ${snapshot.idle ? labels.idle : value(snapshot.worstMs)}`,
    `${labels.gpu}: ${snapshot.gpuAvailable === false ? labels.unavailable : snapshot.idle ? labels.idle : value(snapshot.gpuMs)}`,
    `${labels.target}: ${PERF_TARGET} FPS — ${snapshot.idle ? labels.idle : labels[snapshot.verdict] || labels.unavailable}`,
    `${labels.renderer}: ${snapshot.renderer}`,
    `${labels.software}: ${yes(snapshot.software)}`,
    `${labels.style}: ${snapshot.style}`,
    `${labels.canvas}: ${snapshot.width} × ${snapshot.height}`,
    `${labels.pixelRatio}: ${snapshot.pixelRatio}`,
    `${labels.triangles}: ${snapshot.triangles}`,
    `${labels.calls}: ${snapshot.calls}`,
    `${labels.geometries}: ${snapshot.geometries}`,
    `${labels.textures}: ${snapshot.textures}`,
    `${labels.section}: ${yes(snapshot.section)}`,
  ].join("\n");
}
