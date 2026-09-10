import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeOrigin, deliveryParams } from "./origin.mjs";
const exec = promisify(execFile);

export class OpenClawBridge {
  constructor(sessionKey, { enabled = true } = {}) {
    this.origin = normalizeOrigin(sessionKey);
    this.sessionKey = this.origin?.sessionKey;
    this.enabled = enabled && !!this.origin;
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
    if (data.error || data.ok === false) {
      // Keep the host's own reason: this is the only place it exists, and the
      // caller converts it to a fixed user-facing message anyway.
      const reason =
        typeof data.error === "string"
          ? data.error
          : JSON.stringify(data.error ?? data);
      const failure = new Error(
        `OpenClaw 未接納請求：${String(reason).slice(0, 300)}`,
      );
      failure.method = method;
      throw failure;
    }
    return data;
  }
  async send(message, id) {
    let fence = {};
    if (this.origin?.sessionId) {
      const history = await this.call("chat.history", {
        sessionKey: this.sessionKey,
        limit: 1,
        maxBytes: 2000,
      });
      const info = history.sessionInfo || history;
      if (
        (history.sessionId || info.sessionId) !== this.origin.sessionId ||
        !Object.hasOwn(info, "activeLeafEntryId")
      ) {
        throw new Error(
          "原會話已變更或宿主無法核對；提交保留，沒有轉送到新任務。",
        );
      }
      // Host revalidates both under the admission writer barrier. A check then
      // an unfenced send would still race /new. Never use steer here.
      fence = {
        sessionId: this.origin.sessionId,
        expectedLeafEntryId: info.activeLeafEntryId,
        queueMode: "collect",
      };
    }
    return this.call("chat.send", {
      ...deliveryParams(this.origin),
      ...fence,
      message,
      idempotencyKey: id,
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
