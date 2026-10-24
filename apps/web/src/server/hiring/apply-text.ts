import type { Field, FormSchema } from "@bookly/forms";
import type { ApplicationState, OpportunityStatus, StageCategory } from "@bookly/db/schema";
import { isFinal, type SetupStage } from "./setup-text";

/*
 * The candidate's side of hiring without the database (planning/v2/ux/application-page.md):
 * every string a candidate reads (one catalogue, so translations slot in when the i18n
 * foundation lands), whether an opportunity takes applications right now, "What happens next"
 * from the pipeline and dates, the status card, and the small helpers both pages share.
 */

/* ---------------- Copy ---------------- */

export const COPY = {
  start: "Start application",
  saveLater: "Save and finish later",
  submit: "Submit application",
  sixteen: "You must be 16 or older to apply.",
  whoSees:
    "Only the people reviewing this round see your application. People who review it can't see each other's assessments until they've given their own. Decisions are made by people, not software.",
  adjustmentsNote: "You can ask for adjustments in the form.",
  adjustmentsQuestion: "Do you need any adjustments to apply or to take part in interviews?",
  adjustmentsHelp:
    "For example extra time, captions, or a different interview format. Only the program coordinators see this. It isn't shared with reviewers and doesn't affect the decision.",
  consent: (ws: string) =>
    `I've read the privacy notice and agree to ${ws} processing my application as described.`,
  consentFuture: (ws: string) => `Keep my details so ${ws} can tell me about future opportunities.`,
  received: "Application received",
  receivedBody: (title: string, email: string, decidesBy: string | null) =>
    `Thank you for applying to ${title}. We've sent a confirmation to ${email}. We'll email you at each step${decidesBy ? `, and decisions are expected by ${decidesBy}` : ""}.`,
  statusButton: "Check your status anytime",
  already: (title: string, email: string) =>
    `You've already applied to ${title} with this email. We've sent your status link to ${email}.`,
  resumeSent: (email: string) =>
    `We've sent a link to ${email}. It works on any device until applications close.`,
  scheduled: (when: string) => `Applications open on ${when}.`,
  closed: (title: string, closed: string, decides: string | null) =>
    `Applications for ${title} closed on ${closed}.${decides ? ` Decisions are expected by ${decides}.` : ""}`,
  grace: (until: string) =>
    `Applications have closed. Because you started before the deadline, you can still submit until ${until}.`,
  unavailable: "This opportunity isn't available.",
  previewBanner: "Preview — not live. Nothing you submit here is kept.",
  nothingToDo: "Nothing to do right now.",
  editButton: "Edit my application",
  editClosed: "Applications have closed, so your answers stand as you sent them.",
  editLocked:
    "Your application is being reviewed, so it can't be changed. If something important is wrong, write to the team.",
  withdrawTitle: "Withdraw your application?",
  withdrawBody:
    "The team will stop reviewing it and any interviews will be cancelled. You can apply again while applications are open.",
  deleteTitle: "Delete your application?",
  deleteBody:
    "This withdraws your application and deletes your answers and documents within 30 days. We keep a minimal record that you applied and withdrew.",
  deletionRequested: (on: string, by: string) =>
    `Deletion requested on ${on}. We'll delete your application by ${by} and email you when it's done.`,
  legalHold: (ws: string, reason: string) =>
    `${ws} has to keep your application for now: ${reason}. It will be deleted when that no longer applies.`,
  deleted: "This application has been deleted.",
  expired: "This link has expired.",
  recoverHelp: "Enter the email you applied with and we'll send a new link.",
  recoverDone: "If there's an application for that email, a new link is on its way.",
  recoverLimited: "You've asked for several links. Check your inbox, or try again in an hour.",
  errorSummary: (n: number) => `Check ${n} answer${n === 1 ? "" : "s"} before you submit`,
} as const;

