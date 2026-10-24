import "server-only";
import { adminBaseUrl, publicBaseUrl } from "./urls";
import { and, eq, schema, sql } from "@bookly/db";
import type { Contact, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { brandFor } from "@/emails/brand";
import type { EmailBrand } from "@/emails/layout";
import { letterMail } from "@/emails/booking";
import { logContactEvent, updateContact, noteToCrm } from "./contacts";
import { DEFAULT_TEMPLATES, replySubject, type OutreachKind, type Template } from "./outreach-text";
import { platformFeeCents, platformFeePercent } from "./connect";
import { destinationCharge, formatPrice, paymentsFor, stripe } from "./payments";
import { unsubscribePostUrl, unsubscribeUrl } from "./unsubscribe";
import { getProfileByUser } from "./scheduling";
import { filesForEmail, linksText, recordSentFiles } from "./drive";
import { replyToFor } from "./inbound";
import { notify } from "./notifications";

export function templatesFor(ws: Workspace) {
  const t = ws.settings.templates ?? {};
  return {
    proposal: { ...DEFAULT_TEMPLATES.proposal, ...(t.proposal ?? {}) } as Template,
    paymentRequest: {
      ...DEFAULT_TEMPLATES.paymentRequest,
      ...(t.paymentRequest ?? {}),
    } as Template,
    checkIn: { ...DEFAULT_TEMPLATES.checkIn, ...(t.checkIn ?? {}) } as Template,
  };
}

/**
 * The exact email a contact receives: used for the preview step and for sending. Outreach is
 * commercial email, so the footer carries the workspace's postal address and an unsubscribe link
 * for the contact (CAN-SPAM, and what mailbox providers expect).
 */
export async function renderOutreach(
  ws: Workspace,
  c: Pick<Contact, "id">,
  signedBy: string,
  subject: string,
  body: string,
  payLink?: string,
  brand: EmailBrand = brandFor(ws),
) {
  return letterMail({
    brand,
    subject: subject.trim().slice(0, 200),
    body: body.trim().slice(0, 8000),
    signedBy,
    cta: payLink ? { href: payLink, label: "Pay securely" } : undefined,
    address: ws.settings.postalAddress?.trim() || undefined,
    unsubscribeUrl: unsubscribeUrl(await publicBaseUrl(ws), c.id),
  });
}

/** Thrown by `sendOutreach` when the contact has unsubscribed. */
export class OptedOutError extends Error {
  constructor() {
    super("This contact has unsubscribed from your emails.");
  }
}

/** A Stripe Checkout link for an arbitrary amount (null when Stripe is not set up). */
export async function paymentLink(
  ws: Workspace,
  c: Contact,
  amountCents: number,
  currency: string,
  description: string,
  /** The member who asked; told when the contact pays. */
  requestedBy?: string,
) {
  const route = paymentsFor(ws);
  if (!route.ok || amountCents <= 0) return null;
  const fee = route.account ? platformFeeCents(amountCents, await platformFeePercent(ws)) : 0;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: c.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amountCents,
          product_data: { name: description || `Payment to ${ws.name}` },
        },
      },
    ],
    metadata: {
      contactId: c.id,
      workspaceId: ws.id,
      kind: "payment_request",
      ...(requestedBy ? { requestedBy } : {}),
    },
    ...(route.account ? { payment_intent_data: destinationCharge(route.account, fee) } : {}),
    success_url: `${await publicBaseUrl(ws)}/?paid=1`,
    cancel_url: await publicBaseUrl(ws),
  });
  return session.url ?? null;
}

/**
 * Sends a templated email (proposal, payment request, follow-up) from the host to the contact, logs it,
 * mirrors it to the CRM and sets a follow-up date so Home escalates if nobody answers.
 */
