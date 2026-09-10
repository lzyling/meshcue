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
      sessionId: text.optional(),
      channel: z.literal("webchat"),
    })
    .strict(),
  z
    .object({
      harness: z.literal("openclaw").default("openclaw"),
      sessionKey: text,
      sessionId: text.optional(),
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
  // The host resolves the destination from the session itself. Naming it here
  // with originating* route fields is an admin-scoped override that a normal
  // operator client cannot use — the Gateway answers "originating route fields
  // require admin scope" and the whole review round stalls unconfirmed. MeshCue
  // never needed the override: sessionKey already identifies the exact channel,
  // chat and topic this batch was bound to, and the caller cannot widen that.
  // The frozen target/accountId/threadId stay on the stored origin as a record
  // of where the batch was bound, not as a delivery instruction. Generation
  // safety comes from the sessionId check and expectedLeafEntryId fence in
  // OpenClawBridge.send, which are unaffected.
  return { sessionKey: origin.sessionKey, deliver: true };
}
