import "server-only";
import { publicBaseUrl } from "./urls";
import { eq, schema } from "@bookly/db";
import type { Contact, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { brandFor } from "@/emails/brand";
import type { EmailBrand } from "@/emails/layout";
import { letterMail } from "@/emails/booking";
import { logContactEvent, updateContact, noteToCrm } from "./contacts";
import { DEFAULT_TEMPLATES, type OutreachKind, type Template } from "./outreach-text";
import { platformFeeCents, platformFeePercent } from "./connect";
import { formatPrice, paymentsFor, stripe } from "./payments";
import { unsubscribePostUrl, unsubscribeUrl } from "./unsubscribe";
import { getProfileByUser } from "./scheduling";

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
) {
  const route = paymentsFor(ws);
  if (!route.ok || amountCents <= 0) return null;
  const fee = route.account ? platformFeeCents(amountCents, await platformFeePercent(ws)) : 0;
  const session = await stripe().checkout.sessions.create(
    {
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
      metadata: { contactId: c.id, workspaceId: ws.id, kind: "payment_request" },
      ...(fee > 0 ? { payment_intent_data: { application_fee_amount: fee } } : {}),
      success_url: `${await publicBaseUrl(ws)}/?paid=1`,
      cancel_url: await publicBaseUrl(ws),
    },
    route.account ? { stripeAccount: route.account } : undefined,
  );
  return session.url ?? null;
}

/**
 * Sends a templated email (proposal, payment request, follow-up) from the host to the contact, logs it,
 * mirrors it to the CRM and sets a follow-up date so the inbox escalates if nobody answers.
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
  const body = input.body.trim().slice(0, 8000);
  const mail = await renderOutreach(
    ws,
    c,
    host?.displayName ?? ws.name,
    subject,
    body,
    input.payLink,
  );
  const unsub = unsubscribePostUrl(await publicBaseUrl(ws), c.id);
  await sendEmail({
    to: c.email,
    subject,
    text: mail.text,
    html: mail.html,
    replyTo: user?.email ?? undefined,
    fromName: host?.displayName ?? ws.name,
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
    data: { kind, body, amountCents: input.amountCents ?? null },
  });
  noteToCrm(ws, c.id, `${label} by ${host?.displayName ?? ws.name}: ${subject}\n\n${body}`);
  const days = input.followUpDays ?? 5;
  if (days > 0)
    await updateContact(ws.id, c.id, { nextFollowUpAt: new Date(Date.now() + days * 86_400_000) });
}