export async function sendOutreach(
  ws: Workspace,
  c: Contact,
  hostUserId: string,
  kind: OutreachKind,
  input: {
    subject: string;
    body: string;
    amountCents?: number;
    currency?: string;
    followUpDays?: number;
    /** Stripe Checkout URL for a payment request; drives the "Pay securely" button. */
    payLink?: string;
    /** Drive files to send along (attachments while they fit, signed links after). */
    fileIds?: string[];
  },
) {
  if (c.emailOptOut) throw new OptedOutError();
  const [host, user] = await Promise.all([
    getProfileByUser(ws.id, hostUserId),
    db().query.users.findFirst({
      where: eq(schema.users.id, hostUserId),
      columns: { email: true },
    }),
  ]);
  const subject = input.subject.trim().slice(0, 200);
  const sent = input.fileIds?.length
    ? await filesForEmail({ userId: hostUserId, ws }, input.fileIds, await publicBaseUrl(ws))
    : null;
  const body = `${input.body.trim().slice(0, 8000)}${linksText(sent?.links ?? [])}`;
  const mail = await renderOutreach(
    ws,
    c,
    host?.displayName ?? ws.name,
    subject,
    body,
    input.payLink,
  );
  const unsub = unsubscribePostUrl(await publicBaseUrl(ws), c.id);
  const eventId = crypto.randomUUID();
  await sendEmail({
    to: c.email,
    subject,
    text: mail.text,
    html: mail.html,
    replyTo: await replyToFor(ws, eventId, user?.email),
    fromName: host?.displayName ?? ws.name,
    ...(sent?.attachments.length ? { attachments: sent.attachments } : {}),
    // One-click unsubscribe (RFC 8058): mailbox providers show their own button and POST here.
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  const label =
    kind === "proposal"
      ? "Proposal sent"
      : kind === "checkIn"
        ? "Follow-up sent"
        : `Payment requested${input.amountCents ? ` (${formatPrice(input.amountCents, input.currency ?? "usd")})` : ""}`;
  await logContactEvent(ws.id, c.id, "email_sent", `${label}: ${subject}`, {
    id: eventId,
    data: {
      kind,
      subject,
      body,
      amountCents: input.amountCents ?? null,
      sentBy: hostUserId,
      written: true,
      attachments: (sent?.files ?? []).map((f) => ({ filename: f.name, fileId: f.id })),
    },
  });
  if (sent?.files.length) await recordSentFiles(ws, eventId, sent.files, hostUserId);
  noteToCrm(ws, c.id, `${label} by ${host?.displayName ?? ws.name}: ${subject}\n\n${body}`);
  const days = input.followUpDays ?? 5;
  if (days > 0)
    await updateContact(ws.id, c.id, { nextFollowUpAt: new Date(Date.now() + days * 86_400_000) });
}

/**
 * Stripe said a payment request was paid: logs it on the contact's timeline and tells the
 * member who sent it. Returns null for anything else and for a redelivered event (so the
 * webhook audits once).
 */
export async function paymentRequestPaid(session: {
  id: string;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
}) {
  const m = session.metadata ?? {};
  if (m.kind !== "payment_request" || !m.workspaceId || !m.contactId) return null;
  const [ws, c] = await Promise.all([
    db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, m.workspaceId) }),
    db().query.contacts.findFirst({
      where: and(
        eq(schema.contacts.id, m.contactId),
        eq(schema.contacts.workspaceId, m.workspaceId),
      ),
    }),
  ]);
  if (!ws || !c) return null;
  const seen = await db().query.contactEvents.findFirst({
    where: and(
      eq(schema.contactEvents.contactId, c.id),
      eq(schema.contactEvents.type, "payment"),
      sql`${schema.contactEvents.data}->>'sessionId' = ${session.id}`,
    ),
    columns: { id: true },
  });
  if (seen) return null;
  const cents = session.amount_total ?? 0;
  const amount = formatPrice(cents, session.currency);
  const who = c.name || c.email;
  await logContactEvent(ws.id, c.id, "payment", `Paid ${amount} (payment request)`, {
    data: { sessionId: session.id, amountCents: cents, currency: session.currency },
  });
  if (m.requestedBy)
    await notify(ws, m.requestedBy, {
      kind: "payment.received",
      title: `${who} paid ${amount}`,
      body: "Payment request",
      link: `/admin/contacts/${c.id}`,
      dedupeKey: `checkout:${session.id}`,
      email: {
        subject: `Payment received: ${amount} from ${who}`,
        text: `${who} paid your payment request of ${amount}.\n\n${adminBaseUrl(ws)}/admin/contacts/${c.id}`,
      },
    });
  return { workspace: ws, contact: c, cents, currency: session.currency };
}

/**
 * The host answers from the timeline: the email goes to whoever wrote the message they answer
 * (the contact, or the address their reply came from), threads in the guest's mail client
 * (In-Reply-To / References) and lands in the same thread on the timeline.
 */
