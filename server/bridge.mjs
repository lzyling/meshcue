import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export class OpenClawBridge {
  constructor(sessionKey, { enabled = true } = {}) {
    this.sessionKey = sessionKey;
    this.enabled = enabled;
    this.cached = null;
    this.pending = null;
    this.visibleMessages = new Map();
  }
  async call(method, params) {
    if (!this.enabled) throw new Error("此測試服務未啟用 OpenClaw 連線。");
    const { stdout } = await exec(
      "openclaw",
      [
        "gateway",
        "call",
        method,
        "--params",
        JSON.stringify(params),
        "--json",
        "--timeout",
        "20000",
      ],
      {
        timeout: 25000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const data = JSON.parse(stdout);
    if (data.error || data.ok === false)
      throw new Error("OpenClaw 未接納請求。");
    return data;
  }
  async send(message, id) {
    return this.call("chat.send", {
      sessionKey: this.sessionKey,
      message,
      idempotencyKey: id,
      deliver: false,
    });
  }
  async history(since = 0) {
    if (this.cached?.since === since && Date.now() - this.cached.at < 4000)
      return this.cached.data;
    if (this.pending) {
      await this.pending;
      return this.history(since);
    }
    this.pending = (async () => {
      let data;
      let offset;
      const seenOffsets = new Set();
      const raw = [];
      // Tool-heavy turns can fill an entire history page. Fetch a bounded
      // backfill and retain already-seen conversation text across polls.
      for (let page = 0; page < 3; page++) {
        const current = await this.call("chat.history", {
          sessionKey: this.sessionKey,
          limit: 80,
          maxBytes: 160000,
          ...(offset === undefined ? {} : { offset }),
        });
        data ||= current;
        raw.unshift(...(current.messages || []));
        const visible = raw.filter(
          (m) =>
            ["user", "assistant"].includes(m.role) &&
            m.channel !== "analysis" &&
            (typeof m.content === "string"
              ? m.content.trim()
              : (m.content || []).some(
                  (c) => c.type === "text" && c.text?.trim(),
                )),
        );
        const oldest = raw.reduce((min, m) => {
          const time = Number(m.timestamp) || Date.parse(m.timestamp);
          return Number.isFinite(time) ? Math.min(min, time) : min;
        }, Infinity);
        const next = current.nextOffset;
        if (
          visible.length >= 12 ||
          oldest < since ||
          !current.hasMore ||
          !Number.isInteger(next) ||
          seenOffsets.has(next)
        )
          break;
        seenOffsets.add(next);
        offset = next;
      }
      const messages = raw
        .filter(
          (m) =>
            ["user", "assistant"].includes(m.role) && m.channel !== "analysis",
        )
        .filter(
          (m) => (Number(m.timestamp) || Date.parse(m.timestamp) || 0) >= since,
        )
        .map((m) => ({
          id:
            m.__openclaw?.id || m.idempotencyKey || `${m.timestamp}-${m.role}`,
          role: m.role,
          timestamp: m.timestamp,
          text: (typeof m.content === "string"
            ? m.content
            : (m.content || [])
                .filter((c) => c.type === "text" && c.text)
                .map((c) => c.text)
                .join("\n")
          ).slice(0, 12000),
        }))
        .filter((m) => m.text.trim());
      for (const m of messages) this.visibleMessages.set(m.id, m);
      const retained = [...this.visibleMessages.values()]
        .filter(
          (m) => (Number(m.timestamp) || Date.parse(m.timestamp) || 0) >= since,
        )
        .sort(
          (a, b) =>
            (Number(a.timestamp) || Date.parse(a.timestamp) || 0) -
            (Number(b.timestamp) || Date.parse(b.timestamp) || 0),
        )
        .slice(-40);
      this.visibleMessages = new Map(retained.map((m) => [m.id, m]));
      const result = {
        connected: true,
        busy: !!data.inFlightRun,
        messages: retained,
      };
      this.cached = { at: Date.now(), since, data: result };
      return result;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}
