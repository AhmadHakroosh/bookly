import "server-only";
import { eq, schema } from "@bookly/db";
import type { HostNotifications, Profile } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { textProvider } from "./texting";

export { twilioParams } from "./texting";

/** Any text provider is configured (see texting.ts). */
export const textConfigured = () => textProvider().configured();

export const channelAvailable = (channel: "sms" | "whatsapp") =>
  textProvider().channelAvailable(channel);

/** Sends one text through the configured provider. Errors are logged, never thrown. */
export async function sendText(channel: "sms" | "whatsapp", to: string, body: string) {
  return textProvider().send(channel, to, body);
}

async function slack(url: string, text: string) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error("[notify] slack failed", e);
  }
}

export type HostEvent = "onBooking" | "onCancel" | "onJoin" | "reminder1h";

/**
 * Pings a host on every channel they enabled for `event`. Email goes out only when `email`
 * is provided (the booking flow already sends richer emails for bookings and cancellations).
 */
export async function notifyHost(
  hostUserId: string,
  event: HostEvent,
  msg: { subject: string; text: string; email?: { subject: string; text: string; html?: string } },
) {
  const profile = await db().query.profiles.findFirst({
    where: eq(schema.profiles.userId, hostUserId),
  });
  const prefs: HostNotifications = profile?.notifications ?? {};
  const enabled = prefs[event] ?? (event === "onJoin" || event === "onBooking");
  if (!enabled) return;
  const jobs: Promise<unknown>[] = [];
  if (msg.email) {
    const u = await db().query.users.findFirst({
      where: eq(schema.users.id, hostUserId),
      columns: { email: true },
    });
    if (u?.email)
      jobs.push(
        sendEmail({
          to: u.email,
          subject: msg.email.subject,
          text: msg.email.text,
          html: msg.email.html,
        }).catch((e) => console.error("[notify] email failed", e)),
      );
  }
  const channel = prefs.channel ?? "none";
  // Texts go only to a number the host has proved is theirs (Admin → Notifications).
  if (channel !== "none" && profile?.phone && profile.phoneVerifiedAt)
    jobs.push(sendText(channel, profile.phone, msg.text));
  if (prefs.slackWebhookUrl) jobs.push(slack(prefs.slackWebhookUrl, msg.text));
  await Promise.all(jobs);
}

export type { Profile };
