import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
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

/* ---------------- Host profiles ---------------- */

/** Public booking profile of a workspace member: /<username>. */
export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("UTC"),
    /** E.164 phone for SMS / WhatsApp notifications to the host. */
    phone: text("phone"),
    notifications: jsonb("notifications").$type<HostNotifications>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("profiles_ws_username_idx").on(t.workspaceId, t.username),
    uniqueIndex("profiles_ws_user_idx").on(t.workspaceId, t.userId),
  ],
);

/** How and when a host wants to be pinged (email is always on). */
export type HostNotifications = {
  /** Text channel for the phone above. */
  channel?: "none" | "sms" | "whatsapp";
  slackWebhookUrl?: string | null;
  onBooking?: boolean;
  onCancel?: boolean;
  onJoin?: boolean;
  reminder1h?: boolean;
};

/* ---------------- Availability ---------------- */

export const schedules = pgTable(
  "schedules",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Working hours"),
    timezone: text("timezone").notNull().default("UTC"),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("schedules_ws_user_idx").on(t.workspaceId, t.userId)],
);

/** Weekly rule: available on `weekday` (0 = Sunday) from startMin to endMin (minutes from midnight, schedule tz). */
export const scheduleRules = pgTable(
  "schedule_rules",
  {
    id: id(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
  },
  (t) => [index("schedule_rules_schedule_idx").on(t.scheduleId)],
);

/** Date override: custom hours for `date` (YYYY-MM-DD in schedule tz); no rows with hours = unavailable that day. */
export const scheduleOverrides = pgTable(
  "schedule_overrides",
  {
    id: id(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    /** null start/end = blocked all day */
    startMin: integer("start_min"),
    endMin: integer("end_min"),
  },
  (t) => [index("schedule_overrides_schedule_date_idx").on(t.scheduleId, t.date)],
);

/* ---------------- Event types ---------------- */

export type LocationType =
  "daily" | "google_meet" | "zoom" | "teams" | "phone" | "in_person" | "custom";
export type EventLocation = { type: LocationType; value?: string };
/** single = the owner; round_robin = one of the hosts; collective = all hosts together. */
export type Assignment = "single" | "round_robin" | "collective";
export type FollowUp = {
  enabled?: boolean;
  /** Minutes after the meeting ends. */
  delayMin?: number;
  subject?: string;
  /** Placeholders: {name} {host} {event} {bookingUrl} */
  body?: string;
};

/** Repeat a booking into a series of occurrences (weekly coaching, standing 1:1s). */
export type Recurrence = {
  enabled?: boolean;
  freq?: "daily" | "weekly" | "monthly";
  /** Every N days/weeks/months (default 1). */
  interval?: number;
  /** Total occurrences including the first (2–52). */
  count?: number;
};

export type EventQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "email" | "phone" | "select";
  required: boolean;
  options?: string[];
};

export const eventTypes = pgTable(
  "event_types",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Host (owner of the booking page this event lives on). */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull().default(30),
    slotIntervalMin: integer("slot_interval_min"),
    bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
    bufferAfterMin: integer("buffer_after_min").notNull().default(0),
    minNoticeMin: integer("min_notice_min").notNull().default(120),
    maxDaysAhead: integer("max_days_ahead").notNull().default(60),
    maxPerDay: integer("max_per_day"),
    location: jsonb("location").$type<EventLocation>().notNull().default({ type: "daily" }),
    questions: jsonb("questions").$type<EventQuestion[]>().notNull().default([]),
    requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
    color: text("color").notNull().default("#2563eb"),
    hidden: boolean("hidden").notNull().default(false),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    priceCents: integer("price_cents"),
    currency: text("currency"),
    /** Text (SMS/WhatsApp) reminders to attendees who leave a phone number. */
    remindByText: boolean("remind_by_text").notNull().default(false),
    /** Minutes before the start at which attendees (and the host) are reminded. */
    reminders: jsonb("reminders").$type<number[]>().notNull().default([1440, 60]),
    followUp: jsonb("follow_up").$type<FollowUp>().notNull().default({}),
    assignment: text("assignment").$type<Assignment>().notNull().default("single"),
    /** Extra hosts for round-robin / collective event types (the owner is always included). */
    hostUserIds: jsonb("host_user_ids").$type<string[]>().notNull().default([]),
    /** Attendees per slot. >1 makes this a group event: the same start can be booked until full. */
    seats: integer("seats").notNull().default(1),
    recurrence: jsonb("recurrence").$type<Recurrence>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("event_types_user_slug_idx").on(t.userId, t.slug),
    index("event_types_ws_idx").on(t.workspaceId),
  ],
);

