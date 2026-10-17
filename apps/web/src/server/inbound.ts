import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@bookly/config";
import { and, eq, schema, sql } from "@bookly/db";
import type { ContactEvent, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { hasFlag } from "./flags";
import { hasFeature } from "./limits";

/*
 * Guest replies (0.17.0). Every email Bookly sends to a contact on Pro and up carries a
 * Reply-To of `r-<event>-<signature>@<INBOUND_EMAIL_DOMAIN>`: the timeline entry the email was
 * logged as, signed with AUTH_SECRET so nobody can post into a thread they were not sent.
 * Resend receives mail for that domain and calls POST /api/webhooks/resend (`email.received`);
 * the reply is fetched, its quoted history cut off, and it lands under the email it answers.
 * The token is lowercase hex, because mail systems may change the case of an address.
 */

const sign = (eventId: string) =>
  createHmac("sha256", loadEnv().AUTH_SECRET).update(`reply:${eventId}`).digest("hex").slice(0, 16);

const UUID = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/;

/** The local part for a timeline entry: `r-<uuid without dashes>-<signature>`. */
export function replyToken(eventId: string) {
  const hex = eventId.replace(/-/g, "").toLowerCase();
  return `r-${hex}-${sign(eventId)}`;
}

/** The entry id behind a reply address, or null when it is not one of ours or the signature fails. */
export function readReplyAddress(address: string, domain: string): string | null {
  // Untrusted input: plain string slicing, no backtracking patterns, and a sane length cap.
  if (address.length > 320) return null;
  const lt = address.lastIndexOf("<");
  const gt = lt >= 0 ? address.indexOf(">", lt) : -1;
  const inner = (lt >= 0 ? address.slice(lt + 1, gt >= 0 ? gt : undefined) : address).trim();
  const at = inner.lastIndexOf("@");
  if (at <= 0 || inner.slice(at + 1).toLowerCase() !== domain.toLowerCase()) return null;
  const local = inner.slice(0, at).toLowerCase().split("+")[0]!;
  const parts = /^r-([0-9a-f]{32})-([0-9a-f]{16})$/.exec(local);
  if (!parts) return null;
  const u = UUID.exec(parts[1]!);
  if (!u) return null;
  const id = u.slice(1).join("-");
  const given = Buffer.from(parts[2]!);
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export const inboundDomain = () => loadEnv().INBOUND_EMAIL_DOMAIN?.trim().toLowerCase() || null;

/** Whether this workspace's outbound mail should carry signed reply addresses right now. */
export type GuestRepliesStatus = "on" | "off" | "plan" | "unconfigured" | "unavailable";

/**
 * Where replies to this workspace's emails go, for Settings → Emails: "on" (the timeline),
 * "off" (switched off by the workspace), "plan" (needs Pro), "unconfigured" (no inbound domain
 * on this server) or "unavailable" (the timeline v2 flag is not on for the workspace).
 */
export async function guestRepliesStatus(ws: Workspace): Promise<GuestRepliesStatus> {
  if (!inboundDomain()) return "unconfigured";
  if (!(await hasFlag(ws, "timeline_v2"))) return "unavailable";
  if (!hasFeature(ws, "inboundEmail")) return "plan";
  return ws.settings.guestReplies === false ? "off" : "on";
}

/** Whether new emails from this workspace should carry signed reply addresses right now. */
export async function inboundOn(ws: Workspace) {
  return (await guestRepliesStatus(ws)) === "on";
}

/**
 * Reply-To for an email that will be logged as timeline entry `eventId`: the signed inbound
 * address when guest replies are on, otherwise the host's own address (today's behaviour).
 */
export async function replyToFor(
  ws: Workspace,
  eventId: string,
  hostEmail: string | null | undefined,
): Promise<string | undefined> {
  const domain = inboundDomain();
  if (domain && (await inboundOn(ws))) return `${replyToken(eventId)}@${domain}`;
  return hostEmail ?? undefined;
}

/* ---------------- Webhook signature (Svix, as Resend signs) ---------------- */

/**
 * Verifies a Svix-signed request: HMAC-SHA256 over `id.timestamp.body` with the secret after
 * its `whsec_` prefix (base64), any of the space-separated `v1,<sig>` values may match, and the
 * timestamp must be within five minutes.
 */
export function verifySvix(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest("base64");
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/* ---------------- Reading the reply ---------------- */

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  message_id: string | null;
  headers: Record<string, string> | null;
  attachments: { filename: string; content_type: string; size?: number }[];
};

/** The full message from Resend's received-emails API. */
export async function fetchReceived(emailId: string): Promise<ReceivedEmail | null> {
  const env = loadEnv();
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  const base = env.RESEND_API_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[inbound] fetch failed", res.status);
    return null;
  }
  return (await res.json()) as ReceivedEmail;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
};
/** Tags that end a line of text. */
const BREAKS = new Set([
  "br",
  "/p",
  "/div",
  "/li",
  "/tr",
  "/h1",
  "/h2",
  "/h3",
  "/h4",
  "/h5",
  "/h6",
]);

/**
 * Plain text from HTML when a reply has no text part. One pass over the characters: tags are
 * dropped (script and style with their content), block ends become line breaks, and entities
 * are decoded once (so "&amp;lt;" stays "&lt;"). The result is only ever shown as text.
 */
export function htmlToText(html: string) {
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  while (i < html.length) {
    const c = html[i]!;
    if (c !== "<") {
      out += c;
      i++;
      continue;
    }
    const end = html.indexOf(">", i + 1);
    if (end < 0) break; // an unclosed tag: drop the rest
    const name = /^\/?[a-z0-9]+/.exec(lower.slice(i + 1, Math.min(end, i + 12)))?.[0] ?? "";
    if (name === "script" || name === "style") {
      const close = lower.indexOf(`</${name}`, end + 1);
      const closeEnd = close < 0 ? -1 : html.indexOf(">", close);
      i = closeEnd < 0 ? html.length : closeEnd + 1;
      continue;
    }
    if (BREAKS.has(name)) out += "\n";
    i = end + 1;
  }
  return out
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The new part of a reply: everything above the quoted history ("On … wrote:", "-----Original
 * Message-----", Outlook's From/Sent block, or the first run of "> " lines).
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex(
    (l, i) =>
      /^\s*On .{3,200}wrote:\s*$/i.test(l) ||
      // Gmail wraps a long "On …" line over two.
      (/^\s*On .{3,200}$/i.test(l) && /wrote:\s*$/i.test(lines[i + 1] ?? "")) ||
      /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l) ||
      /^\s*_{10,}\s*$/.test(l) ||
      (/^\s*From:\s/i.test(l) && /^\s*(Sent|Date):\s/i.test(lines[i + 1] ?? "")) ||
      /^\s*>/.test(l),
  );
  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").trim();
  return kept || text.trim();
}

/**
 * Drops characters that show as boxes: U+FFFC is where Apple Mail's text part had an inline
 * attachment, and zero-width marks are invisible noise.
 */
export const cleanReplyText = (text: string) =>
  text.replace(/[\uFFFC\u200B\u200C\u200D\uFEFF]/g, "");

/** Auto-replies (out of office, delivery reports) are kept off the timeline. */
export function isAutoReply(email: Pick<ReceivedEmail, "headers" | "subject">) {
  const h = Object.fromEntries(
    Object.entries(email.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]),
  );
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["precedence"] === "auto_reply") return true;
  return /^(automatic reply|auto(-|\s)?reply|out of (the )?office|undeliverable|delivery status)/i.test(
    email.subject.trim(),
  );
}

