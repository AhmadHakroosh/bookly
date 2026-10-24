import "server-only";
import { loadEnv } from "@bookly/config";
import {
  captureBudget,
  formatBytes,
  isPlanId,
  storageBudget,
  FEATURE_LABELS,
  LIMIT_LABELS,
  limitsFor,
  planFor,
  PLANS,
  withinLimit,
  type CountableLimit,
  type FeatureLimit,
  type Limits,
} from "@bookly/cloud";
import { and, eq, gte, isNotNull, schema, sql, inArray } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { BILLABLE_ROLES } from "@/lib/roles";

export class LimitError extends Error {
  constructor(
    message: string,
    public readonly upgradeTo: string,
  ) {
    super(message);
  }
}

export const workspaceLimits = (ws: Workspace): Limits => limitsFor(ws.plan, ws.planStatus);

async function count(ws: Workspace, what: CountableLimit, userId?: string): Promise<number> {
  const n = sql<number>`count(*)::int`;
  switch (what) {
    case "eventTypes":
      return (
        (
          await db()
            .select({ n })
            .from(schema.eventTypes)
            .where(
              and(eq(schema.eventTypes.workspaceId, ws.id), eq(schema.eventTypes.active, true)),
            )
        )[0]?.n ?? 0
      );
    case "members":
    case "collaborators":
      // Seats are owners, admins and members; collaborators are counted on their own.
      return (
        (
          await db()
            .select({ n })
            .from(schema.members)
            .where(
              and(
                eq(schema.members.organizationId, ws.organizationId),
                what === "members"
                  ? inArray(schema.members.role, [...BILLABLE_ROLES])
                  : eq(schema.members.role, "collaborator"),
              ),
            )
        )[0]?.n ?? 0
      );
    case "integrations":
      return (
        (
          await db()
            .select({ n })
            .from(schema.integrations)
            .where(
              userId
                ? and(
                    eq(schema.integrations.workspaceId, ws.id),
                    eq(schema.integrations.userId, userId),
                  )
                : eq(schema.integrations.workspaceId, ws.id),
            )
        )[0]?.n ?? 0
      );
    case "domains":
      return (
        (
          await db()
            .select({ n })
            .from(schema.workspaceDomains)
            .where(
              and(
                eq(schema.workspaceDomains.workspaceId, ws.id),
                eq(schema.workspaceDomains.isPrimary, false),
                isNotNull(schema.workspaceDomains.verificationToken),
              ),
            )
        )[0]?.n ?? 0
      );
  }
}

/** Throws a LimitError when adding one more `what` would exceed the plan. No-op when self-hosted. */
export async function assertWithinLimit(ws: Workspace, what: CountableLimit, userId?: string) {
  const limits = workspaceLimits(ws);
  if (limits[what] === null) return;
  const current = await count(ws, what, userId);
  if (withinLimit(limits, what, current)) return;
  const next = planFor(what, current + 1);
  throw new LimitError(
    `Your ${PLANS[(ws.plan in PLANS ? ws.plan : "free") as keyof typeof PLANS].name} plan allows ${limits[what]} ${LIMIT_LABELS[what]}. Upgrade to ${PLANS[next].name} for more.`,
    next,
  );
}

/** Throws a LimitError when the plan lacks a feature. No-op when self-hosted. */
export function assertFeature(ws: Workspace, what: FeatureLimit) {
  const limits = workspaceLimits(ws);
  if (limits[what]) return;
  const next = planFor(what);
  throw new LimitError(`${FEATURE_LABELS[what]} needs the ${PLANS[next].name} plan.`, next);
}

export const hasFeature = (ws: Workspace, what: FeatureLimit) => !!workspaceLimits(ws)[what];

/** Bookings created in the current calendar month (UTC), any status. */
export async function bookingsThisMonth(ws: Workspace): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return (
    (
      await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.workspaceId, ws.id), gte(schema.bookings.createdAt, start)))
    )[0]?.n ?? 0
  );
}

/** Throws a LimitError when the plan's monthly booking quota is used up. No-op when self-hosted. */
export async function assertBookingQuota(ws: Workspace) {
  const max = workspaceLimits(ws).bookingsPerMonth;
  if (max === null) return;
  const used = await bookingsThisMonth(ws);
  if (used < max) return;
  throw new LimitError(
    `This calendar has reached its ${max} bookings for the month. Upgrade to ${PLANS.pro.name} for unlimited bookings.`,
    "pro",
  );
}

/** Transcribed minutes this calendar month (UTC). */
export async function captureMinutesThisMonth(ws: Workspace): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db()
    .select({
      m: sql<number>`coalesce(sum(extract(epoch from (coalesce(${schema.meetingTranscripts.endedAt}, now()) - ${schema.meetingTranscripts.startedAt})) / 60), 0)::int`,
    })
    .from(schema.meetingTranscripts)
    .where(
      and(
        eq(schema.meetingTranscripts.workspaceId, ws.id),
        gte(schema.meetingTranscripts.createdAt, start),
      ),
    );
  return rows[0]?.m ?? 0;
}

/** The workspace's monthly minute budget (null = unlimited, 0 = feature off). */
export async function captureBudgetFor(ws: Workspace): Promise<number | null> {
  const limits = workspaceLimits(ws);
  if (limits.captureMinutesPerMonth === 0) return 0;
  return isPlanId(ws.plan)
    ? captureBudget(PLANS[ws.plan], await count(ws, "members"))
    : limits.captureMinutesPerMonth;
}

