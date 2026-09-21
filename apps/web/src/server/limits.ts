import "server-only";
import {
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
import { and, eq, gte, isNotNull, schema, sql } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";

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
      return (
        (
          await db()
            .select({ n })
            .from(schema.members)
            .where(eq(schema.members.organizationId, ws.organizationId))
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

/** Current usage for the billing page. */
export async function usageSummary(ws: Workspace) {
  const limits = workspaceLimits(ws);
  const keys: CountableLimit[] = ["eventTypes", "members", "integrations", "domains"];
  const counts = await Promise.all(keys.map((k) => count(ws, k)));
  return [
    ...keys.map((k, i) => ({
      key: k as string,
      label: LIMIT_LABELS[k],
      used: counts[i]!,
      max: limits[k],
    })),
    {
      key: "bookingsPerMonth",
      label: "bookings this month",
      used: await bookingsThisMonth(ws),
      max: limits.bookingsPerMonth,
    },
  ];
}