/** The timeline entry a reply address points at, with its workspace. */
export async function threadOf(
  eventId: string,
): Promise<{ event: ContactEvent; ws: Workspace } | null> {
  const event = await db().query.contactEvents.findFirst({
    where: eq(schema.contactEvents.id, eventId),
  });
  if (!event) return null;
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, event.workspaceId),
  });
  return ws ? { event, ws } : null;
}

/** True when this Resend email was already put on a timeline (webhooks are retried). */
export async function alreadyReceived(contactId: string, resendId: string) {
  const row = await db().query.contactEvents.findFirst({
    where: and(
      eq(schema.contactEvents.contactId, contactId),
      eq(schema.contactEvents.type, "email_received"),
      sql`${schema.contactEvents.data}->>'resendId' = ${resendId}`,
    ),
    columns: { id: true },
  });
  return !!row;
}

/** Who hears about a reply: whoever sent the email, else the booking's host, else the owner. */
async function recipientFor(ws: Workspace, event: ContactEvent): Promise<string | null> {
  const sentBy = typeof event.data.sentBy === "string" ? event.data.sentBy : null;
  if (sentBy) return sentBy;
  if (event.bookingId) {
    const b = await db().query.bookings.findFirst({
      where: eq(schema.bookings.id, event.bookingId),
      columns: { hostUserId: true },
    });
    if (b) return b.hostUserId;
  }
  const [owner] = await db()
    .select({ userId: schema.members.userId })
    .from(schema.members)
    .where(
      and(eq(schema.members.organizationId, ws.organizationId), eq(schema.members.role, "owner")),
    )
    .limit(1);
  return owner?.userId ?? null;
}

