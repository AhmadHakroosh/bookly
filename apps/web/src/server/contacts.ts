import "server-only";
import { and, asc, desc, eq, ilike, or, schema, sql } from "@bookly/db";
import type {
  Booking,
  Contact,
  ContactEvent,
  ContactEventType,
  ContactStage,
  Workspace,
} from "@bookly/db/schema";
import { db } from "@/lib/db";
import { serializeContact } from "./api";
import { refreshWorkspace } from "./cache";
import { emitEvent } from "./webhooks";
import { enqueue } from "./jobs";

/**
 * Contacts are the relationship layer: one row per email per workspace, with a stage and a
 * timeline of everything that happened (bookings, emails, notes, form answers).
 */

export async function upsertContact(
  workspaceId: string,
  input: { email: string; name?: string | null; phone?: string | null; company?: string | null },
): Promise<Contact> {
  const email = input.email.trim().toLowerCase();
  const existing = await db().query.contacts.findFirst({
    where: and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.email, email)),
  });
  if (existing) {
    const patch: Partial<Contact> = { lastActivityAt: new Date() };
    if (!existing.name && input.name) patch.name = input.name.trim().slice(0, 120);
    if (!existing.phone && input.phone) patch.phone = input.phone.trim().slice(0, 40);
    if (!existing.company && input.company) patch.company = input.company.trim().slice(0, 120);
    const [c] = await db()
      .update(schema.contacts)
      .set(patch)
      .where(eq(schema.contacts.id, existing.id))
      .returning();
    return c ?? existing;
  }
  const [c] = await db()
    .insert(schema.contacts)
    .values({
      workspaceId,
      email,
      name: input.name?.trim().slice(0, 120) ?? "",
      phone: input.phone?.trim().slice(0, 40) || null,
      company: input.company?.trim().slice(0, 120) || null,
    })
    .onConflictDoNothing()
    .returning();
  const contact =
    c ??
    (await db().query.contacts.findFirst({
      where: and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.email, email)),
    }))!;
  if (c) {
    emitEvent(workspaceId, "contact.created", { contact: serializeContact(c) });
    void afterContactChange(workspaceId, c);
  }
  return contact;
}

/** Mirrors the contact to the CRM (when one is configured) through the job queue, with retries. */
async function afterContactChange(workspaceId: string, c: Contact) {
  try {
    const ws = await workspaceOf(workspaceId);
    if (ws?.settings.crm?.apiKey)
      await enqueue(
        "crm.sync",
        { workspaceId, contactId: c.id },
        { dedupeId: `crm:${c.id}:${Date.now() >> 16}` },
      );
  } catch (e) {
    console.error("[contacts] crm sync enqueue failed", e);
  }
}

export async function workspaceOf(workspaceId: string) {
  return (
    (await db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) })) ??
    null
  );
}

/** Attach a note to the contact's CRM record, queued so a CRM outage never blocks the caller. */
export function noteToCrm(
  ws: { id: string; settings: { crm?: { apiKey?: string } | null } },
  contactId: string,
  text: string,
) {
  if (!ws.settings.crm?.apiKey) return;
  void enqueue("crm.note", { workspaceId: ws.id, contactId, text }).catch((e) =>
    console.error("[contacts] crm note enqueue failed", e),
  );
}

/** Appends a timeline event and bumps the contact's activity time. Best-effort. */
export async function logContactEvent(
  workspaceId: string,
  contactId: string,
  type: ContactEventType,
  summary: string,
  opts: { bookingId?: string | null; data?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db()
      .insert(schema.contactEvents)
      .values({
        workspaceId,
        contactId,
        bookingId: opts.bookingId ?? null,
        type,
        summary: summary.slice(0, 500),
        data: opts.data ?? {},
      });
    await db()
      .update(schema.contacts)
      .set({ lastActivityAt: new Date() })
      .where(eq(schema.contacts.id, contactId));
  } catch (e) {
    console.error("[contacts] event failed", e);
  }
}

/** Finds (or creates) the contact for a booking's attendee and logs an event for it. */
export async function trackBooking(
  workspace: Workspace,
  booking: Booking,
  type: ContactEventType,
  summary: string,
  data: Record<string, unknown> = {},
): Promise<Contact> {
  const contact = await upsertContact(workspace.id, {
    email: booking.attendeeEmail,
    name: booking.attendeeName,
    phone: booking.attendeePhone,
  });
  if (booking.contactId !== contact.id)
    await db()
      .update(schema.bookings)
      .set({ contactId: contact.id })
      .where(eq(schema.bookings.id, booking.id));
  await logContactEvent(workspace.id, contact.id, type, summary, { bookingId: booking.id, data });
  if (type === "booked" || type === "completed") await recount(contact.id);
  // A completed meeting turns a lead into an active relationship.
  if (type === "completed" && contact.stage === "lead")
    await setStage(workspace.id, contact.id, "active", "system");
  return contact;
}

async function recount(contactId: string) {
  await db()
    .update(schema.contacts)
    .set({
      bookingsCount: sql`(select count(*)::int from ${schema.bookings} where ${schema.bookings.contactId} = ${contactId} and ${schema.bookings.status} in ('confirmed','pending','completed','no_show'))`,
    })
    .where(eq(schema.contacts.id, contactId));
}

