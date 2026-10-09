import "server-only";
import { eq, schema } from "@bookly/db";
import type { HostNotifications, Profile } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { providerFor, textProviders, type TextChannel, type TextMessage } from "./texting";

export { twilioParams } from "./texting";
export type { TextMessage } from "./texting";

/** Any text provider is configured (see texting.ts). */
export const textConfigured = () => textProviders().length > 0;

export const channelAvailable = (channel: TextChannel) => providerFor(channel) !== null;

/**
 * Sends one text through the first provider that serves `channel`. `message` says what the
 * text is about so a template-only provider can pick the approved template; the plain `body`
 * is what SMS senders deliver. Errors are logged, never thrown.
 */
export async function sendText(
  channel: TextChannel,
  to: string,
  body: string,
  message?: TextMessage,
) {
  return providerFor(channel)?.send(channel, to, body, message) ?? false;
}

/** Attendee texts: SMS first, WhatsApp when SMS is unavailable or failed. */
export async function textAttendee(phone: string, body: string, message?: TextMessage) {
  const to = phone.replace(/[\s()-]/g, "");
  if (await sendText("sms", to, body, message)) return true;
  return sendText("whatsapp", to, body, message);
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
  msg: {
    subject: string;
    text: string;
    /** The booking the ping is about; the WhatsApp template's button opens it in the admin. */
    bookingId?: string;
    email?: { subject: string; text: string; html?: string };
  },
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
    jobs.push(
      sendText(channel, profile.phone, msg.text, {
        kind: "host_ping",
        text: msg.text,
        bookingId: msg.bookingId,
      }),
    );
  if (prefs.slackWebhookUrl) jobs.push(slack(prefs.slackWebhookUrl, msg.text));
  await Promise.all(jobs);
}

export type { Profile };
