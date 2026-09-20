import "server-only";
import { eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { HostNotifications, Profile } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";

export const textConfigured = () => {
  const e = loadEnv();
  return !!(
    e.TWILIO_ACCOUNT_SID &&
    e.TWILIO_AUTH_TOKEN &&
    (e.TWILIO_FROM_SMS || e.TWILIO_FROM_WHATSAPP)
  );
};

export const channelAvailable = (channel: "sms" | "whatsapp") => {
  const e = loadEnv();
  if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN) return false;
  return channel === "sms" ? !!e.TWILIO_FROM_SMS : !!e.TWILIO_FROM_WHATSAPP;
};

/** Twilio message body: WhatsApp numbers carry the `whatsapp:` prefix on both ends. */
export function twilioParams(channel: "sms" | "whatsapp", to: string, body: string) {
  const e = loadEnv();
  const from = channel === "sms" ? e.TWILIO_FROM_SMS! : e.TWILIO_FROM_WHATSAPP!;
  const prefix = channel === "whatsapp" ? "whatsapp:" : "";
  return { From: `${prefix}${from.replace(/^whatsapp:/, "")}`, To: `${prefix}${to}`, Body: body };
}

/** Sends one text via Twilio's REST API. Errors are logged, never thrown. */
export async function sendText(channel: "sms" | "whatsapp", to: string, body: string) {
  if (!channelAvailable(channel) || !/^\+\d{7,15}$/.test(to)) return false;
  const e = loadEnv();
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(twilioParams(channel, to, body.slice(0, 1500))),
      },
    );
    if (!res.ok) console.error("[notify] twilio", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.error("[notify] twilio failed", err);
    return false;
  }
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
  if (channel !== "none" && profile?.phone) jobs.push(sendText(channel, profile.phone, msg.text));
  if (prefs.slackWebhookUrl) jobs.push(slack(prefs.slackWebhookUrl, msg.text));
  await Promise.all(jobs);
}

export type { Profile };