export async function setStage(
  workspaceId: string,
  contactId: string,
  stage: ContactStage,
  by: string,
): Promise<void> {
  const c = await db().query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) });
  if (!c || c.workspaceId !== workspaceId || c.stage === stage) return;
  const [updated] = await db()
    .update(schema.contacts)
    .set({ stage })
    .where(eq(schema.contacts.id, contactId))
    .returning();
  await logContactEvent(workspaceId, contactId, "stage_changed", `Stage: ${c.stage} → ${stage}`, {
    data: { from: c.stage, to: stage, by },
  });
  if (updated) {
    emitEvent(workspaceId, "contact.stage_changed", {
      contact: serializeContact(updated),
      from: c.stage,
      to: stage,
      by,
    });
    void afterContactChange(workspaceId, updated);
  }
  refreshWorkspace(workspaceId);
}

export async function getContact(workspaceId: string, id: string): Promise<Contact | null> {
  return (
    (await db().query.contacts.findFirst({
      where: and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, id)),
    })) ?? null
  );
}

export async function getContactByEmail(workspaceId: string, email: string) {
  return (
    (await db().query.contacts.findFirst({
      where: and(
        eq(schema.contacts.workspaceId, workspaceId),
        eq(schema.contacts.email, email.trim().toLowerCase()),
      ),
    })) ?? null
  );
}

export async function listContacts(
  workspaceId: string,
  opts: { q?: string; stage?: ContactStage; limit?: number } = {},
): Promise<Contact[]> {
  const conds = [eq(schema.contacts.workspaceId, workspaceId)];
  if (opts.stage) conds.push(eq(schema.contacts.stage, opts.stage));
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    conds.push(
      or(
        ilike(schema.contacts.name, like),
        ilike(schema.contacts.email, like),
        ilike(schema.contacts.company, like),
      )!,
    );
  }
  return db()
    .select()
    .from(schema.contacts)
    .where(and(...conds))
    .orderBy(desc(schema.contacts.lastActivityAt))
    .limit(opts.limit ?? 200);
}

export async function contactTimeline(contactId: string, limit = 100): Promise<ContactEvent[]> {
  return db()
    .select()
    .from(schema.contactEvents)
    .where(eq(schema.contactEvents.contactId, contactId))
    .orderBy(desc(schema.contactEvents.createdAt))
    .limit(limit);
}

export async function contactBookings(contactId: string) {
  const rows = await db()
    .select({ b: schema.bookings, eventTitle: schema.eventTypes.title })
    .from(schema.bookings)
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
    .where(eq(schema.bookings.contactId, contactId))
    .orderBy(asc(schema.bookings.startAt));
  return rows.map((r) => ({ ...r.b, eventTitle: r.eventTitle }));
}

export async function updateContact(
  workspaceId: string,
  id: string,
  patch: Partial<Pick<Contact, "name" | "company" | "phone" | "tags" | "notes" | "nextFollowUpAt">>,
) {
  await db()
    .update(schema.contacts)
    .set(patch)
    .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, id)));
  refreshWorkspace(workspaceId);
}

/**
 * Opt the contact out of (or back into) the host's outreach emails. `by` says who did it: the
 * contact through an unsubscribe link, or a host on the contact's request. Booking emails
 * (confirmations, reminders) are unaffected: the contact asked for those by booking.
 */
export async function setEmailOptOut(
  workspaceId: string,
  id: string,
  optOut: boolean,
  by: "contact" | "host",
) {
  const [row] = await db()
    .update(schema.contacts)
    .set({ emailOptOut: optOut, emailOptOutAt: optOut ? new Date() : null })
    .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, id)))
    .returning({ id: schema.contacts.id, was: schema.contacts.emailOptOut });
  if (!row) return false;
  await logContactEvent(
    workspaceId,
    id,
    "note",
    optOut
      ? by === "contact"
        ? "Unsubscribed from emails (via the link in an email)"
        : "Opted out of emails (by the host)"
      : "Opted back in to emails (by the host)",
  );
  refreshWorkspace(workspaceId);
  return true;
}

/** Finds a contact by id alone (unsubscribe links carry no workspace). */
export async function getContactById(id: string): Promise<Contact | null> {
  return (await db().query.contacts.findFirst({ where: eq(schema.contacts.id, id) })) ?? null;
}

/** Existing customers (active / won) and anyone tagged `vip` get priority scheduling. */
export const isPriorityContact = (c: Pick<Contact, "stage" | "tags"> | null | undefined) =>
  !!c &&
  (c.stage === "active" || c.stage === "won" || c.tags.some((t) => t.toLowerCase() === "vip"));

export async function priorityForEmail(workspaceId: string, email: string | null | undefined) {
  if (!email) return false;
  return isPriorityContact(await getContactByEmail(workspaceId, email));
}

/** Contacts the host should look at: overdue follow-ups first, then long-quiet leads. */
export async function staleContacts(workspaceId: string, quietDays = 7, limit = 20) {
  const cutoff = new Date(Date.now() - quietDays * 86_400_000);
  return db()
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.workspaceId, workspaceId),
        or(
          sql`${schema.contacts.nextFollowUpAt} <= now()`,
          and(
            eq(schema.contacts.stage, "lead"),
            sql`${schema.contacts.lastActivityAt} <= ${cutoff}`,
          ),
        )!,
      ),
    )
    .orderBy(asc(schema.contacts.nextFollowUpAt), asc(schema.contacts.lastActivityAt))
    .limit(limit);
}