export type ReceivedWebhook = {
  email_id: string;
  from: string;
  subject?: string;
  to?: string[];
  received_for?: string[];
};

/**
 * Files one received email under the thread its address names. Returns what happened, so the
 * webhook can answer 200 for everything it deliberately skips; throws when Resend should retry.
 */
export async function receiveReply(
  data: ReceivedWebhook,
): Promise<{ ok: true; id: string } | { ignored: string }> {
  const domain = inboundDomain();
  if (!domain) return { ignored: "inbound email is not configured" };
  let eventId: string | null = null;
  for (const a of [...(data.received_for ?? []), ...(data.to ?? [])]) {
    eventId = readReplyAddress(a, domain);
    if (eventId) break;
  }
  if (!eventId) return { ignored: "not a reply address" };
  const thread = await threadOf(eventId);
  if (!thread) return { ignored: "unknown thread" };
  const { event, ws } = thread;
  // No plan, flag or switch check here: this address was handed out while replies were on, and
  // a reply to it must not vanish because the setting changed since. It is filed and forwarded.
  if (await alreadyReceived(event.contactId, data.email_id)) return { ignored: "already received" };
  const email = await fetchReceived(data.email_id);
  if (!email) throw new Error("could not fetch the received email");
  if (isAutoReply(email)) return { ignored: "auto-reply" };

  const full = cleanReplyText(email.text ?? (email.html ? htmlToText(email.html) : "")).slice(
    0,
    50_000,
  );
  const body = stripQuoted(full).slice(0, 20_000);
  const id = crypto.randomUUID();
  const rootId = event.parentId ?? event.id;
  const { logContactEvent, updateContact } = await import("./contacts");
  await logContactEvent(
    ws.id,
    event.contactId,
    "email_received",
    `Reply: ${email.subject}`.slice(0, 500),
    {
      id,
      parentId: rootId,
      bookingId: event.bookingId,
      data: {
        resendId: data.email_id,
        from: email.from,
        subject: email.subject,
        body,
        full,
        messageId: email.message_id,
        attachments: (email.attachments ?? []).map((a) => ({
          filename: a.filename,
          contentType: a.content_type,
          size: a.size ?? null,
        })),
      },
    },
  );
  // Files on: keep the attachments in the contact's folder, and record each one on the entry.
  if ((email.attachments ?? []).length && (await hasFlag(ws, "files"))) {
    const { keepReceivedAttachments } = await import("./drive");
    const kept = await keepReceivedAttachments(ws, data.email_id, event.contactId, id);
    if (kept.length)
      await db()
        .update(schema.contactEvents)
        .set({
          data: sql`jsonb_set(${schema.contactEvents.data}, '{attachments}', ${JSON.stringify(kept)}::jsonb)`,
        })
        .where(eq(schema.contactEvents.id, id));
  }
  // They answered: the "follow up if nobody replies" date has done its job.
  await updateContact(ws.id, event.contactId, { nextFollowUpAt: null });

  const contact = await db().query.contacts.findFirst({
    where: eq(schema.contacts.id, event.contactId),
    columns: { name: true, email: true },
  });
  const who = contact?.name || contact?.email || email.from;
  const userId = await recipientFor(ws, event);
  if (userId) {
    const { notify } = await import("./notifications");
    const { adminBaseUrl } = await import("./urls");
    const link = `/admin/contacts/${event.contactId}?entry=${id}`;
    await notify(ws, userId, {
      kind: "email.replied",
      title: `${who} replied: ${email.subject}`.slice(0, 200),
      body: body.slice(0, 200),
      link,
      dedupeKey: `reply:${data.email_id}`,
      email: {
        subject: `${who} replied: ${email.subject}`.slice(0, 200),
        text: `${body}\n\n— ${email.from}, on the timeline: ${adminBaseUrl(ws)}${link}\n\nAnswer from the timeline to keep the thread there, or reply to this email to write to them directly.`,
        replyTo: email.from,
      },
    });
  }
  const { SYSTEM_ACTOR, audit } = await import("./audit");
  await audit({
    action: "contact.reply_received",
    target: { type: "contact", id: event.contactId, label: who },
    actor: SYSTEM_ACTOR("email"),
    workspace: ws.id,
    changes: { subject: { to: email.subject }, from: { to: email.from } },
  });
  return { ok: true, id };
}
