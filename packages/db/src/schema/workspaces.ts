import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

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

/** Per-workspace settings stored as JSON; validated in the app before writes. */
export type WorkspaceSettings = {
  branding?: { logoUrl?: string | null; accent?: string; colorMode?: "system" | "light" | "dark" };
  /** Default timezone for new schedules and for the booking page when the visitor's is unknown. */
  timezone?: string;
  /** Booking page footer / privacy text. */
  footerText?: string;
  /** Daily.co webhook registered for join notifications. */
  /**
   * Bookly video. `joinPings: false` mutes the "attendee joined" notification for the workspace.
   * `webhookId` / `hmac` / `url` are from before the webhook moved to `platform_state`.
   */
  daily?: { joinPings?: boolean; webhookId?: string; hmac?: string; url?: string } | null;
  /** Emails or `@domains` whose bookings are refused. */
  blockedEmails?: string[];
  /** CRM sync: contacts and meeting notes are pushed here (API key is encrypted at rest). */
  crm?: { provider: "hubspot" | "pipedrive"; apiKey: string; companyDomain?: string } | null;
  /** Opt-in: include coarse usage counts in the daily update check (self-hosted only). */
  telemetryStats?: boolean;
  /** How the current paid plan is billed, mirrored from the Stripe subscription. */
  billingInterval?: "month" | "year";
  /**
   * Stripe Connect (cloud mode): the state of the workspace's own Stripe account, refreshed from
   * `account.updated` events and on return from onboarding. `feePercent` is an operator override
   * of the platform fee on this workspace's bookings.
   */
  payments?: {
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    connectedAt?: string;
    feePercent?: number | null;
  } | null;
  /**
   * Postal address printed in the footer of outreach emails (proposals, payment requests,
   * follow-ups), which commercial-email law requires alongside the unsubscribe link.
   */
  postalAddress?: string;
  /**
   * Auto-capture: transcript retention (days, default 90), Deepgram language (default auto),
   * and whether to keep transcribing past the plan's minutes at the metered rate (default on).
   */
  capture?: { retentionDays?: number; language?: string; overage?: boolean };
  /**
   * Email wording. Contact page: proposal / paymentRequest / checkIn ({name} {company} {host}
   * {amount} {payLink} {bookingUrl}). Guest emails: confirmation / reminder / cancellation ({name} {host} {event}
   * {when} {where} {duration} {bookingUrl} {workspace}; reminder also {relative}). Blank = default.
   */
  templates?: {
    proposal?: { subject?: string; body?: string };
    paymentRequest?: { subject?: string; body?: string };
    checkIn?: { subject?: string; body?: string };
    confirmation?: { subject?: string; body?: string };
    reminder?: { subject?: string; body?: string };
    cancellation?: { subject?: string; body?: string };
  };
  [key: string]: unknown;
};

/**
 * A workspace is one scheduling tenant (a person or a team). Every scheduling table
 * references `workspace_id`. Ownership, members and invitations are handled by the auth
 * `organizations` tables; a workspace belongs to exactly one organization.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    locale: text("locale").notNull().default("en"),
    timezone: text("timezone").notNull().default("UTC"),
    settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
    /** self-hosted | free | pro | team */
    plan: text("plan").notNull().default("self-hosted"),
    /** stripe (default) | operator: a manual plan that Stripe webhooks must not overwrite. */
    planManagedBy: text("plan_managed_by").notNull().default("stripe"),
    /** Operator's note for a manual plan (comp, trial, partner). */
    planNote: text("plan_note"),
    /** Manual plans can expire; the health tick drops them back to free. */
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    /** Stripe subscription status (active, trialing, past_due, canceled…); null for free/self-hosted. */
    planStatus: text("plan_status"),
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Stripe Connect account that receives this workspace's booking payments (cloud mode). */
    stripeAccountId: text("stripe_account_id"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendReason: text("suspend_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspaces_slug_idx").on(t.slug),
    index("workspaces_org_idx").on(t.organizationId),
  ],
);

/** Hostnames that resolve to a workspace: `<slug>.<root>` subdomains and custom domains. */
export const workspaceDomains = pgTable(
  "workspace_domains",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** DNS TXT value the owner must publish at _bookly.<host> before a custom domain is served. */
    verificationToken: text("verification_token"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_domains_host_idx").on(t.host),
    index("workspace_domains_ws_idx").on(t.workspaceId),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceDomain = typeof workspaceDomains.$inferSelect;
