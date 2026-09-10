// Diagnostics for a service that runs unattended: stdout/stderr are redirected
// to runtime/server.log by both scripts/service.mjs and the managed launcher.
// Never log credentials, cookie or grant values, or annotation payloads; a
// review's log file outlives the review and is not access controlled.
const RANK = { error: 1, warn: 2, info: 3 };
const configured = RANK[process.env.REVIEW_LOG_LEVEL];
const threshold =
  process.env.REVIEW_LOG_LEVEL === "silent" ? 0 : (configured ?? RANK.info);

function emit(rank, label, scope, message, detail) {
  if (rank > threshold) return;
  const fields = Object.entries(detail || {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  const suffix = fields.length
    ? ` ${JSON.stringify(Object.fromEntries(fields))}`
    : "";
  const line = `${new Date().toISOString()} ${label} [${scope}] ${message}${suffix}`;
  if (rank === RANK.info) console.log(line);
  else console.error(line);
}

export const log = {
  error: (scope, message, detail) => emit(1, "ERROR", scope, message, detail),
  warn: (scope, message, detail) => emit(2, "WARN ", scope, message, detail),
  info: (scope, message, detail) => emit(3, "INFO ", scope, message, detail),
};

// Keep a bounded, single-line stack so one failure cannot flood the log file.
export function errorDetail(error) {
  if (!error) return { error: "unknown" };
  return {
    error: String(error.message || error).slice(0, 500),
    code: error.code,
    stack: error.stack?.split("\n").slice(1, 5).join(" | ").slice(0, 1000),
  };
}
