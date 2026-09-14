// An instance used to outlive the round it was opened for. Nothing ever stopped
// on its own, so a project paused two days earlier was still listening on a LAN
// address with a 30-day browser session behind it. Reclaiming is cheap because
// the round lives in state.json, not in this process: reopening restores the
// models, the drafts and the marks. What is lost is the URL, and that is the
// trade this was asked for.
//
// **What does not count as use is the whole design.** The viewer polls state
// every 2.2s and heartbeats every 10s, so a tab nobody is looking at sends
// roughly 47,000 requests a day. Treating "a request arrived" as use would keep
// alive exactly the forgotten tabs this exists to collect.
//
// So the anchor is the signal the access layer already trusts to answer the
// same question: `POST /api/access/activity`, which the viewer sends only for a
// trusted pointer or key event in a visible tab, at most once a minute. Every
// other thing a person can do also produces that signal, which is why an
// unlisted route defaults to "not use" — a route added later cannot silently
// grant immortality, it can only fail to extend a life the gesture already did.

// Deliberately excluded, and each one for a reason that is not obvious:
//   GET  /api/state            the 2.2s poll
//   POST /api/review/heartbeat the 10s lock heartbeat — a heartbeat is presence,
//                              not use, and presence was ruled not to exempt
//   GET  /api/health           probed by ensure() on every open and by anything
//                              watching; counting it would reset the clock forever
//   POST /api/ready            looks like a person loading the page, but
//                              readState() re-issues it by itself after
//                              ACCESS_REQUIRED. That is the service healing a
//                              tab, not a person opening one.
const VIEWER_USE = new Set([
  "POST /api/access/activity",
  "POST /api/access/claim",
  "POST /api/access/exchange",
  "PUT /api/draft",
  "POST /api/feedback",
  "POST /api/review/begin",
  "POST /api/review/resume",
  "POST /api/review/finish",
]);

export function viewerUse(method, routePath) {
  return VIEWER_USE.has(`${method} ${routePath}`);
}

// The agent's reads are inspection: `status` is polled by tooling, by the
// manager and by whoever is debugging, and a poll must never be the reason a
// project stays up. Everything that changes the round is a write. `/maintenance`
// is the manager stopping this process — the one write that is not a reason to
// keep living.
export function agentUse(method, routePath) {
  return (
    method !== "GET" &&
    method !== "HEAD" &&
    !routePath.startsWith("/maintenance")
  );
}

export class IdleWatch {
  constructor({ idleMs, now = Date.now }) {
    this.idleMs = idleMs;
    this.now = now;
    this.usedAt = now();
    this.closingAt = null;
  }
  use(at = this.now()) {
    this.usedAt = at;
    // Someone who comes back inside the announced window keeps the round. The
    // notice is a warning, not a decision already taken.
    this.closingAt = null;
  }
  // One tick of grace between the notice and the exit. Without it the viewer's
  // next poll gets a bare connection error, which is indistinguishable from a
  // crash — the page would break with no way to say why, and the person would
  // have no reason to believe their marks survived.
  tick(at = this.now()) {
    if (at - this.usedAt < this.idleMs) {
      this.closingAt = null;
      return "active";
    }
    if (this.closingAt === null) {
      this.closingAt = at;
      return "closing";
    }
    return "expired";
  }
  notice() {
    return this.closingAt === null
      ? null
      : { reason: "idle", idleSince: this.usedAt, since: this.closingAt };
  }
}

export const IDLE_HOURS = 24;

// Hours rather than milliseconds because this is the one number a person is
// meant to reason about. Zero turns reclaiming off; anything unreadable falls
// back to the default rather than to "never", because a bad value should not
// quietly restore the behaviour this replaced.
export function idleMsFrom(value, fallbackHours = IDLE_HOURS) {
  if (value === undefined || value === null || value === "")
    return fallbackHours * 3_600_000;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return fallbackHours * 3_600_000;
  return hours * 3_600_000;
}
