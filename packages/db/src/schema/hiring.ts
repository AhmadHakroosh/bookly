import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { formResponses, forms } from "./forms";
import { pipelineStages, pipelines } from "./pipelines";
import { bookings, contacts } from "./scheduling";
import { workspaces } from "./workspaces";

/*
 * Hiring (ADR 0003, access tables from ADR 0005): opportunities with their intake rounds
 * (cohorts), applications, reviews, decisions and the candidate's data requests. Candidates are
 * contacts and interviews are bookings: nothing here duplicates scheduling. Sensitive answers live
 * in `application_sensitive`, read and written only through `server/hiring/sensitive.ts`. No
 * column holds an AI score, rank or recommendation (canon X1).
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ---------------- Opportunities and cohorts ---------------- */

export const OPPORTUNITY_TYPES = [
  "job",
  "cohort",
  "fellowship",
  "internship",
  "program",
  "gig",
  "admissions",
  "volunteer",
  "grant",
  "custom",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export type OpportunityStatus = "draft" | "open" | "closed" | "archived";

export type OpportunitySettings = {
  /** Shown on the application page; required before the opportunity can open. */
  privacyNotice?: { url?: string; text?: string; version: string };
  /**
   * Days after the cohort's last final decision before applications of people not admitted are
   * deleted. Defaults by type (canon X4): 365 for jobs and internships, 183 otherwise; 30–730.
   */
  retentionDays?: number;
  /** Minutes after `closes_at` during which drafts started before close can still be sent. */
  closeGraceMinutes?: number;
  /** Ask for accommodations on the application page (kept in application_sensitive). */
  accommodations?: boolean;
  /** Voluntary demographic survey after submit (kept in application_sensitive). */
  demographicSurvey?: { formId: string } | null;
  /** What candidates see for each stage on their status page ("In review" by default). */
  statusLabels?: Record<string, string>;
  /** "Access limited to assigned reviewers" (ADR 0005). Default true. */
  assignedReviewersOnly?: boolean;
  /** IANA zone the dates are shown in; the workspace's when unset. */
  timezone?: string;
  /** Candidate emails: the "from" name and where replies go. */
  senderName?: string;
  replyTo?: string;
  /** The setup template it started from ("cohort", "internship"…, "blank" or "clone"). */
  template?: string;
};

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").$type<OpportunityType>().notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    status: text("status").$type<OpportunityStatus>().notNull().default("draft"),
    summary: text("summary"),
    /** Markdown, rendered on the application page. */
    description: text("description"),
    location: text("location"),
    /** One pipeline per opportunity, copied from a template at creation (ADR 0001). */
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "restrict" }),
    /** The application form (ADR 0004, purpose `application`). */
    formId: text("form_id").references(() => forms.id, { onDelete: "set null" }),
    settings: jsonb("settings").$type<OpportunitySettings>().notNull().default({}),
    /** Set by "Copy a previous opportunity" and "Copy for a new cycle". */
    clonedFromId: text("cloned_from_id").references((): AnyPgColumn => opportunities.id, {
      onDelete: "set null",
    }),
    /** First published; a draft has none. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("opportunities_ws_slug_idx").on(t.workspaceId, t.slug),
    uniqueIndex("opportunities_pipeline_idx").on(t.pipelineId),
    index("opportunities_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

/** An intake round. Every opportunity has at least one; a job has one rolling cohort. */
export const opportunityCohorts = pgTable(
  "opportunity_cohorts",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The round created with the opportunity; hidden in the UI while it is the only one. */
    isDefault: boolean("is_default").notNull().default(false),
    /** Application window; null = open while the opportunity is open. */
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    /** Program dates. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** "Decisions by": the date applicants are promised an answer. Required to publish. */
    decidesBy: timestamp("decides_by", { withTimezone: true }),
    /** Seats; null = no cap. Advisory: offering past it asks for confirmation. */
    capacity: integer("capacity"),
    /** "Close cycle": every applicant has a released final outcome; starts the retention clock. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("opportunity_cohorts_opp_idx").on(t.opportunityId, t.position),
    index("opportunity_cohorts_ws_idx").on(t.workspaceId, t.closesAt),
  ],
);

/* ---------------- Applications ---------------- */

export type ApplicationState = "draft" | "active" | "withdrawn" | "closed";
export type ApplicationOutcome = "admitted" | "hired" | "waitlisted" | "rejected";

/** A flag for a person to look at (canon X2): it never rejects anyone on its own. */
export type ApplicationFlag = {
  kind: "requirement";
  /** The requirement as the coordinator wrote it ("Enrolled in a US university"). */
  requirement: string;
  /** The Routing rule that raised it. */
  ruleId: string;
  at: string;
};

/** One person applying to one cohort of one opportunity. */
export const applications = pgTable(
  "applications",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => opportunityCohorts.id, { onDelete: "restrict" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    stageId: text("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }),
    /** draft = started, not sent; active = in the pipeline. */
    state: text("state").$type<ApplicationState>().notNull().default("draft"),
    /** From the latest final decision (denormalised for filters and the status page). */
    outcome: text("outcome").$type<ApplicationOutcome>(),
    /** The latest revision of the application form's response; earlier ones chain back. */
    formResponseId: text("form_response_id").references((): AnyPgColumn => formResponses.id, {
      onDelete: "set null",
    }),
    /** direct | referral | import | api | link:<campaign> */
    source: text("source").notNull().default("direct"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** "Doesn't meet: <requirement>" flags raised by Routing; cleared by a person. */
    flags: jsonb("flags").$type<ApplicationFlag[]>().notNull().default([]),
    /** Set by people on a Waitlist stage (audited); null elsewhere. */
    waitlistPosition: integer("waitlist_position"),
    /** SHA-256 of the candidate's status-page token (a link, no account). */
    statusTokenHash: text("status_token_hash"),
    /**
     * The same token, encrypted, so later emails (stage messages, decisions) can carry the link
     * the candidate already has instead of replacing it. Rotated together with the hash.
     */
    statusTokenEnc: text("status_token_enc"),
    /** The status link works until then: 30 days after the last email that carried it. */
    statusTokenExpiresAt: timestamp("status_token_expires_at", { withTimezone: true }),
    /** The privacy notice version the candidate agreed to when they submitted. */
    privacyVersion: text("privacy_version"),
    privacyConsentAt: timestamp("privacy_consent_at", { withTimezone: true }),
    /** "Keep my details for future opportunities": optional, off by default. */
    futureContact: boolean("future_contact").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set by the retention job; the row is deleted when this passes. */
    deleteAfter: timestamp("delete_after", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_cohort_contact_idx").on(t.cohortId, t.contactId),
    index("applications_board_idx").on(
      t.workspaceId,
      t.opportunityId,
      t.stageId,
      t.stageEnteredAt,
      t.id,
    ),
    index("applications_ws_contact_idx").on(t.workspaceId, t.contactId),
    uniqueIndex("applications_status_token_idx").on(t.statusTokenHash),
    index("applications_delete_after_idx").on(t.deleteAfter),
  ],
);

/**
 * Sensitive, opt-in data about an applicant: never joined by list, board, review, export,
 * search, webhook or AI code. Read and written only through server/hiring/sensitive.ts (a guard
 * test fails the build otherwise). Both fields are encrypted at rest.
 */
export const applicationSensitive = pgTable("application_sensitive", {
  applicationId: text("application_id")
    .primaryKey()
    .references(() => applications.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Accommodation request, encrypted; coordinators only (ADR 0005). */
  accommodations: text("accommodations"),
  /** Voluntary survey answers, encrypted JSON; never shown per person in core. */
  demographics: text("demographics"),
  consentVersion: text("consent_version"),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  ...timestamps,
});

/* ---------------- Reviews ---------------- */

export type ScorecardCriterion = {
  id: string;
  label: string;
  description?: string;
  scale:
    | { type: "rating"; min: number; max: number; labels?: string[] }
    | { type: "yes_no" }
    | { type: "text" };
  required: boolean;
};

/** Reusable review criteria. Shown as distributions only: no averages or totals (canon X1). */
export const scorecards = pgTable(
  "scorecards",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    criteria: jsonb("criteria").$type<ScorecardCriterion[]>().notNull().default([]),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("scorecards_ws_idx").on(t.workspaceId)],
);

/** Who reviews which application at which stage. Made by the Reviews module or by hand. */
export const reviewAssignments = pgTable(
  "review_assignments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** review (scorecard) | interview (feedback after a booking). */
    kind: text("kind").$type<"review" | "interview">().notNull().default("review"),
    bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    status: text("status")
      .$type<"pending" | "submitted" | "declined">()
      .notNull()
      .default("pending"),
    /** A conflict of interest the reviewer declared; the coordinator reassigns. */
    declineReason: text("decline_reason"),
    assignedBy: text("assigned_by"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_assignments_unique_idx").on(
      t.applicationId,
      t.stageId,
      t.reviewerUserId,
      t.kind,
    ),
    index("review_assignments_reviewer_idx").on(t.workspaceId, t.reviewerUserId, t.status, t.dueAt),
  ],
);

export type ReviewRecommendation = "advance" | "hold" | "decline" | "no_opinion";

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => reviewAssignments.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The criteria when the review started, so later scorecard edits never change it. */
    criteria: jsonb("criteria").$type<ScorecardCriterion[]>().notNull(),
    ratings: jsonb("ratings")
      .$type<Record<string, number | boolean | string>>()
      .notNull()
      .default({}),
    /** The reviewer's own words; a human opinion, never generated. */
    notes: text("notes"),
    recommendation: text("recommendation").$type<ReviewRecommendation>(),
    status: text("status").$type<"draft" | "submitted">().notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Edits after submit are an audited amendment. */
    amendedAt: timestamp("amended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reviews_assignment_idx").on(t.assignmentId),
    index("reviews_application_idx").on(t.applicationId, t.stageId, t.status),
  ],
);

/* ---------------- Decisions ---------------- */

export type DecisionOutcome =
  "advance" | "hold" | "waitlist" | "reject" | "offer" | "admit" | "hire";

/** A cohort's decision round, usually decided in a meeting and released together. */
export const decisionBatches = pgTable(
  "decision_batches",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").references(() => opportunityCohorts.id, { onDelete: "set null" }),
    stageId: text("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: text("status").$type<"draft" | "finalized" | "released">().notNull().default("draft"),
    /** The decision meeting: a booking, never a separate calendar object. */
    meetingBookingId: text("meeting_booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    /** Candidate emails go out together at this time; null = when finalised. */
    releaseAt: timestamp("release_at", { withTimezone: true }),
    /** Tell waitlisted candidates their position. Off by default. */
    revealWaitlistPosition: boolean("reveal_waitlist_position").notNull().default(false),
    finalizedBy: text("finalized_by").references(() => users.id, { onDelete: "set null" }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("decision_batches_opp_idx").on(t.opportunityId, t.status)],
);

/** Append-only; the latest final decision per application is the current one. Always a person's. */
export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stageId: text("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    outcome: text("outcome").$type<DecisionOutcome>().notNull(),
    /** Where the application moves when the decision is final. */
    toStageId: text("to_stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    /** proposed = in a batch not finalised yet; final = applied. */
    status: text("status").$type<"proposed" | "final" | "withdrawn">().notNull().default("final"),
    /** bulk_requirement = "Not selected: doesn't meet requirement", the requirement in `note`. */
    mode: text("mode").$type<"single" | "batch" | "bulk_requirement">().notNull().default("single"),
    batchId: text("batch_id").references(() => decisionBatches.id, { onDelete: "set null" }),
    /** Always a person (canon: humans decide). */
    decidedBy: text("decided_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    /** Internal reason; never sent to the candidate. */
    note: text("note"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decisions_application_idx").on(t.applicationId, t.decidedAt),
    index("decisions_batch_idx").on(t.batchId),
  ],
);

/* ---------------- Candidates' data requests ---------------- */

/**
 * A candidate's deletion request. The application is withdrawn at once; the data goes when a
 * coordinator deletes it, or by itself at `due_at` unless a legal hold is recorded. The row keeps
 * only the email, so it stands as the record that the request was honoured.
 */
export const dataRequests = pgTable(
  "data_requests",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Plain ids: the rows they name are deleted by the request itself. */
    applicationId: text("application_id"),
    opportunityId: text("opportunity_id"),
    contactEmail: text("contact_email").notNull(),
    /** The status link's hash, so it can still say "This application has been deleted." */
    statusTokenHash: text("status_token_hash"),
    kind: text("kind").$type<"deletion">().notNull().default("deletion"),
    status: text("status").$type<"open" | "held" | "completed">().notNull().default("open"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    /** requested_at + 30 days, the legal deadline shown to coordinators. */
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    /** Reminders already sent to coordinators: "d7", "d21". */
    remindersSent: jsonb("reminders_sent").$type<string[]>().notNull().default([]),
    holdReason: text("hold_reason"),
    heldBy: text("held_by").references(() => users.id, { onDelete: "set null" }),
    heldAt: timestamp("held_at", { withTimezone: true }),
    /** null with status completed = deleted automatically at due_at. */
    completedBy: text("completed_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    receiptSentAt: timestamp("receipt_sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("data_requests_queue_idx").on(t.workspaceId, t.status, t.dueAt),
    index("data_requests_due_idx").on(t.status, t.dueAt),
  ],
);

/* ---------------- Access (ADR 0005) ---------------- */

/** A person's role on one opportunity's team. Collaborators are never coordinators. */
export type OpportunityRole = "coordinator" | "reviewer" | "interviewer" | "viewer";

export const opportunityMembers = pgTable(
  "opportunity_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<OpportunityRole>().notNull(),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.opportunityId, t.userId] }),
    index("opportunity_members_user_idx").on(t.workspaceId, t.userId),
  ],
);

/**
 * Why a user may open one application beyond their opportunity role: kept by the code that
 * creates the reason (a review assignment, an interview, a manual share) and removed with it.
 */
export const applicationAccess = pgTable(
  "application_access",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").$type<"review" | "interview" | "shared">().notNull(),
    /** The assignment or booking that granted it, so revoking that removes exactly this grant. */
    sourceId: text("source_id"),
    grantedBy: text("granted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.applicationId, t.userId, t.reason] }),
    index("application_access_user_idx").on(t.workspaceId, t.userId),
  ],
);

/**
 * Someone invited by email to an opportunity's team before they have an account in the
 * workspace. The workspace invitation (as a collaborator) goes out when the opportunity is
 * published, or at once on a live one; accepting it turns this row into a team role.
 */
export const opportunityInvites = pgTable(
  "opportunity_invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    /** Lower-cased. */
    email: text("email").notNull(),
    /** Never coordinator: people from outside join as collaborators (ADR 0005). */
    role: text("role").$type<Exclude<OpportunityRole, "coordinator">>().notNull(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    /** The workspace invitation, once sent. */
    invitationId: text("invitation_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("opportunity_invites_opp_email_idx").on(t.opportunityId, t.email),
    index("opportunity_invites_ws_email_idx").on(t.workspaceId, t.email),
  ],
);

export type Opportunity = typeof opportunities.$inferSelect;
export type Cohort = typeof opportunityCohorts.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Scorecard = typeof scorecards.$inferSelect;
export type ReviewAssignment = typeof reviewAssignments.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type DecisionBatch = typeof decisionBatches.$inferSelect;
export type DataRequest = typeof dataRequests.$inferSelect;
export type OpportunityMember = typeof opportunityMembers.$inferSelect;
export type ApplicationAccess = typeof applicationAccess.$inferSelect;
export type OpportunityInvite = typeof opportunityInvites.$inferSelect;