/** Candidate emails: subject lines from the spec's email set. */
export const EMAIL = {
  resume: (t: string) => `Finish your application to ${t}`,
  received: (t: string) => `We've received your application to ${t}`,
  updated: (t: string) => `We've updated your application to ${t}`,
  withdrawn: (t: string) => `You've withdrawn your application to ${t}`,
  deletionReceipt: (t: string, by: string) => `We'll delete your application to ${t} by ${by}`,
  legalHold: (t: string) => `About your deletion request for ${t}`,
  deleted: (t: string) => `Your application to ${t} has been deleted`,
  link: (t: string) => `Your link for ${t}`,
} as const;

/* ---------------- Dates ---------------- */

export const fmtDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(d);

export const fmtDayTime = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
    timeZoneName: "short",
  }).format(d);

/** "m•••@uni.edu": enough for the candidate to recognise, nothing for anyone else. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "your email";
  return `${user[0]}•••@${domain}`;
}

/* ---------------- The application window ---------------- */

export type Window = "scheduled" | "open" | "grace" | "closed";

/**
 * Whether an opportunity takes applications now. After it closes, a draft started before the
 * close can still be submitted for the grace period (canon Q4: 2 hours by default, 0–24).
 */
export function applicationWindow(input: {
  status: OpportunityStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  graceMinutes: number;
  /** When the candidate's draft was started, if they have one. */
  draftStartedAt?: Date | null;
  now?: Date;
}): Window {
  const now = input.now ?? new Date();
  if (input.status === "draft" || input.status === "archived") return "closed";
  if (input.opensAt && input.opensAt > now) return "scheduled";
  const closedAt =
    input.status === "closed"
      ? input.closesAt && input.closesAt < now
        ? input.closesAt
        : now
      : input.closesAt;
  if (!closedAt || closedAt > now) return input.status === "closed" ? "closed" : "open";
  const graceEnd = new Date(closedAt.getTime() + input.graceMinutes * 60_000);
  if (input.draftStartedAt && input.draftStartedAt < closedAt && now < graceEnd) return "grace";
  return "closed";
}

/** The end of the grace period for a draft started before the close, or null. */
export const graceEnds = (closesAt: Date | null, graceMinutes: number) =>
  closesAt ? new Date(closesAt.getTime() + graceMinutes * 60_000) : null;

/* ---------------- The form ---------------- */

/** The answers that identify the applicant: the first required email and name questions. */
export function identityFields(schema: FormSchema): { email: Field | null; name: Field | null } {
  const email =
    schema.fields.find((f) => f.type === "email" && f.id === "email") ??
    schema.fields.find((f) => f.type === "email") ??
    null;
  const name =
    schema.fields.find((f) => f.type === "short_text" && f.id === "name") ??
    schema.fields.find((f) => f.type === "short_text" && /name/i.test(f.label)) ??
    null;
  return { email, name };
}

const MINUTES: Partial<Record<Field["type"], number>> = {
  long_text: 6,
  file: 2,
  heading: 0,
  paragraph: 0.5,
};

/** "Takes about 25 minutes": a rough guess from the questions, rounded to 5. */
export function minutesToComplete(schema: FormSchema): number {
  const m = schema.fields.reduce((n, f) => n + (MINUTES[f.type] ?? 0.5), 0) + 2;
  return Math.max(5, Math.round(m / 5) * 5);
}

/* ---------------- What happens next ---------------- */

export type NextStep = { title: string; body: string };

/**
 * Up to six steps from the pipeline and dates, as the spec's cohort default reads: apply by the
 * deadline, review (with its window), interviews (if a stage schedules them), decisions by the
 * promised date. Stages without reviews or interviews add nothing a candidate would notice.
 */
