import "server-only";
import { and, eq, schema } from "@bookly/db";
import type { HostNotifications, Profile } from "@bookly/db/schema";
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
 * Texts and Slack pings for a host who enabled `event` on Admin → Notifications. Called by
 * `notify()` in notifications.ts, which also handles the bell, desktop push and email, and
 * sends these only when the host is not in Bookly (ADR 0007). Returns how many went out.
 */
export async function notifyHost(
  workspaceId: string,
  hostUserId: string,
  event: HostEvent,
  msg: {
    text: string;
    /** The booking the ping is about; the WhatsApp template's button opens it in the admin. */
    bookingId?: string;
  },
) {
  const profile = await db().query.profiles.findFirst({
    where: and(
      eq(schema.profiles.workspaceId, workspaceId),
      eq(schema.profiles.userId, hostUserId),
    ),
  });
  const prefs: HostNotifications = profile?.notifications ?? {};
  const enabled = prefs[event] ?? (event === "onJoin" || event === "onBooking");
  if (!enabled) return 0;
  const jobs: Promise<unknown>[] = [];
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
  return jobs.length;
}

export type { Profile };
