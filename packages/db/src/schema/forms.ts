import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { AnswerValue, FormSchema } from "@bookly/forms";
import { users } from "./auth";
import { applications } from "./hiring";
import { bookings, contacts, routingForms } from "./scheduling";
import { workspaces } from "./workspaces";

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

/* ---------------- Forms (ADR 0004) ---------------- */

export type FormPurpose = "booking" | "routing" | "application" | "stage" | "reference" | "survey";

/** A form: booking questions, a routing questionnaire, an application, a stage or reference form. */
export const forms = pgTable(
  "forms",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    purpose: text("purpose").$type<FormPurpose>().notNull(),
    /** Listed in the forms library and reusable; false = owned inline by one event type. */
    shared: boolean("shared").notNull().default(true),
    /** The version new responses use; null until first publish. */
    publishedVersionId: text("published_version_id"),
    /** The working copy the builder edits (unpublished changes). */
    draft: jsonb("draft").$type<FormSchema>(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("forms_ws_purpose_idx").on(t.workspaceId, t.purpose)],
);

/** Immutable once written: responses point at the version they answered. */
export const formVersions = pgTable(
  "form_versions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    schema: jsonb("schema").$type<FormSchema>().notNull(),
    publishedBy: text("published_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("form_versions_form_version_idx").on(t.formId, t.version)],
);

export const formResponses = pgTable(
  "form_responses",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "restrict" }),
    formVersionId: text("form_version_id")
      .notNull()
      .references(() => formVersions.id, { onDelete: "restrict" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    bookingId: text("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    /** Hiring (ADR 0003): the application this response belongs to. */
    applicationId: text("application_id").references((): AnyPgColumn => applications.id, {
      onDelete: "cascade",
    }),
    /** 1 for the first submission; each candidate edit inserts a new row with revision + 1. */
    revision: integer("revision").notNull().default(1),
    /** The revision this one replaced; earlier ones stay readable to coordinators until retention. */
    supersedesId: text("supersedes_id").references((): AnyPgColumn => formResponses.id, {
      onDelete: "set null",
    }),
    routingFormId: text("routing_form_id").references(() => routingForms.id, {
      onDelete: "set null",
    }),
    /** Normal-sensitivity answers only, keyed by field id. */
    answers: jsonb("answers").$type<Record<string, AnswerValue>>().notNull().default({}),
    status: text("status").$type<"draft" | "submitted">().notNull().default("submitted"),
    /** SHA-256 of the save-and-resume token (long applications). */
    resumeTokenHash: text("resume_token_hash"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("form_responses_ws_form_idx").on(t.workspaceId, t.formId, t.submittedAt),
    index("form_responses_contact_idx").on(t.contactId),
    index("form_responses_booking_idx").on(t.bookingId),
    index("form_responses_application_idx").on(t.applicationId),
    uniqueIndex("form_responses_resume_idx").on(t.resumeTokenHash),
    index("form_responses_supersedes_idx").on(t.supersedesId),
  ],
);

export type Form = typeof forms.$inferSelect;
export type FormVersion = typeof formVersions.$inferSelect;
export type FormResponse = typeof formResponses.$inferSelect;
