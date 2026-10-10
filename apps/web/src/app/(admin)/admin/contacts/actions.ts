"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTACT_STAGES, type ContactStage } from "@bookly/db/schema";
import { brandForPreview } from "@/emails/brand";
import { audit, diff } from "@/server/audit";
import { paymentsReady } from "@/server/payments";
import {
  getContact,
  logContactEvent,
  setEmailOptOut,
  setStage,
  updateContact,
} from "@/server/contacts";
import { OptedOutError, paymentLink, sendOutreach, renderOutreach } from "@/server/outreach";
import { fillTemplate, type OutreachKind } from "@/server/outreach-text";
import { formatPrice } from "@/server/payments";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { publicBaseUrl } from "@/server/urls";
import { getCurrentWorkspace } from "@/server/workspace";

async function ctx() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  return { session, ws };
}

const contactTarget = (c: { id: string; name: string | null; email: string }) => ({
  type: "contact",
  id: c.id,
  label: c.name || c.email,
});

const detailsSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(120).default(""),
  company: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  tags: z.string().max(500).default(""),
  notes: z.string().max(10000).default(""),
  nextFollowUpAt: z.string().max(30).default(""),
});

export type ContactState = { ok?: boolean; error?: string };
/** Send actions: nothing on success, or the reason the email could not go out. */
export type SendResult = { error?: string } | void;

export async function saveContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const { ws } = await ctx();
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const c = await getContact(ws.id, d.id);
  if (!c) return { error: "Contact not found" };
  const next = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
  const patch = {
    name: d.name,
    company: d.company || null,
    phone: d.phone || null,
    tags: [
      ...new Set(
        d.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20),
    notes: d.notes || null,
    nextFollowUpAt: next && !Number.isNaN(next.getTime()) ? next : null,
  };
  await updateContact(ws.id, d.id, patch);
  await audit({
    action: "contact.updated",
    target: contactTarget(c),
    changes: diff(c, patch, ["name", "company", "phone", "tags", "notes", "nextFollowUpAt"]),
  });
  revalidatePath(`/admin/contacts/${d.id}`);
  return { ok: true };
}

