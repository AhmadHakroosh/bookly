/**
 * Pure part of the pre-meeting briefing: the facts we hand to the model, and the plain-text
 * summary used when no model is configured (or as a fallback when it fails).
 */
import type { Booking, Contact, ContactEvent } from "@bookly/db/schema";
import { fmtDateTime } from "@/lib/time";

export type BriefFacts = {
  tz: string;
  booking: Pick<
    Booking,
    "startAt" | "endAt" | "timezone" | "notes" | "answers" | "seriesIndex" | "seriesCount"
  >;
  eventTitle: string;
  questions: { label: string; answer: string }[];
  contact: Pick<
    Contact,
    "name" | "email" | "company" | "stage" | "tags" | "notes" | "bookingsCount" | "createdAt"
  >;
  /** Newest first. */
  timeline: Pick<ContactEvent, "type" | "summary" | "createdAt" | "data">[];
  previousMeetings: { title: string; startAt: Date; status: string }[];
  /** Still-open action items with this contact (carried over between sessions). */
  openTasks?: string[];
};

const daysAgo = (d: Date, now: Date) =>
  Math.max(0, Math.round((now.getTime() - d.getTime()) / 86_400_000));

/** A deterministic brief: who they are, history, what they asked, what to prepare. */
export function plainBrief(f: BriefFacts, now = new Date()): string {
  const who = [f.contact.name || f.contact.email, f.contact.company].filter(Boolean).join(", ");
  const lines: string[] = [];
  lines.push(
    `${who} · ${f.contact.stage}${f.contact.tags.length ? ` · ${f.contact.tags.join(", ")}` : ""}`,
  );
  const past = f.previousMeetings.filter((m) => m.startAt < now);
  if (past.length) {
    const last = past[past.length - 1]!;
    lines.push(
      `History: ${past.length} previous meeting${past.length === 1 ? "" : "s"}; last one "${last.title}" ${daysAgo(last.startAt, now)} days ago (${last.status.replace("_", " ")}).`,
    );
  } else {
    lines.push(`First meeting. Contact since ${fmtDateTime(f.contact.createdAt, f.tz)}.`);
  }
  if (f.questions.length)
    lines.push(`They said: ${f.questions.map((q) => `${q.label}: ${q.answer}`).join(" · ")}`);
  if (f.booking.notes) lines.push(`Their note: ${f.booking.notes}`);
  if (f.contact.notes) lines.push(`Your notes: ${f.contact.notes}`);
  const notes = f.timeline.filter((e) => e.type === "note" || e.type === "capture").slice(0, 3);
  if (notes.length) lines.push(`Recent notes: ${notes.map((n) => n.summary).join(" | ")}`);
  if (f.openTasks?.length) lines.push(`Open items: ${f.openTasks.join(" · ")}`);
  const noShows = f.timeline.filter((e) => e.type === "no_show").length;
  if (noShows) lines.push(`Heads-up: ${noShows} no-show${noShows === 1 ? "" : "s"} before.`);
  if (f.booking.seriesIndex && f.booking.seriesCount)
    lines.push(`Session ${f.booking.seriesIndex} of ${f.booking.seriesCount}.`);
  return lines.join("\n");
}

/** What the model sees: same facts, formatted for reading. */
export function factsForModel(f: BriefFacts, now = new Date()): string {
  const rows = [
    `Meeting: ${f.eventTitle} on ${fmtDateTime(f.booking.startAt, f.tz)}`,
    `Contact: ${f.contact.name || "(no name)"} <${f.contact.email}>${f.contact.company ? `, ${f.contact.company}` : ""}`,
    `Stage: ${f.contact.stage}; tags: ${f.contact.tags.join(", ") || "none"}; contact since ${fmtDateTime(f.contact.createdAt, f.tz)}; ${f.contact.bookingsCount} bookings`,
    f.contact.notes ? `Host notes: ${f.contact.notes}` : "",
    f.questions.length
      ? `Booking answers:\n${f.questions.map((q) => `- ${q.label}: ${q.answer}`).join("\n")}`
      : "",
    f.booking.notes ? `Attendee note: ${f.booking.notes}` : "",
    f.openTasks?.length ? `Open action items:\n${f.openTasks.map((t) => `- ${t}`).join("\n")}` : "",
    f.previousMeetings.length
      ? `Previous meetings:\n${f.previousMeetings.map((m) => `- ${fmtDateTime(m.startAt, f.tz)} ${m.title} (${m.status})`).join("\n")}`
      : "No previous meetings.",
    f.timeline.length
      ? `Timeline (newest first):\n${f.timeline
          .slice(0, 30)
          .map((e) => `- ${daysAgo(e.createdAt, now)}d ago [${e.type}] ${e.summary}`)
          .join("\n")}`
      : "",
  ];
  return rows.filter(Boolean).join("\n\n");
}

export const BRIEF_SYSTEM = `You write a pre-meeting briefing for a busy consultant. Be concrete and short: at most 120 words, plain text, no markdown headings.
Cover, in this order and only when known: who they are and their stage; what happened before (last meeting, open threads, promises, no-shows); what they want from this meeting (from their answers); one or two things to prepare or ask. Never invent facts; if history is thin, say it is a first conversation.`;
