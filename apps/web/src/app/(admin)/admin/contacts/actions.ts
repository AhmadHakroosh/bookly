"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTACT_STAGES, type ContactStage } from "@bookly/db/schema";
import { brandForPreview } from "@/emails/brand";
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
import { baseUrl, getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function ctx() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  return { session, ws };
}

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

export async function saveContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const { ws } = await ctx();
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  if (!(await getContact(ws.id, d.id))) return { error: "Contact not found" };
  const next = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
  await updateContact(ws.id, d.id, {
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
  });
  revalidatePath(`/admin/contacts/${d.id}`);
  return { ok: true };
}

export async function sendProposal(
  id: string,
  formData: FormData,
): Promise<{ error?: string } | void> {
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
  revalidatePath(`/admin/contacts/${id}`);
}

/** The follow-up nudge: same flow as a proposal, defaulting to a week until the next check-in. */
export async function sendFollowUp(
  id: string,
  formData: FormData,
): Promise<{ error?: string } | void> {
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
      bookingUrl: host ? `${baseUrl()}/${host.username}` : baseUrl(),
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
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin");
}

export async function sendPaymentRequest(
  id: string,
  formData: FormData,
): Promise<{ error?: string } | void> {
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
  revalidatePath(`/admin/contacts/${id}`);
}

export async function changeStage(id: string, formData: FormData) {
  const { ws, session } = await ctx();
  const stage = String(formData.get("stage") ?? "");
  if (!(CONTACT_STAGES as readonly string[]).includes(stage)) return;
  await setStage(ws.id, id, stage as ContactStage, session.user.id);
  revalidatePath(`/admin/contacts/${id}`);
}

export async function addNote(id: string, formData: FormData) {
  const { ws } = await ctx();
  const text = String(formData.get("text") ?? "")
    .trim()
    .slice(0, 2000);
  if (!text || !(await getContact(ws.id, id))) return;
  await logContactEvent(ws.id, id, "note", text);
  revalidatePath(`/admin/contacts/${id}`);
}

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
): Promise<OutreachPreview | { error: string }> {
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
      bookingUrl: host ? `${baseUrl()}/${host.username}` : baseUrl(),
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
  await setEmailOptOut(ws.id, id, optOut, "host");
  revalidatePath(`/admin/contacts/${id}`);
  revalidatePath("/admin");
}
