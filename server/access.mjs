import crypto from "node:crypto";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { privateIPv4 } from "./network.mjs";
import { log, errorDetail } from "./log.mjs";

function peerAddress(value) {
  const address =
    typeof value === "string" ? value.replace(/^::ffff:/i, "") : "";
  return net.isIP(address) === 4 &&
    (privateIPv4(address) || address.startsWith("127."))
    ? address
    : null;
}

const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const valid = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const clientIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const savedAccess = z
  .object({
    version: z.literal(1),
    browsers: z
      .array(
        z
          .object({
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            id: z.string().uuid(),
            scope: z.string().min(1).max(200),
            createdAt: z.number().nonnegative().finite(),
            lastUsedAt: z.number().nonnegative().finite(),
            expiresAt: z.number().nonnegative().finite(),
            label: z.string().max(80),
            lastAddress: z.string().max(64).nullable(),
            clients: z.array(clientIdSchema).max(64),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();

export function browserInfo(headers, address) {
  const ua = String(headers["user-agent"] || "");
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad/i.test(ua)
        ? "iOS"
        : /Macintosh/i.test(ua)
          ? "Mac"
          : "Browser";
  const name = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return {
    label: [os, name].filter(Boolean).join(" · "),
    lastAddress: peerAddress(address),
  };
}
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

// Raw credentials never persist here. Only non-replayable SHA-256 verifiers,
// scope, timestamps and edit-tab associations are saved; cookies stay in the browser.
export class ReviewAccess {
  constructor({
    scope,
    now = Date.now,
    grantMs = 15 * 60_000,
    sessionMs = 30 * 24 * 60 * 60_000,
    file = null,
    protectedClient = () => null,
  } = {}) {
    this.scope = scope;
    this.now = now;
    this.grantMs = grantMs;
    this.sessionMs = sessionMs;
    this.file = file;
    this.protectedClient = protectedClient;
    this.grant = null;
    this.sessions = new Map();
    this.clients = new Map();
    this.lastSaved = null;
    this.restore();
  }
  restore() {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      if (fs.statSync(this.file).size > 1_000_000) throw new Error();
      const saved = savedAccess.parse(
        JSON.parse(fs.readFileSync(this.file, "utf8")),
      );
      const ids = new Set();
      for (const { hash, clients, ...item } of saved.browsers) {
        if (
          ids.has(item.id) ||
          this.sessions.has(hash) ||
          item.lastUsedAt < item.createdAt ||
          item.expiresAt <= item.lastUsedAt
        )
          throw new Error();
        ids.add(item.id);
        this.sessions.set(hash, { ...item, clients: new Set(clients) });
        for (const client of clients) {
          if (this.clients.has(client)) throw new Error();
          this.clients.set(client, item.id);
        }
      }
      this.lastSaved = saved;
    } catch {
      throw new Error("瀏覽器授權記錄無法讀取；原檔未覆寫。");
    }
    this.sweep();
  }
  persist() {
    if (!this.file) return;
    const data = {
      version: 1,
      browsers: [...this.sessions].map(([hash, item]) => ({
        ...item,
        hash,
        clients: [...item.clients],
      })),
    };
    const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify(data), {
        mode: 0o600,
        flag: "wx",
      });
      fs.renameSync(temporary, this.file);
      this.lastSaved = data;
    } catch (error) {
      log.error("access", "browser authorization store write failed", {
        browsers: this.sessions.size,
        ...errorDetail(error),
      });
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      // Keep a failed durable mutation consistent with the last saved state.
      this.sessions.clear();
      this.clients.clear();
      for (const { hash, clients, ...item } of this.lastSaved?.browsers || []) {
        this.sessions.set(hash, { ...item, clients: new Set(clients) });
        for (const client of clients) this.clients.set(client, item.id);
      }
      throw new AccessError(
        "瀏覽器授權未能保存，請稍後重試。",
        503,
        "ACCESS_STORAGE",
      );
    }
  }
  sweep() {
    let changed = false;
    const scope = this.scope();
    if (
      this.grant &&
      (this.grant.expiresAt <= this.now() || this.grant.scope !== scope)
    )
      this.grant = null;
    for (const [key, item] of this.sessions)
      if (item.expiresAt <= this.now() || item.scope !== scope) {
        this.sessions.delete(key);
        changed = true;
      }
    const alive = new Set([...this.sessions.values()].map((item) => item.id));
    for (const [client, session] of this.clients)
      if (!alive.has(session)) this.clients.delete(client);
    if (changed) this.persist();
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
  admitAddress(value) {
    const address = peerAddress(value);
    if (!address)
      throw new AccessError(
        "請指定已核對的內網 IPv4 位址。",
        400,
        "BAD_ADDRESS",
      );
    this.sweep();
    this.grant = {
      address,
      scope: this.scope(),
      expiresAt: this.now() + this.grantMs,
    };
    return { address, expiresAt: this.grant.expiresAt, singleUse: true };
  }
  claimAddress(peer, existing, info = {}) {
    this.sweep();
    // An already admitted browser is idempotent and never extends its deadline
    // or consumes a newly issued admission intended for another browser.
    try {
      const item = this.authenticate(existing);
      return { value: existing, expiresAt: item.expiresAt };
    } catch {
      /* needs a new admission */
    }
    const grant = this.grant;
    if (!grant?.address || peerAddress(peer) !== grant.address)
      throw new AccessError();
    return this.accept(grant, undefined, info);
  }
  authenticate(value) {
    this.sweep();
    if (!valid(value)) throw new AccessError();
    const item = this.sessions.get(digest(value));
    if (!item) throw new AccessError();
    return item;
  }
  touch(value, info = {}) {
    const item = this.authenticate(value);
    item.lastUsedAt = Math.max(item.lastUsedAt, this.now());
    item.expiresAt = item.lastUsedAt + this.sessionMs;
    if (info.label) item.label = info.label;
    if (info.lastAddress) item.lastAddress = info.lastAddress;
    this.persist();
    return item;
  }
  redeem(value, existing, info = {}) {
    this.sweep();
    const grant = this.grant;
    if (
      !valid(value) ||
      !grant ||
      !grant.hash ||
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
    return this.accept(grant, existing, info);
  }
  accept(grant, existing, info = {}) {
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
      createdAt: this.now(),
      lastUsedAt: this.now(),
      expiresAt: this.now() + this.sessionMs,
      label: info.label || "Browser",
      lastAddress: info.lastAddress || null,
      clients: new Set(),
    };
    this.sessions.set(digest(sessionValue), item);
    this.persist();
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
    if (owner) return;
    // Remembering a browser for months must not exhaust a lifetime tab quota.
    // Retire the oldest association, but never the active/draft lock owner.
    if (item.clients.size >= 64) {
      const retired = [...item.clients].find(
        (id) => id !== this.protectedClient(),
      );
      item.clients.delete(retired);
      this.clients.delete(retired);
    }
    this.clients.set(clientId, item.id);
    item.clients.add(clientId);
    this.persist();
  }
  ownsClient(item, clientId) {
    return this.clients.get(clientId) === item.id;
  }
  revoke(browserId) {
    if (browserId) {
      const entry = [...this.sessions].find(
        ([, item]) => item.id === browserId,
      );
      if (!entry)
        throw new AccessError("找不到此瀏覽器授權。", 404, "BROWSER_NOT_FOUND");
      this.sessions.delete(entry[0]);
      for (const client of entry[1].clients) this.clients.delete(client);
    } else {
      this.sessions.clear();
      this.clients.clear();
    }
    this.grant = null;
    this.persist();
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
      admission: this.grant?.address
        ? {
            address: this.grant.address,
            expiresAt: this.grant.expiresAt,
            singleUse: true,
          }
        : null,
      sessions: this.sessions.size,
      grantMinutes: this.grantMs / 60_000,
      sessionMinutes: this.sessionMs / 60_000,
      sessionPolicy: "idle",
      idleDays: this.sessionMs / 86_400_000,
      persistent: !!this.file,
      browsers: [...this.sessions.values()].map(
        ({
          id,
          label,
          createdAt,
          lastUsedAt,
          expiresAt,
          lastAddress,
          clients,
        }) => ({
          id,
          label,
          createdAt,
          lastUsedAt,
          expiresAt,
          lastAddress,
          clientCount: clients.size,
        }),
      ),
    };
  }
}

function checkCookieName(name) {
  if (!/^review_access(?:_[a-f0-9]{32})?$/.test(name)) throw new AccessError();
  return name;
}

export function sessionCookie(headers, name = "review_access") {
  const prefix = `${checkCookieName(name)}=`;
  const values = (headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(prefix));
  if (values.length !== 1) return null;
  const value = values[0].slice(prefix.length);
  return valid(value) ? value : null;
}

export function accessCookie(value, maxAge, name = "review_access") {
  if (!valid(value)) throw new AccessError();
  return `${checkCookieName(name)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`;
}
