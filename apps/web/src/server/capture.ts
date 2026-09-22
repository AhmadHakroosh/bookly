import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { and, asc, eq, isNull, lte, schema, sql } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Booking, EventType, Task, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { brandFor } from "@/emails/brand";
import { letterMail } from "@/emails/booking";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { serializeTask } from "./api";
import { assistantConfigured } from "./brief";
import { emitEvent } from "./webhooks";
import { CAPTURE_SYSTEM, dueDate, manualCapture, parseCapture, type Capture } from "./capture-text";
import { logContactEvent, setStage, trackBooking, noteToCrm } from "./contacts";
import { notifyHost } from "./notify";
import { baseUrl, getProfileByUser } from "./scheduling";

/**
 * Turns notes / a transcript into a summary, decisions, tasks with due dates, a stage
 * suggestion and a follow-up draft, and records all of it on the contact's timeline.
 */
export async function captureMeeting(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType | null,
  notes: string,
): Promise<{ capture: Capture; tasks: Task[]; eventId: string | null }> {
  const existing = booking.contactId
    ? await db().query.contacts.findFirst({ where: eq(schema.contacts.id, booking.contactId) })
    : null;
  const contact =
    existing ??
    (await trackBooking(workspace, booking, "booked", `Booked ${eventType?.title ?? "meeting"}`));
  let capture: Capture = manualCapture(notes);
  let model: string | null = null;
  if (assistantConfigured()) {
    try {
      const env = loadEnv();
      const host = await getProfileByUser(workspace.id, booking.hostUserId);
      const r = await generateText({
        model: anthropic(env.ASSISTANT_MODEL || "claude-sonnet-5"),
        system: CAPTURE_SYSTEM,
        prompt: `Meeting: ${eventType?.title ?? "Meeting"} on ${fmtDateTime(booking.startAt, host?.timezone ?? workspace.timezone)} between ${host?.displayName ?? "the consultant"} (me) and ${booking.attendeeName}${contact.company ? ` of ${contact.company}` : ""} (them). Contact stage today: ${contact.stage}.\n\nNotes:\n${notes.slice(0, 20000)}`,
      });
      const parsed = parseCapture(r.text);
      if (parsed) {
        capture = parsed;
        model = env.ASSISTANT_MODEL || "claude-sonnet-5";
      }
    } catch (e) {
      console.error("[capture] model failed, using manual capture", e);
    }
  }
  const tasks = capture.actions.length
    ? await db()
        .insert(schema.tasks)
        .values(
          capture.actions.map((a) => ({
            workspaceId: workspace.id,
            contactId: contact.id,
            bookingId: booking.id,
            userId: booking.hostUserId,
            title: a.owner === "them" ? `${booking.attendeeName}: ${a.title}` : a.title,
            dueAt: dueDate(a.dueInDays),
          })),
        )
        .returning()
    : [];
  const summaryLine = [
    capture.summary,
    capture.decisions.length ? `Decisions: ${capture.decisions.join("; ")}` : "",
    capture.nextStep ? `Next: ${capture.nextStep}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const [ev] = await db()
    .insert(schema.contactEvents)
    .values({
      workspaceId: workspace.id,
      contactId: contact.id,
      bookingId: booking.id,
      type: "capture",
      summary: summaryLine.slice(0, 500) || "Meeting captured",
      data: { capture, model, notes: notes.slice(0, 20000) },
    })
    .returning();
  if (
    capture.suggestedStage &&
    capture.suggestedStage !== contact.stage &&
    capture.suggestedStage !== "lead"
  )
    await setStage(workspace.id, contact.id, capture.suggestedStage, "capture");
  emitEvent(workspace.id, "meeting.captured", {
    bookingId: booking.id,
    contactId: contact.id,
    capture,
    tasks: tasks.map(serializeTask),
  });
  for (const t of tasks) emitEvent(workspace.id, "task.created", { task: serializeTask(t) });
  noteToCrm(
    workspace,
    contact.id,
    `Meeting notes (${eventType?.title ?? "Meeting"}, ${fmtDateTime(booking.startAt, workspace.timezone)}):\n${summaryLine}${tasks.length ? `\n\nAction items:\n${tasks.map((t) => `- ${t.title}`).join("\n")}` : ""}`,
  );
  if (tasks.length)
    await logContactEvent(
      workspace.id,
      contact.id,
      "task",
      `${tasks.length} action item${tasks.length === 1 ? "" : "s"}: ${tasks.map((t) => t.title).join("; ")}`,
      { bookingId: booking.id },
    );
  return { capture, tasks, eventId: ev?.id ?? null };
}

/** Sends the follow-up email from the host to the attendee and logs it. */
export async function sendFollowUp(
  workspace: Workspace,
  booking: Booking,
  subject: string,
  body: string,
): Promise<boolean> {
  const [host, user] = await Promise.all([
    getProfileByUser(workspace.id, booking.hostUserId),
    db().query.users.findFirst({
      where: eq(schema.users.id, booking.hostUserId),
      columns: { email: true },
    }),
  ]);
  const signed = `${body.trim()}\n\n${host?.displayName ?? workspace.name}`;
  const mail = await letterMail({
    brand: brandFor(workspace),
    subject: subject.trim(),
    body: signed,
    signedBy: host?.displayName ?? workspace.name,
  });
  try {
    await sendEmail({
      to: booking.attendeeEmail,
      subject: subject.trim(),
      text: mail.text,
      html: mail.html,
      replyTo: user?.email ?? undefined,
      fromName: host?.displayName ?? workspace.name,
    });
  } catch (e) {
    console.error("[capture] follow-up failed", e);
    return false;
  }
  await trackBooking(workspace, booking, "email_sent", `Follow-up: ${subject.trim()}`, {
    body: signed,
  });
  return true;
}

/* ---------------- Tasks ---------------- */

export async function listOpenTasks(
  workspaceId: string,
  opts: { userId?: string; contactId?: string; bookingId?: string; limit?: number } = {},
): Promise<Task[]> {
  const conds = [eq(schema.tasks.workspaceId, workspaceId), isNull(schema.tasks.doneAt)];
  if (opts.userId) conds.push(eq(schema.tasks.userId, opts.userId));
  if (opts.contactId) conds.push(eq(schema.tasks.contactId, opts.contactId));
  if (opts.bookingId) conds.push(eq(schema.tasks.bookingId, opts.bookingId));
  return db()
    .select()
    .from(schema.tasks)
    .where(and(...conds))
    .orderBy(sql`${schema.tasks.dueAt} asc nulls last`, asc(schema.tasks.createdAt))
    .limit(opts.limit ?? 100);
}

export async function addTask(
  workspaceId: string,
  input: {
    userId: string;
    title: string;
    contactId?: string | null;
    bookingId?: string | null;
    dueAt?: Date | null;
  },
) {
  const [t] = await db()
    .insert(schema.tasks)
    .values({
      workspaceId,
      userId: input.userId,
      title: input.title.trim().slice(0, 200),
      contactId: input.contactId ?? null,
      bookingId: input.bookingId ?? null,
      dueAt: input.dueAt ?? null,
    })
    .returning();
  emitEvent(workspaceId, "task.created", { task: serializeTask(t!) });
  return t!;
}

export async function completeTask(workspaceId: string, id: string, done = true) {
  await db()
    .update(schema.tasks)
    .set({ doneAt: done ? new Date() : null })
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, workspaceId)));
}

export async function deleteTask(workspaceId: string, id: string) {
  await db()
    .delete(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, workspaceId)));
}

/** One email per host listing tasks that became overdue (sent once per task). Called from the tick. */
export async function nudgeOverdueTasks(now = new Date()): Promise<number> {
  const due = await db()
    .select()
    .from(schema.tasks)
    .where(
      and(isNull(schema.tasks.doneAt), isNull(schema.tasks.nudgedAt), lte(schema.tasks.dueAt, now)),
    )
    .limit(500);
  if (!due.length) return 0;
  const byUser = new Map<string, Task[]>();
  for (const t of due) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
  for (const [userId, list] of byUser) {
    const ws = await db().query.workspaces.findFirst({
      where: eq(schema.workspaces.id, list[0]!.workspaceId),
    });
    const profile = ws ? await getProfileByUser(ws.id, userId) : null;
    const tz = profile?.timezone ?? ws?.timezone ?? "UTC";
    const lines = list.map((t) => `• ${t.title}${t.dueAt ? ` (due ${fmtDate(t.dueAt, tz)})` : ""}`);
    const text = `${list.length} task${list.length === 1 ? " is" : "s are"} overdue:\n\n${lines.join("\n")}\n\n${baseUrl()}/admin`;
    await notifyHost(userId, "reminder1h", {
      subject: `${list.length} overdue task${list.length === 1 ? "" : "s"}`,
      text,
      email: { subject: `${list.length} overdue task${list.length === 1 ? "" : "s"}`, text },
    }).catch(() => {});
    await db()
      .update(schema.tasks)
      .set({ nudgedAt: now })
      .where(
        and(
          eq(schema.tasks.userId, userId),
          isNull(schema.tasks.doneAt),
          isNull(schema.tasks.nudgedAt),
          lte(schema.tasks.dueAt, now),
        ),
      );
  }
  return due.length;
}