export function whatHappensNext(
  stages: Pick<SetupStage, "category" | "isEntry" | "modules">[],
  dates: { closesAt: Date | null; decidesBy: Date | null; timezone: string },
): NextStep[] {
  const tz = dates.timezone;
  const out: NextStep[] = [
    {
      title: dates.closesAt ? `Apply by ${fmtDay(dates.closesAt, tz)}.` : "Apply.",
      body: "You'll get an email confirming we have your application.",
    },
  ];
  let cursor = dates.closesAt ? new Date(dates.closesAt.getTime() + 86_400_000) : null;
  const range = (days: number) => {
    if (!cursor) return "";
    const from = cursor;
    const to = new Date(from.getTime() + Math.max(days - 1, 0) * 86_400_000);
    cursor = new Date(to.getTime() + 86_400_000);
    return days > 1 ? `, ${fmtDay(from, tz)}–${fmtDay(to, tz)}` : `, ${fmtDay(from, tz)}`;
  };
  for (const s of stages) {
    if (s.isEntry || isFinal(s.category)) continue;
    const reviews = s.modules.reviews && s.modules.reviews.enabled !== false;
    const interviews = s.modules.scheduling && s.modules.scheduling.enabled !== false;
    if (interviews)
      out.push({
        title: `Interviews${range(s.modules.reviews?.dueDays ?? 7)}.`,
        body: "If you're invited, you'll choose a time that suits you.",
      });
    else if (reviews)
      out.push({
        title: `Review${range(s.modules.reviews?.dueDays ?? 7)}.`,
        body: "Several people on our team read each application on their own.",
      });
  }
  out.push({
    title: dates.decidesBy ? `Decisions by ${fmtDay(dates.decidesBy, tz)}.` : "Decisions.",
    body: "Everyone who applies hears from us, whatever the outcome.",
  });
  return [...out.slice(0, 5), ...(out.length > 5 ? [out.at(-1)!] : [])].slice(0, 6);
}

/* ---------------- The status page ---------------- */

/** What the status card says: the candidate-facing label and one sentence (spec copy). */
export function statusCard(input: {
  state: ApplicationState;
  label: string;
  category: StageCategory;
  isEntry: boolean;
  isWaitlist: boolean;
  decidesBy: string | null;
  withdrawnOn: string | null;
}): { title: string; body: string } {
  const by = input.decidesBy ? ` We'll update you by ${input.decidesBy}.` : "";
  if (input.state === "withdrawn")
    return {
      title: "Withdrawn",
      body: input.withdrawnOn
        ? `You withdrew your application on ${input.withdrawnOn}.`
        : "You withdrew your application.",
    };
  if (input.isEntry)
    return { title: input.label, body: `We have your application. ${COPY.nothingToDo}${by}` };
  switch (input.category) {
    case "won":
      return {
        title: input.label,
        body: "Congratulations. We'll be in touch with your next steps.",
      };
    case "lost":
      return {
        title: input.label,
        body: "We weren't able to offer you a place this time. Thank you for applying.",
      };
    case "hold":
      return input.isWaitlist
        ? { title: input.label, body: "We'll let you know whether a place opens up." }
        : { title: input.label, body: `People on our team are reading your application.${by}` };
    default:
      return { title: input.label, body: `People on our team are reading your application.${by}` };
  }
}

/** A candidate can edit a submitted application while it is new: entry stage, no review in. */
export const mayEdit = (input: {
  state: ApplicationState;
  isEntry: boolean;
  submittedReviews: number;
  window: Window;
}) =>
  input.state === "active" &&
  input.isEntry &&
  input.submittedReviews === 0 &&
  // After the deadline everyone's answers stand as they were sent.
  (input.window === "open" || input.window === "grace");

/** Days a deletion request may stay open before Bookly deletes the application itself. */
export const DELETION_DAYS = 30;
/** Status links last this long after the last email that carried one. */
export const LINK_DAYS = 30;

/** Whole days until a deadline, never below zero ("23 days left"). */
export const daysUntil = (due: Date, now = new Date()) =>
  Math.max(0, Math.ceil((due.getTime() - now.getTime()) / 86_400_000));