/**
 * Whether minutes past the budget are billed instead of refused: a paid plan with a Stripe
 * subscription, the metered price configured, and the workspace not having opted out.
 */
export function overageAllowed(ws: Workspace): boolean {
  const limits = workspaceLimits(ws);
  if (!limits.captureMinutesPerMonth) return false;
  if (!loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE || !ws.stripeSubscriptionId) return false;
  return ws.settings.capture?.overage !== false;
}

export type CaptureDecision = {
  ok: boolean;
  reason?: string;
  /** Minutes left in the included budget (null = unlimited). */
  left: number | null;
  /** The budget is spent and further minutes are billed at the metered rate. */
  overage: boolean;
};

/**
 * Can this workspace start (or keep) a transcription now? Feature off or budget spent without
 * overage → no; budget spent with overage → yes, flagged, so callers do not cap the recording.
 */
export async function captureAllowed(ws: Workspace): Promise<CaptureDecision> {
  const max = await captureBudgetFor(ws);
  if (max === 0)
    return {
      ok: false,
      reason: `Auto-capture needs the ${PLANS.pro.name} plan.`,
      left: 0,
      overage: false,
    };
  if (max === null) return { ok: true, left: null, overage: false };
  const used = await captureMinutesThisMonth(ws);
  const left = Math.max(0, max - used);
  const overage = overageAllowed(ws);
  if (used < max) return { ok: true, left, overage };
  return overage
    ? { ok: true, left: 0, overage: true }
    : {
        ok: false,
        reason: `This month's ${max} transcribed minutes are used up.`,
        left: 0,
        overage: false,
      };
}

/** Minutes left this month, or null when unlimited (0 when the feature is off or used up). */
export async function captureBudgetLeft(ws: Workspace): Promise<number | null> {
  const max = await captureBudgetFor(ws);
  if (max === null) return null;
  if (max === 0) return 0;
  return Math.max(0, max - (await captureMinutesThisMonth(ws)));
}

/** Throws when the plan has no auto-capture at all (editor guard). */
export function assertCaptureFeature(ws: Workspace) {
  if (workspaceLimits(ws).captureMinutesPerMonth === 0)
    throw new LimitError(`Auto-capture needs the ${PLANS.pro.name} plan.`, "pro");
}

/* ---------------- Storage ---------------- */

/** Bytes of uploaded files the workspace holds (ready, plus pending uploads that reserved room). */
export async function storageUsed(ws: Pick<Workspace, "id">): Promise<number> {
  const rows = await db()
    .select({ n: sql<number>`coalesce(sum(${schema.files.size}), 0)::bigint` })
    .from(schema.files)
    .where(eq(schema.files.workspaceId, ws.id));
  return Number(rows[0]?.n ?? 0);
}

/** The workspace's storage budget in bytes (null = unlimited; Team pools per seat). */
export async function storageBudgetFor(ws: Workspace): Promise<number | null> {
  const limits = workspaceLimits(ws);
  if (limits.storageBytes === null) return null;
  return isPlanId(ws.plan)
    ? storageBudget(PLANS[ws.plan], await count(ws, "members"))
    : limits.storageBytes;
}

/** Throws a LimitError when storing `bytes` more would exceed the plan. No-op when self-hosted. */
export async function assertStorageQuota(ws: Workspace, bytes: number) {
  const max = await storageBudgetFor(ws);
  if (max === null) return;
  const used = await storageUsed(ws);
  if (used + bytes <= max) return;
  const next = ws.plan === "free" ? "pro" : "team";
  throw new LimitError(
    `This workspace has used ${formatBytes(used)} of its ${formatBytes(max)} of file storage. Delete files or upgrade to ${PLANS[next].name} for more.`,
    next,
  );
}

export type UsageRow = {
  key: string;
  label: string;
  used: number;
  max: number | null;
  /** How to print `used` and `max` when they are not plain counts (bytes). */
  format?: (n: number) => string;
};

/** Current usage for the billing page. */
export async function usageSummary(ws: Workspace): Promise<UsageRow[]> {
  const limits = workspaceLimits(ws);
  const keys: CountableLimit[] = [
    "eventTypes",
    "members",
    "collaborators",
    "integrations",
    "domains",
  ];
  const counts = await Promise.all(keys.map((k) => count(ws, k)));
  return [
    ...keys
      .map((k, i) => ({
        key: k as string,
        label: LIMIT_LABELS[k],
        used: counts[i]!,
        max: limits[k],
      }))
      // Collaborators come with hiring: listed once a workspace has any.
      .filter((r) => r.key !== "collaborators" || r.used > 0),
    {
      key: "bookingsPerMonth",
      label: "bookings this month",
      used: await bookingsThisMonth(ws),
      max: limits.bookingsPerMonth,
    },
    {
      key: "storageBytes",
      label: limits.storagePerSeat ? "file storage (pooled across the team)" : "file storage",
      used: await storageUsed(ws),
      max: await storageBudgetFor(ws),
      format: formatBytes,
    },
    {
      key: "captureMinutesPerMonth",
      label: limits.captureMinutesPerMember
        ? "transcribed minutes this month (pooled across the team)"
        : "transcribed minutes this month",
      used: await captureMinutesThisMonth(ws),
      max: isPlanId(ws.plan)
        ? captureBudget(PLANS[ws.plan], counts[1]!)
        : limits.captureMinutesPerMonth,
    },
  ];
}
