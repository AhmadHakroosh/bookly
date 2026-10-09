import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@bookly/config";

/*
 * Text messages (SMS / WhatsApp) behind one small interface, so the vendor is a config value.
 * Twilio: the host brings a number and does the carrier paperwork. Sent.dm: one API key, the
 * provider handles registration and routes WhatsApp then SMS by itself. Meta: WhatsApp from the
 * operator's own number through the Cloud API, which only accepts approved templates when
 * Bookly starts the conversation, so every text carries a structured `TextMessage` beside its
 * plain body and the Meta driver picks the template from it.
 */

export type TextChannel = "sms" | "whatsapp";
export type TextProviderName = "twilio" | "sentdm" | "meta";

/**
 * What a text is about. SMS providers send the plain body; a template-only channel maps the
 * kind to an approved template and fills its parameters. `token` is a booking's manage token
 * (guest links), `bookingId` the booking (host links); both resolve through the short links
 * `/b/<token>` and `/h/<id>` on the platform host.
 */
export type TextMessage =
  | {
      kind: "booking_confirmation" | "booking_reminder" | "booking_cancelled";
      attendeeName: string;
      eventTitle: string;
      hostName: string;
      when: string;
      token: string;
    }
  | { kind: "host_ping"; text: string; bookingId?: string }
  | { kind: "verification_code"; code: string };

export interface TextProvider {
  name: TextProviderName;
  label: string;
  /** Enough configuration to send at all. */
  configured(): boolean;
  channelAvailable(channel: TextChannel): boolean;
  /** Sends one message. Never throws; false means it did not go out (already logged). */
  send(channel: TextChannel, to: string, body: string, message?: TextMessage): Promise<boolean>;
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

/* ---------------- Meta (WhatsApp Cloud API) ---------------- */

export const META_GRAPH = "https://graph.facebook.com/v22.0";

/**
 * Names of the approved templates in the operator's WhatsApp Business Account. The bodies and
 * buttons they must have are in docs/notifications.md; the parameters below are sent in the
 * same order the bodies declare them.
 */
export const META_TEMPLATES = {
  booking_confirmation: "booking_confirmation",
  booking_reminder: "booking_reminder",
  booking_cancelled: "booking_cancelled",
  host_ping: "host_ping",
  verification_code: "phone_verification",
} as const;

/** Meta wants the number without the plus (digits only). */
export const metaTo = (to: string) => to.replace(/^\+/, "");

/** Template parameters may not contain line breaks, tabs or runs of spaces; one line, 1024 max. */
export const templateText = (s: string, max = 1024) =>
  s.replace(/\s+/g, " ").trim().slice(0, max) || "-";

/**
 * The Cloud API request for a message. With a `TextMessage` it is a template send; without one
 * it is a plain text, which Meta delivers only inside the 24-hour window after the recipient
 * last wrote to the number (useful for replies, never for the first contact).
 */
export function metaPayload(to: string, body: string, message?: TextMessage) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: metaTo(to) };
  if (!message)
    return { ...base, type: "text", text: { preview_url: false, body: body.slice(0, MAX_BODY) } };
  const text = (t: string) => ({ type: "text", text: templateText(t) });
  const bodyOf = (...params: string[]) => ({ type: "body", parameters: params.map(text) });
  /** The one dynamic-URL button every Bookly template carries; `param` is the URL suffix. */
  const button = (param: string) => ({
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [text(param)],
  });
  const template = (name: string, components: unknown[]) => ({
    ...base,
    type: "template",
    template: { name, language: { code: loadEnv().WHATSAPP_TEMPLATE_LANGUAGE }, components },
  });
  switch (message.kind) {
    case "booking_confirmation":
    case "booking_reminder":
    case "booking_cancelled":
      return template(META_TEMPLATES[message.kind], [
        bodyOf(message.attendeeName, message.eventTitle, message.hostName, message.when),
        button(message.token),
      ]);
    case "host_ping":
      // `/h/admin` opens the admin without a booking (task nudges, series cancellations).
      return template(META_TEMPLATES.host_ping, [
        bodyOf(message.text),
        button(message.bookingId ?? "admin"),
      ]);
    case "verification_code":
      // Meta's authentication template: the code in the body and on the copy-code button.
      return template(META_TEMPLATES.verification_code, [
        bodyOf(message.code),
        button(message.code),
      ]);
  }
}

export const meta: TextProvider = {
  name: "meta",
  label: "WhatsApp (Meta)",
  configured() {
    const e = loadEnv();
    return !!(e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID);
  },
  channelAvailable(channel) {
    return channel === "whatsapp" && this.configured();
  },
  async send(channel, to, body, message) {
    if (!this.channelAvailable(channel) || !E164.test(to)) return false;
    const e = loadEnv();
    try {
      const res = await fetch(`${META_GRAPH}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(metaPayload(to, body, message)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error("[notify] whatsapp", res.status, (await res.text()).slice(0, 300));
      return res.ok;
    } catch (err) {
      console.error("[notify] whatsapp failed", err);
      return false;
    }
  },
};

/** Checks Meta's `X-Hub-Signature-256` header (`sha256=<hmac of the raw body>`) on a webhook. */
export function verifyMetaSignature(secret: string, body: string, header: string | null) {
  const given = (header ?? "").replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

/* ---------------- Selection ---------------- */

const PROVIDERS: Record<TextProviderName, TextProvider> = { twilio, sentdm, meta };

/**
 * The providers in the order they are tried: `TEXT_PROVIDER` alone when set; otherwise every
 * configured one, Meta first (the operator's own WhatsApp number), then Sent.dm (one key,
 * both channels), then Twilio.
 */
export function textProviders(): TextProvider[] {
  const e = loadEnv();
  if (e.TEXT_PROVIDER) return [PROVIDERS[e.TEXT_PROVIDER]];
  return [meta, sentdm, twilio].filter((p) => p.configured());
}

/** The first provider that can send on `channel`, or null when none is configured for it. */
export function providerFor(channel: TextChannel): TextProvider | null {
  return textProviders().find((p) => p.channelAvailable(channel)) ?? null;
}

/**
 * The provider that represents texting as a whole (health page, legacy callers). Falls back to
 * Twilio (unconfigured) so callers get a consistent "no".
 */
export function textProvider(): TextProvider {
  return textProviders()[0] ?? twilio;
}