/* ---------------- Bookings ---------------- */

export const bookingStatus = pgEnum("booking_status", [
  "awaiting_payment",
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
  "completed",
  "no_show",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventTypeId: text("event_type_id").references(() => eventTypes.id, { onDelete: "set null" }),
    hostUserId: text("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    /** Attendee's IANA timezone, used for emails and the manage page. */
    timezone: text("timezone").notNull().default("UTC"),
    attendeeName: text("attendee_name").notNull(),
    attendeeEmail: text("attendee_email").notNull(),
    attendeePhone: text("attendee_phone"),
    notes: text("notes"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    status: bookingStatus("status").notNull().default("confirmed"),
    /** Signs the attendee's manage page (cancel / reschedule). */
    manageToken: text("manage_token").notNull(),
    cancelReason: text("cancel_reason"),
    cancelledBy: text("cancelled_by"), // attendee | host
    rescheduledFromId: text("rescheduled_from_id"),
    /** Recurring bookings: every occurrence shares a series id; index is 1-based. */
    seriesId: text("series_id"),
    seriesIndex: integer("series_index"),
    seriesCount: integer("series_count"),
    location: jsonb("location").$type<EventLocation>().notNull().default({ type: "custom" }),
    meetingUrl: text("meeting_url"),
    meetingProvider: text("meeting_provider"),
    meetingRef: jsonb("meeting_ref").$type<Record<string, unknown>>(),
    externalEventIds: jsonb("external_event_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    remindersSent: jsonb("reminders_sent").$type<string[]>().notNull().default([]),
    /** null (free) | pending | paid | refunded | failed */
    paymentStatus: text("payment_status"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    paymentRef: jsonb("payment_ref").$type<{
      sessionId?: string;
      paymentIntentId?: string;
      refundId?: string;
    }>(),
    ...timestamps,
  },
  (t) => [
    index("bookings_host_start_idx").on(t.hostUserId, t.startAt),
    index("bookings_ws_start_idx").on(t.workspaceId, t.startAt),
    uniqueIndex("bookings_manage_token_idx").on(t.manageToken),
    index("bookings_reminders_idx").on(t.status, t.startAt),
    index("bookings_series_idx").on(t.seriesId),
    index("bookings_event_start_idx").on(t.eventTypeId, t.startAt),
  ],
);

/* ---------------- Waitlist ---------------- */

/**
 * People waiting for a spot: either a specific full group session (`startAt`) or any time on a
 * day that has no free slots (`date`, YYYY-MM-DD in the attendee's timezone).
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }),
    date: text("date"),
    timezone: text("timezone").notNull().default("UTC"),
    attendeeName: text("attendee_name").notNull(),
    attendeeEmail: text("attendee_email").notNull(),
    /** waiting | notified | left */
    status: text("status").notNull().default("waiting"),
    /** Signs the leave-the-waitlist link. */
    token: text("token").notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("waitlist_event_idx").on(t.eventTypeId, t.status),
    uniqueIndex("waitlist_token_idx").on(t.token),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type ScheduleRule = typeof scheduleRules.$inferSelect;
export type ScheduleOverride = typeof scheduleOverrides.$inferSelect;
export type EventType = typeof eventTypes.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
