import "server-only";
import { eq, schema } from "@bookly/db";
import type { Contact, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { logContactEvent, updateContact, noteToCrm } from "./contacts";
import { DEFAULT_TEMPLATES, type Template } from "./outreach-text";
import { formatPrice, paymentsConfigured, stripe } from "./payments";
import { baseUrl, getProfileByUser } from "./scheduling";

export function templatesFor(ws: Workspace) {
  const t = ws.settings.templates ?? {};
  return {
    proposal: { ...DEFAULT_TEMPLATES.proposal, ...(t.proposal ?? {}) } as Template,
    paymentRequest: {
      ...DEFAULT_TEMPLATES.paymentRequest,
      ...(t.paymentRequest ?? {}),
    } as Template,
  };
}

/** A Stripe Checkout link for an arbitrary amount (null when Stripe is not set up). */
export async function paymentLink(
  ws: Workspace,
  c: Contact,
  amountCents: number,
  currency: string,
  description: string,
) {
  if (!paymentsConfigured() || amountCents <= 0) return null;
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
    metadata: { contactId: c.id, workspaceId: ws.id, kind: "payment_request" },
    success_url: `${baseUrl()}/?paid=1`,
    cancel_url: baseUrl(),
  });
  return session.url ?? null;
}

/**
 * Sends a templated email (proposal, payment request) from the host to the contact, logs it,
 * mirrors it to the CRM and sets a follow-up date so the inbox escalates if nobody answers.
 */
export async function sendOutreach(
  ws: Workspace,
  c: Contact,
  hostUserId: string,
  kind: "proposal" | "paymentRequest",
  input: {
    subject: string;
    body: string;
    amountCents?: number;
    currency?: string;
    followUpDays?: number;
  },
) {
  const [host, user] = await Promise.all([
    getProfileByUser(ws.id, hostUserId),
    db().query.users.findFirst({
      where: eq(schema.users.id, hostUserId),
      columns: { email: true },
    }),
  ]);
  const subject = input.subject.trim().slice(0, 200);
  const body = input.body.trim().slice(0, 8000);
  await sendEmail({
    to: c.email,
    subject,
    text: body,
    replyTo: user?.email ?? undefined,
    fromName: host?.displayName ?? ws.name,
  });
  const label =
    kind === "proposal"
      ? "Proposal sent"
      : `Payment requested${input.amountCents ? ` (${formatPrice(input.amountCents, input.currency ?? "usd")})` : ""}`;
  await logContactEvent(ws.id, c.id, "email_sent", `${label}: ${subject}`, {
    data: { kind, body, amountCents: input.amountCents ?? null },
  });
  noteToCrm(ws, c.id, `${label} by ${host?.displayName ?? ws.name}: ${subject}\n\n${body}`);
  const days = input.followUpDays ?? 5;
  if (days > 0)
    await updateContact(ws.id, c.id, { nextFollowUpAt: new Date(Date.now() + days * 86_400_000) });
}
