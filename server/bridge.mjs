import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export class OpenClawBridge {
  constructor(sessionKey, { enabled = true } = {}) {
    this.sessionKey = sessionKey;
    this.enabled = enabled;
    this.cached = null;
    this.pending = null;
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
    if (this.cached && Date.now() - this.cached.at < 4000)
      return this.cached.data;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const data = await this.call("chat.history", {
        sessionKey: this.sessionKey,
        limit: 80,
        maxBytes: 160000,
      });
      const messages = (data.messages || [])
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
      const result = {
        connected: true,
        busy: !!data.inFlightRun,
        messages: messages.slice(-40),
      };
      this.cached = { at: Date.now(), data: result };
      return result;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}
