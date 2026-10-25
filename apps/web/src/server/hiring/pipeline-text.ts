import type { ApplicationFlag, StageCategory } from "@bookly/db/schema";
import type { StageModuleConfigs } from "../pipelines/modules";
import { isFinal } from "./setup-text";

/*
 * The hiring board without the database (hiring.png, concept-fidelity.md §5, review.md and
 * decisions.md card states): what each card says next, the advisory exit checks a stage's
 * modules raise before a move (ADR 0002: never blocking in 1.0, overriding is audited), what
 * goes in Needs attention, and which moves the board makes (outcomes are decisions, H6).
 */

export type ReviewCounts = {
  total: number;
  submitted: number;
  overdue: number;
  mine: "pending" | "submitted" | null;
};

export type CardFacts = {
  flags: ApplicationFlag[];
  reviews: ReviewCounts;
  /** The next interview for this application, if one is booked. */
  interviewAt: Date | null;
  /** The stage has Scheduling on and nothing is booked yet. */
  awaitingScheduling: boolean;
};

export type CardLine = {
  tone: "neutral" | "warning";
  icon: "flag" | "calendar" | "review" | "clock";
  text: string;
};

const dayTime = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(d);

/**
 * The line under a card's name, the one thing that matters next (hiring.png): a requirement flag
 * first (a person has to look), then a booked interview, missing feedback, review progress, or
 * an interview still to be booked.
 */
export function cardLine(f: CardFacts, timeZone: string, now = new Date()): CardLine | null {
  if (f.flags.length)
    return { tone: "warning", icon: "flag", text: `Doesn't meet: ${f.flags[0]!.requirement}` };
  if (f.interviewAt && f.interviewAt > now)
    return {
      tone: "neutral",
      icon: "calendar",
      text: `Interview ${dayTime(f.interviewAt, timeZone)}`,
    };
  const r = f.reviews;
  if (r.overdue > 0) return { tone: "warning", icon: "review", text: "Feedback missing" };
  if (r.total > 0) {
    if (r.submitted === r.total)
      return { tone: "neutral", icon: "review", text: "All reviews submitted" };
    if (r.submitted > 0)
      return {
        tone: "neutral",
        icon: "review",
        text: `${r.submitted} of ${r.total} reviews submitted`,
      };
    return {
      tone: "neutral",
      icon: "review",
      text: r.total === 1 ? "Review assigned" : `${r.total} reviews assigned`,
    };
  }
  if (f.awaitingScheduling) return { tone: "neutral", icon: "clock", text: "Awaiting scheduling" };
  return null;
}

/* ---------------- Exit checks (ADR 0002) ---------------- */

export type ExitCheck = { id: "reviews_missing"; text: string };

/** What a stage's modules say is unfinished before an application leaves it. Advisory only. */
export function exitChecks(
  modules: StageModuleConfigs,
  reviews: Pick<ReviewCounts, "total" | "submitted">,
): ExitCheck[] {
  const out: ExitCheck[] = [];
  if (modules.reviews && modules.reviews.enabled !== false) {
    const expected = Math.max(reviews.total, modules.reviews.reviewersPerApplication);
    const missing = expected - reviews.submitted;
    if (missing > 0)
      out.push({ id: "reviews_missing", text: `${missing} of ${expected} reviews missing` });
  }
  return out;
}

/** Why the board won't make a move, or null: outcomes are recorded as decisions (H6). */
export function moveProblem(to: { category: StageCategory; name: string } | null): string | null {
  if (!to) return "That stage is gone.";
  if (isFinal(to.category))
    return `${to.name} is an outcome. People reach it when someone records a decision, not by moving a card.`;
  return null;
}

/** Why an application can't leave its stage by a move, or null: a decision put it there (H6). */
export function leaveProblem(
  from: { category: StageCategory; name: string } | null,
): string | null {
  if (from && isFinal(from.category))
    return `${from.name} is a recorded decision. Change the decision to move them.`;
  return null;
}

/* ---------------- Needs attention ---------------- */

export type AttentionFacts = {
  id: string;
  stageId: string | null;
  stageEnteredAt: Date | null;
  facts: CardFacts;
};

export type Attention = {
  id: "feedback" | "scheduling" | "flagged" | "waiting";
  title: string;
  detail: string;
  filter: string;
};

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/**
 * The strip under the board (hiring.png): feedback due, people waiting for an interview time,
 * requirement flags for a person to decide on, and anyone sitting in a stage longer than its
 * "needs attention" setting.
 */
export function attention(
  apps: AttentionFacts[],
  stages: { id: string; name: string; attentionAfterDays: number | null }[],
  now = new Date(),
): Attention[] {
  const out: Attention[] = [];
  const overdue = apps.filter((a) => a.facts.reviews.overdue > 0).length;
  if (overdue)
    out.push({
      id: "feedback",
      title: "Feedback missing",
      detail: `${n(overdue, "candidate has", "candidates have")} overdue reviews`,
      filter: "feedback",
    });
  const awaiting = apps.filter((a) => a.facts.awaitingScheduling).length;
  if (awaiting)
    out.push({
      id: "scheduling",
      title: `${n(awaiting, "candidate", "candidates")} awaiting scheduling`,
      detail: "Their interview stage sends a booking link; nothing is booked yet",
      filter: "scheduling",
    });
  const flagged = apps.filter((a) => a.facts.flags.length).length;
  if (flagged)
    out.push({
      id: "flagged",
      title: `${n(flagged, "application", "applications")} flagged`,
      detail: "A requirement isn't met. A person decides what happens next",
      filter: "flagged",
    });
  const limits = new Map(stages.map((s) => [s.id, s]));
  const waiting = apps.filter((a) => {
    const s = a.stageId ? limits.get(a.stageId) : null;
    return (
      s?.attentionAfterDays &&
      a.stageEnteredAt &&
      now.getTime() - a.stageEnteredAt.getTime() > s.attentionAfterDays * 86_400_000
    );
  }).length;
  if (waiting)
    out.push({
      id: "waiting",
      title: `${n(waiting, "candidate", "candidates")} waiting longer than planned`,
      detail: "They've been in their stage past its time limit",
      filter: "waiting",
    });
  return out;
}

/** "MC" for "Maya Chen"; the email's first letter when there is no name. */
export function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return (email[0] ?? "?").toUpperCase();
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}
