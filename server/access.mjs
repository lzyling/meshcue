import crypto from "node:crypto";

const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const valid = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export class AccessError extends Error {
  constructor(
    message = "此入口未取得有效審閱權，請返回原對話。",
    status = 401,
    code = "ACCESS_REQUIRED",
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Credentials never persist. Issuance is local IPC only, for an eventual
// protected host adapter; no CLI, log or share-URL serialization is provided.
export class ReviewAccess {
  constructor({
    scope,
    now = Date.now,
    grantMs = 15 * 60_000,
    sessionMs = 60 * 60_000,
  } = {}) {
    this.scope = scope;
    this.now = now;
    this.grantMs = grantMs;
    this.sessionMs = sessionMs;
    this.grant = null;
    this.sessions = new Map();
    this.clients = new Map();
  }
  sweep() {
    const scope = this.scope();
    for (const [key, item] of this.sessions)
      if (item.expiresAt <= this.now() || item.scope !== scope)
        this.sessions.delete(key);
    const alive = new Set([...this.sessions.values()].map((item) => item.id));
    for (const [client, session] of this.clients)
      if (!alive.has(session)) this.clients.delete(client);
  }
  issue() {
    this.sweep();
    const value = crypto.randomBytes(32).toString("base64url");
    this.grant = {
      hash: digest(value),
      scope: this.scope(),
      expiresAt: this.now() + this.grantMs,
    };
    return { value, expiresAt: this.grant.expiresAt };
  }
  authenticate(value) {
    this.sweep();
    if (!valid(value)) throw new AccessError();
    const item = this.sessions.get(digest(value));
    if (!item) throw new AccessError();
    return item;
  }
  redeem(value, existing) {
    this.sweep();
    const grant = this.grant;
    if (
      !valid(value) ||
      !grant ||
      grant.expiresAt <= this.now() ||
      grant.scope !== this.scope() ||
      !crypto.timingSafeEqual(
        Buffer.from(digest(value)),
        Buffer.from(grant.hash),
      )
    )
      throw new AccessError(
        "臨時授權已失效，請返回原對話。",
        401,
        "ACCESS_EXPIRED",
      );
    // Renewing an entrance must not replace a live browser's edit identity.
    let item;
    try {
      item = this.authenticate(existing);
    } catch {
      /* new browser */
    }
    if (!item && this.sessions.size >= 32)
      throw new AccessError("審閱連線已達上限。", 429, "ACCESS_LIMIT");
    this.grant = null;
    if (item) return { value: existing, expiresAt: item.expiresAt };
    const sessionValue = crypto.randomBytes(32).toString("base64url");
    item = {
      id: crypto.randomUUID(),
      scope: grant.scope,
      expiresAt: this.now() + this.sessionMs,
      clients: new Set(),
    };
    this.sessions.set(digest(sessionValue), item);
    return { value: sessionValue, expiresAt: item.expiresAt };
  }
  claimClient(item, clientId) {
    if (
      typeof clientId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(clientId)
    )
      throw new AccessError("視窗識別不完整。", 400, "BAD_CLIENT");
    const owner = this.clients.get(clientId);
    if (owner && owner !== item.id)
      throw new AccessError(
        "此視窗屬於另一個審閱連線。",
        403,
        "CLIENT_OWNERSHIP",
      );
    if (!owner && item.clients.size >= 16)
      throw new AccessError("審閱視窗已達上限。", 429, "CLIENT_LIMIT");
    this.clients.set(clientId, item.id);
    item.clients.add(clientId);
  }
  ownsClient(item, clientId) {
    return this.clients.get(clientId) === item.id;
  }
  revoke() {
    this.grant = null;
    this.sessions.clear();
    this.clients.clear();
  }
  metadata() {
    this.sweep();
    return {
      required: true,
      scope: this.scope(),
      grantActive:
        !!this.grant &&
        this.grant.expiresAt > this.now() &&
        this.grant.scope === this.scope(),
      sessions: this.sessions.size,
      grantMinutes: this.grantMs / 60_000,
      sessionMinutes: this.sessionMs / 60_000,
    };
  }
}

export function sessionCookie(headers) {
  const values = (headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith("review_access="));
  if (values.length !== 1) return null;
  const value = values[0].slice("review_access=".length);
  return valid(value) ? value : null;
}

export function accessCookie(value, maxAge) {
  if (!valid(value)) throw new AccessError();
  return `review_access=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`;
}
