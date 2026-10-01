import "server-only";
import { loadEnv } from "@bookly/config";

/*
 * Text messages (SMS / WhatsApp) behind one small interface, so the vendor is a config value.
 * Twilio: the host brings a number and does the carrier paperwork. Sent.dm: one API key, the
 * provider handles registration and routes WhatsApp then SMS by itself.
 */

export type TextChannel = "sms" | "whatsapp";
export type TextProviderName = "twilio" | "sentdm";

export interface TextProvider {
  name: TextProviderName;
  label: string;
  /** Enough configuration to send at all. */
  configured(): boolean;
  channelAvailable(channel: TextChannel): boolean;
  /** Sends one message. Never throws; false means it did not go out (already logged). */
  send(channel: TextChannel, to: string, body: string): Promise<boolean>;
}

const E164 = /^\+\d{7,15}$/;
const MAX_BODY = 1500;

/* ---------------- Twilio ---------------- */

/** Twilio message body: WhatsApp numbers carry the `whatsapp:` prefix on both ends. */
export function twilioParams(channel: TextChannel, to: string, body: string) {
  const e = loadEnv();
  const from = channel === "sms" ? e.TWILIO_FROM_SMS! : e.TWILIO_FROM_WHATSAPP!;
  const prefix = channel === "whatsapp" ? "whatsapp:" : "";
  return { From: `${prefix}${from.replace(/^whatsapp:/, "")}`, To: `${prefix}${to}`, Body: body };
}

export const twilio: TextProvider = {
  name: "twilio",
  label: "Twilio",
  configured() {
    const e = loadEnv();
    return !!(
      e.TWILIO_ACCOUNT_SID &&
      e.TWILIO_AUTH_TOKEN &&
      (e.TWILIO_FROM_SMS || e.TWILIO_FROM_WHATSAPP)
    );
  },
  channelAvailable(channel) {
    const e = loadEnv();
    if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN) return false;
    return channel === "sms" ? !!e.TWILIO_FROM_SMS : !!e.TWILIO_FROM_WHATSAPP;
  },
  async send(channel, to, body) {
    if (!this.channelAvailable(channel) || !E164.test(to)) return false;
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
          body: new URLSearchParams(twilioParams(channel, to, body.slice(0, MAX_BODY))),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) console.error("[notify] twilio", res.status, (await res.text()).slice(0, 200));
      return res.ok;
    } catch (err) {
      console.error("[notify] twilio failed", err);
      return false;
    }
  },
};

/* ---------------- Sent.dm ---------------- */

export const SENTDM_URL = "https://api.sent.dm/v3/messages";

/** The request Sent.dm expects: recipients and an ordered channel list; `sandbox` dry-runs it. */
export function sentdmBody(channel: TextChannel, to: string, body: string) {
  const e = loadEnv();
  return {
    to: [to],
    channel: [channel],
    text: body.slice(0, MAX_BODY),
    ...(e.SENTDM_SANDBOX ? { sandbox: true } : {}),
  };
}

export const sentdm: TextProvider = {
  name: "sentdm",
  label: "Sent.dm",
  configured() {
    return !!loadEnv().SENTDM_API_KEY;
  },
  channelAvailable() {
    // One key covers both channels; Sent.dm owns the sender identities.
    return !!loadEnv().SENTDM_API_KEY;
  },
  async send(channel, to, body) {
    if (!this.channelAvailable(channel) || !E164.test(to)) return false;
    const e = loadEnv();
    try {
      const res = await fetch(SENTDM_URL, {
        method: "POST",
        headers: { "x-api-key": e.SENTDM_API_KEY!, "content-type": "application/json" },
        body: JSON.stringify(sentdmBody(channel, to, body)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error("[notify] sent.dm", res.status, (await res.text()).slice(0, 200));
      return res.ok;
    } catch (err) {
      console.error("[notify] sent.dm failed", err);
      return false;
    }
  },
};

/* ---------------- Selection ---------------- */

const PROVIDERS: Record<TextProviderName, TextProvider> = { twilio, sentdm };

/**
 * `TEXT_PROVIDER` picks explicitly; otherwise whichever is configured, Sent.dm first since one
 * key is the lighter setup. Falls back to Twilio (unconfigured) so callers get consistent "no".
 */
export function textProvider(): TextProvider {
  const e = loadEnv();
  if (e.TEXT_PROVIDER) return PROVIDERS[e.TEXT_PROVIDER];
  if (sentdm.configured()) return sentdm;
  return twilio;
}
