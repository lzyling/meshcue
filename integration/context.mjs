import fs from "node:fs";
import path from "node:path";
import { normalizeOrigin } from "../server/origin.mjs";
import { within } from "../server/paths.mjs";

export class IntegrationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export const fail = (code, message) => {
  throw new IntegrationError(code, message);
};
export { within };
export function workspaceContext(ctx) {
  if (ctx.sandboxed)
    fail("HOST_UNAVAILABLE", "此會話在沙箱內；沒有越過沙箱啟動主機服務。");
  if (!ctx.workspaceDir || !ctx.agentId || !ctx.fsPolicy)
    fail(
      "MISSING_CONTEXT",
      "宿主未提供工作區、Agent 或文件權限；沒有猜測資料位置。",
    );
  const workspace = fs.realpathSync(ctx.workspaceDir);
  const allowed = ctx.fsPolicy.workspaceOnly
    ? fs.realpathSync(ctx.fsPolicy.root || workspace)
    : workspace;
  if (!within(workspace, allowed))
    fail("PATH_SCOPE", "文件權限根目錄不屬於此工作區。");
  return { workspace, allowed, agentId: ctx.agentId };
}
export function trustedOrigin(ctx) {
  if (!ctx.sessionKey || !ctx.sessionId)
    fail("MISSING_ORIGIN", "宿主未提供目前會話及代際；沒有沿用舊話題。");
  const d = ctx.deliveryContext;
  const channel = d?.channel || ctx.messageChannel;
  const base = {
    harness: "openclaw",
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
  };
  if (channel === "webchat") return normalizeOrigin({ ...base, channel });
  if (channel !== "telegram" || !d?.to || !d.accountId)
    fail("MISSING_ORIGIN", "此入口未有受支援的原會話回傳地址。");
  const match = /^(?:telegram:)?(-?\d+)(?::topic:(\d+))?$/.exec(d.to);
  const thread = d.threadId == null ? undefined : String(d.threadId);
  if (!match || (match[2] && thread && match[2] !== thread))
    fail("BAD_ORIGIN", "宿主提供的 Telegram 話題資料不一致。");
  return normalizeOrigin({
    ...base,
    channel,
    target: match[1],
    accountId: d.accountId,
    ...(thread || match[2] ? { threadId: thread || match[2] } : {}),
  });
}
export function sameRoute(a, b) {
  const route = (v) =>
    v &&
    JSON.stringify([
      v.harness,
      v.sessionKey,
      v.channel,
      v.target,
      v.accountId,
      v.threadId,
    ]);
  return route(a) === route(b);
}
// Walk parents before creation; checking only the final leaf after mkdir would
// already have written through a symlink. Recheck on every tool invocation.
export function scopedPath(
  root,
  relative,
  { create = false, directory = false } = {},
) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\0")
  )
    fail("PATH_SCOPE", "請使用工作區內的相對路徑。");
  const target = path.resolve(root, relative);
  if (!within(root, target)) fail("PATH_SCOPE", "路徑超出允許的工作區。");
  let current = root;
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (
      fs.existsSync(current) ||
      (() => {
        try {
          fs.lstatSync(current);
          return true;
        } catch {
          return false;
        }
      })()
    ) {
      const real = fs.realpathSync(current);
      if (!within(root, real)) fail("PATH_SCOPE", "符號連結指向工作區以外。");
      current = real;
    } else if (create && (directory || i < parts.length - 1)) {
      fs.mkdirSync(current, { mode: 0o700 });
    } else fail("NOT_FOUND", "指定文件或項目尚未存在。");
  }
  if (directory && !fs.statSync(current).isDirectory())
    fail("PATH_SCOPE", "項目路徑不是目錄。");
  return current;
}