export async function sendProposal(id: string, formData: FormData): Promise<SendResult> {
  const { ws, session } = await ctx();
  const c = await getContact(ws.id, id);
  if (!c) return;
  const host = await getProfileByUser(ws.id, session.user.id);
  const t = fillTemplate(
    { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") },
    {
      name: c.name || "there",
      company: c.company || c.name || "you",
      host: host?.displayName ?? ws.name,
      amount: "",
      payLink: "",
    },
  );
  if (!t.subject || !t.body) return;
  try {
    await sendOutreach(ws, c, session.user.id, "proposal", {
      ...t,
      followUpDays: Number(formData.get("followUpDays")) || 0,
    });
  } catch (e) {
    if (e instanceof OptedOutError) return { error: e.message };
    throw e;
  }
  await audit({
    action: "email.proposal_sent",
    target: contactTarget(c),
    changes: { subject: { to: t.subject } },
  });
  revalidatePath(`/admin/contacts/${id}`);
}

/** The follow-up nudge: same flow as a proposal, defaulting to a week until the next check-in. */
export async function sendFollowUp(id: string, formData: FormData): Promise<SendResult> {
  const { ws, session } = await ctx();
  const c = await getContact(ws.id, id);
  if (!c) return;
  const host = await getProfileByUser(ws.id, session.user.id);
  const t = fillTemplate(
    { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") },
    {
      name: c.name || "there",
      company: c.company || c.name || "you",
      host: host?.displayName ?? ws.name,
      amount: "",
      payLink: "",
      bookingUrl: host ? `${await publicBaseUrl(ws)}/${host.username}` : await publicBaseUrl(ws),
    },
  );
  if (!t.subject || !t.body) return;
  try {
    await sendOutreach(ws, c, session.user.id, "checkIn", {
      ...t,
      followUpDays: Number(formData.get("followUpDays")) || 0,
    });
  } catch (e) {
    if (e instanceof OptedOutError) return { error: e.message };
    throw e;
  }
  await audit({
    action: "email.follow_up_sent",
    target: contactTarget(c),
    changes: { subject: { to: t.subject } },
  });
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin");
}

export async function sendPaymentRequest(id: string, formData: FormData): Promise<SendResult> {
  const { ws, session } = await ctx();
  const c = await getContact(ws.id, id);
  if (!c) return;
  const amountCents = Math.round((Number(formData.get("amount")) || 0) * 100);
  if (amountCents <= 0) return;
  const currency =
    String(formData.get("currency") ?? "usd")
      .trim()
      .toLowerCase()
      .slice(0, 3) || "usd";
  const host = await getProfileByUser(ws.id, session.user.id);
  const link = await paymentLink(
    ws,
    c,
    amountCents,
    currency,
    String(formData.get("description") ?? ""),
  ).catch(() => null);
  const t = fillTemplate(
    { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") },
    {
      name: c.name || "there",
      company: c.company || c.name || "you",
      host: host?.displayName ?? ws.name,
      amount: formatPrice(amountCents, currency),
      payLink: link ?? "",
    },
  );
  if (!t.subject || !t.body) return;
  try {
    await sendOutreach(ws, c, session.user.id, "paymentRequest", {
      ...t,
      payLink: link ?? undefined,
      amountCents,
      currency,
      followUpDays: Number(formData.get("followUpDays")) || 0,
    });
  } catch (e) {
    if (e instanceof OptedOutError) return { error: e.message };
    throw e;
  }
  await audit({
    action: "email.payment_request_sent",
    target: contactTarget(c),
    changes: { subject: { to: t.subject }, amount: { to: formatPrice(amountCents, currency) } },
  });
  revalidatePath(`/admin/contacts/${id}`);
}

export async function changeStage(id: string, formData: FormData) {
  const { ws, session } = await ctx();
  const stage = String(formData.get("stage") ?? "");
  if (!(CONTACT_STAGES as readonly string[]).includes(stage)) return;
  const c = await getContact(ws.id, id);
  if (!c || c.stage === stage) return;
  await setStage(ws.id, id, stage as ContactStage, session.user.id);
  await audit({
    action: "contact.stage_changed",
    target: contactTarget(c),
    changes: { stage: { from: c.stage, to: stage } },
  });
  revalidatePath(`/admin/contacts/${id}`);
}

export async function addNote(id: string, formData: FormData) {
  const { ws } = await ctx();
  const text = String(formData.get("text") ?? "")
    .trim()
    .slice(0, 2000);
  if (!text) return;
  const c = await getContact(ws.id, id);
  if (!c) return;
  await logContactEvent(ws.id, id, "note", text);
  await audit({ action: "contact.note_added", target: contactTarget(c) });
  revalidatePath(`/admin/contacts/${id}`);
}

export type PreviewResult = OutreachPreview | { error: string };

export type OutreachPreview = {
  to: string;
  subject: string;
  html: string;
  /** What the "Pay securely" button will link to once sent. */
  note?: string;
};

/**
 * Step one of sending: the exact email, rendered with the host's edits. Nothing is sent and no
 * Stripe session is created; the payment button is shown with a placeholder link.
 */
export async function previewOutreach(
  id: string,
  kind: OutreachKind,
  formData: FormData,
): Promise<PreviewResult> {
  // audit: read-only — renders the email for review; nothing is sent or stored.
  const { ws, session } = await ctx();
  const c = await getContact(ws.id, id);
  if (!c) return { error: "Contact not found." };
  const host = await getProfileByUser(ws.id, session.user.id);
  const amountCents = Math.round((Number(formData.get("amount")) || 0) * 100);
  const currency =
    String(formData.get("currency") ?? "usd")
      .trim()
      .toLowerCase()
      .slice(0, 3) || "usd";
  if (kind === "paymentRequest" && amountCents <= 0) return { error: "Enter an amount." };
  const willLink = kind === "paymentRequest" && paymentsReady(ws);
  const t = fillTemplate(
    { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") },
    {
      name: c.name || "there",
      company: c.company || c.name || "you",
      host: host?.displayName ?? ws.name,
      amount: kind === "paymentRequest" ? formatPrice(amountCents, currency) : "",
      payLink: willLink ? "https://checkout.stripe.com/…" : "",
      bookingUrl: host ? `${await publicBaseUrl(ws)}/${host.username}` : await publicBaseUrl(ws),
    },
  );
  if (!t.subject || !t.body) return { error: "Subject and message are required." };
  const mail = await renderOutreach(
    ws,
    c,
    host?.displayName ?? ws.name,
    t.subject,
    t.body,
    willLink ? "https://checkout.stripe.com/" : undefined,
    await brandForPreview(ws),
  );
  return {
    to: c.email,
    subject: mail.subject,
    html: mail.html,
    note: willLink
      ? `The button and link will point to a Stripe Checkout page for ${formatPrice(amountCents, currency)}, created when you send.`
      : undefined,
  };
}

/** Host-side opt-out (a contact asked in person) or opt-in again (they asked for emails back). */
export async function setContactEmailOptOut(id: string, optOut: boolean) {
  const { ws } = await ctx();
  const c = await getContact(ws.id, id);
  if (!c) return;
  await setEmailOptOut(ws.id, id, optOut, "host");
  await audit({
    action: "contact.email_opt_out_set",
    target: contactTarget(c),
    changes: { emailOptOut: { from: c.emailOptOut, to: optOut } },
  });
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin");
}