export async function sendTimelineReply(
  ws: Workspace,
  c: Contact,
  parentEventId: string,
  hostUserId: string,
  text: string,
  fileIds: string[] = [],
): Promise<{ ok: true; id: string } | { error: string }> {
  if (c.emailOptOut) return { error: "This contact has unsubscribed from your emails." };
  const body = text.trim().slice(0, 8000);
  if (!body) return { error: "Write your reply first." };
  const parent = await db().query.contactEvents.findFirst({
    where: and(
      eq(schema.contactEvents.id, parentEventId),
      eq(schema.contactEvents.workspaceId, ws.id),
      eq(schema.contactEvents.contactId, c.id),
    ),
  });
  if (!parent || (parent.type !== "email_sent" && parent.type !== "email_received"))
    return { error: "That email is no longer on the timeline." };
  const rootId = parent.parentId ?? parent.id;
  const root =
    rootId === parent.id
      ? parent
      : await db().query.contactEvents.findFirst({ where: eq(schema.contactEvents.id, rootId) });
  const d = parent.data as { from?: string; subject?: string; messageId?: string | null };
  const rootSubject =
    (root?.data as { subject?: string } | undefined)?.subject ?? d.subject ?? root?.summary ?? "";
  const subject = replySubject(rootSubject || "Our conversation");
  const to = parent.type === "email_received" && d.from ? d.from : c.email;
  return deliverToContact(ws, c, hostUserId, {
    subject,
    body,
    to,
    fileIds,
    parentId: rootId,
    bookingId: parent.bookingId,
    inReplyTo: parent.type === "email_received" ? (d.messageId ?? null) : null,
  });
}

/**
 * A new email to a contact from Messages: its own subject and thread on the timeline, with the
 * same signed Reply-To, attachments and links as a timeline reply.
 */
export async function sendGuestEmail(
  ws: Workspace,
  c: Contact,
  hostUserId: string,
  input: { subject: string; text: string; fileIds?: string[] },
): Promise<{ ok: true; id: string } | { error: string }> {
  if (c.emailOptOut) return { error: "This contact has unsubscribed from your emails." };
  const body = input.text.trim().slice(0, 8000);
  if (!body) return { error: "Write your message first." };
  const subject = input.subject.trim().slice(0, 200) || `A message from ${ws.name}`;
  return deliverToContact(ws, c, hostUserId, {
    subject,
    body,
    to: c.email,
    fileIds: input.fileIds ?? [],
    parentId: null,
    bookingId: null,
    inReplyTo: null,
  });
}

/**
 * Sends one personal email to a contact and logs it on their timeline (and so in Messages, whose
 * open tabs hear about it). Guests get email whatever their presence: no guest page shows the
 * conversation yet, and email stays their reply path (ADR 0007, slice R3 for the live surface).
 */
async function deliverToContact(
  ws: Workspace,
  c: Contact,
  hostUserId: string,
  m: {
    subject: string;
    body: string;
    to: string;
    fileIds: string[];
    parentId: string | null;
    bookingId: string | null;
    inReplyTo: string | null;
  },
): Promise<{ ok: true; id: string }> {
  const { subject, body, to, fileIds, inReplyTo } = m;
  const [host, user] = await Promise.all([
    getProfileByUser(ws.id, hostUserId),
    db().query.users.findFirst({
      where: eq(schema.users.id, hostUserId),
      columns: { email: true },
    }),
  ]);
  const sent = fileIds.length
    ? await filesForEmail({ userId: hostUserId, ws }, fileIds, await publicBaseUrl(ws))
    : null;
  const signed = `${body}${linksText(sent?.links ?? [])}\n\n${host?.displayName ?? ws.name}`;
  const mail = await letterMail({
    brand: brandFor(ws),
    subject,
    body: signed,
    signedBy: host?.displayName ?? ws.name,
  });
  const id = crypto.randomUUID();
  await sendEmail({
    to,
    subject,
    text: mail.text,
    html: mail.html,
    replyTo: await replyToFor(ws, id, user?.email),
    fromName: host?.displayName ?? ws.name,
    ...(inReplyTo ? { headers: { "In-Reply-To": inReplyTo, References: inReplyTo } } : {}),
    ...(sent?.attachments.length ? { attachments: sent.attachments } : {}),
  });
  await logContactEvent(
    ws.id,
    c.id,
    "email_sent",
    m.parentId ? `Reply: ${subject}` : `Email: ${subject}`,
    {
      id,
      parentId: m.parentId,
      bookingId: m.bookingId,
      data: {
        kind: m.parentId ? "reply" : "message",
        subject,
        body: signed,
        sentBy: hostUserId,
        written: true,
        to,
        attachments: (sent?.files ?? []).map((f) => ({ filename: f.name, fileId: f.id })),
      },
    },
  );
  if (sent?.files.length) await recordSentFiles(ws, id, sent.files, hostUserId);
  noteToCrm(
    ws,
    c.id,
    `${m.parentId ? "Reply" : "Email"} by ${host?.displayName ?? ws.name}: ${subject}\n\n${body}`,
  );
  return { ok: true, id };
}
