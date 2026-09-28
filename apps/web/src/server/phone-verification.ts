import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Profile } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { channelAvailable, sendText } from "./notify";
import { rateLimit } from "./ratelimit";

/**
 * A host proves they own the phone on their profile before Bookly texts it: a six-digit code
 * goes out over the channel they picked, and the number counts as verified only once the code
 * comes back. Without this anyone could point Bookly's texts at a stranger's number.
 */
export const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export type VerifyResult = { ok: true } | { ok: false; error: string };

const hashCode = (code: string) =>
  createHash("sha256").update(`${loadEnv().AUTH_SECRET}:${code}`).digest("hex");

/** Pure: whether `code` matches the pending verification for `phone` (no I/O). */
export function codeMatches(
  v: Profile["phoneVerification"] | null | undefined,
  phone: string | null,
  code: string,
  now = new Date(),
): { ok: boolean; reason?: "none" | "phone" | "expired" | "attempts" | "wrong" } {
  if (!v) return { ok: false, reason: "none" };
  if (!phone || v.phone !== phone) return { ok: false, reason: "phone" };
  if (new Date(v.expiresAt) < now) return { ok: false, reason: "expired" };
  if (v.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "attempts" };
  return hashCode(code.trim()) === v.hash ? { ok: true } : { ok: false, reason: "wrong" };
}

async function profileOf(workspaceId: string, userId: string) {
  return db().query.profiles.findFirst({
    where: and(eq(schema.profiles.workspaceId, workspaceId), eq(schema.profiles.userId, userId)),
  });
}

/** Texts a fresh code to the host's saved phone over their chosen channel. */
export async function sendPhoneCode(workspaceId: string, userId: string): Promise<VerifyResult> {
  const p = await profileOf(workspaceId, userId);
  if (!p?.phone) return { ok: false, error: "Save a phone number first." };
  const channel = p.notifications.channel ?? "none";
  if (channel === "none") return { ok: false, error: "Pick SMS or WhatsApp first, then save." };
  if (!channelAvailable(channel))
    return { ok: false, error: "Text messages are not set up on this server." };
  if (!(await rateLimit(`phone-code:${userId}`, 3, 10 * 60_000)).ok)
    return { ok: false, error: "Too many codes requested. Try again in a few minutes." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sent = await sendText(
    channel,
    p.phone,
    `Your Bookly verification code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`,
  );
  if (!sent)
    return { ok: false, error: "Could not send the code. Check the number and try again." };
  await db()
    .update(schema.profiles)
    .set({
      phoneVerification: {
        phone: p.phone,
        hash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
        sentAt: new Date().toISOString(),
        attempts: 0,
      },
    })
    .where(eq(schema.profiles.id, p.id));
  return { ok: true };
}

/** Checks the code the host typed; marks the phone verified on a match. */
export async function confirmPhoneCode(
  workspaceId: string,
  userId: string,
  code: string,
): Promise<VerifyResult> {
  const p = await profileOf(workspaceId, userId);
  if (!p) return { ok: false, error: "Set up your booking page first." };
  const r = codeMatches(p.phoneVerification, p.phone, code);
  if (r.ok) {
    await db()
      .update(schema.profiles)
      .set({ phoneVerifiedAt: new Date(), phoneVerification: null })
      .where(eq(schema.profiles.id, p.id));
    return { ok: true };
  }
  if (r.reason === "wrong" && p.phoneVerification)
    await db()
      .update(schema.profiles)
      .set({
        phoneVerification: { ...p.phoneVerification, attempts: p.phoneVerification.attempts + 1 },
      })
      .where(eq(schema.profiles.id, p.id));
  const messages = {
    none: "No code has been sent yet.",
    phone: "The number changed since the code was sent. Request a new code.",
    expired: "That code has expired. Request a new one.",
    attempts: "Too many wrong attempts. Request a new code.",
    wrong: "That code is not right.",
  } as const;
  return { ok: false, error: messages[r.reason!] };
}

/** Posts a test line to a Slack incoming webhook and reports what Slack said. */
export async function testSlackWebhook(url: string, userId: string): Promise<VerifyResult> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(url))
    return { ok: false, error: "Must be a Slack incoming webhook URL." };
  if (!(await rateLimit(`slack-test:${userId}`, 5, 60_000)).ok)
    return { ok: false, error: "Too many tests. Try again in a minute." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Bookly: test message from your Notifications page." }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.text()).slice(0, 80);
    return { ok: false, error: `Slack answered ${res.status}${body ? `: ${body}` : ""}.` };
  } catch {
    return { ok: false, error: "Could not reach Slack." };
  }
}
