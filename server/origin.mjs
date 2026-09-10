import { z } from "zod";

const text = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[^\x00-\x1f\x7f]+$/);
export const originSchema = z.discriminatedUnion("channel", [
  z
    .object({
      harness: z.literal("openclaw").default("openclaw"),
      sessionKey: text,
      channel: z.literal("webchat"),
    })
    .strict(),
  z
    .object({
      harness: z.literal("openclaw").default("openclaw"),
      sessionKey: text,
      channel: z.literal("telegram"),
      target: z.string().regex(/^-?\d+$/),
      accountId: text,
      threadId: z.string().regex(/^\d+$/).optional(),
    })
    .strict(),
]);

export function normalizeOrigin(value) {
  if (!value) return null;
  return originSchema.parse(
    typeof value === "string"
      ? { sessionKey: value, channel: "webchat" }
      : value,
  );
}

export function deliveryParams(value) {
  const origin = normalizeOrigin(value);
  if (!origin) throw new Error("此批提交未綁定原會話，沒有發送到其他位置。");
  if (origin.channel === "webchat")
    return { sessionKey: origin.sessionKey, deliver: false };
  // These are explicit, admin-scoped chat.send route fields in OpenClaw 9.2.
  // Never infer an external destination from mutable session delivery history.
  return {
    sessionKey: origin.sessionKey,
    deliver: true,
    originatingChannel: "telegram",
    originatingTo: origin.target,
    originatingAccountId: origin.accountId,
    ...(origin.threadId ? { originatingThreadId: origin.threadId } : {}),
  };
}
