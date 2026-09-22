import "server-only";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  schema,
  sql,
} from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { isPlanId, PLANS, monthlyEquivalent } from "@bookly/cloud";
import { db } from "@/lib/db";
import { jobsHealth } from "./jobs";
import { getLimiter } from "./ratelimit";
import { dailyConfigured } from "./integrations";
import { paymentsConfigured } from "./payments";
import { isCloud } from "./platform";
import { assistantConfigured } from "./brief";
import { textConfigured } from "./notify";

/* ---------------- Audit ---------------- */

export async function audit(
  actorEmail: string,
  action: string,
  target: { type: "workspace" | "user" | "platform"; id?: string | null },
  data: Record<string, unknown> = {},
) {
  await db()
    .insert(schema.operatorAuditLog)
    .values({ actorEmail, action, targetType: target.type, targetId: target.id ?? null, data })
    .catch((e) => console.error("[audit]", e));
}

export async function listAudit(opts: { targetId?: string; limit?: number } = {}) {
  const conds = opts.targetId ? [eq(schema.operatorAuditLog.targetId, opts.targetId)] : [];
  return db()
    .select()
    .from(schema.operatorAuditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.operatorAuditLog.createdAt))
    .limit(opts.limit ?? 100);
}

/* ---------------- Usage counters ---------------- */

const today = () => new Date().toISOString().slice(0, 10);

/** Fire-and-forget increment; a failure never affects the request. */
export function bump(workspaceId: string, metric: string, n = 1) {
  void db()
    .insert(schema.usageCounters)
    .values({ workspaceId, day: today(), metric, n })
    .onConflictDoUpdate({
      target: [
        schema.usageCounters.workspaceId,
        schema.usageCounters.day,
        schema.usageCounters.metric,
      ],
      set: { n: sql`${schema.usageCounters.n} + ${n}` },
    })
    .catch(() => {});
}

export async function usageSince(workspaceId: string | null, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db()
    .select({
      metric: schema.usageCounters.metric,
      n: sql<number>`sum(${schema.usageCounters.n})::int`,
    })
    .from(schema.usageCounters)
    .where(
      and(
        gte(schema.usageCounters.day, since),
        workspaceId ? eq(schema.usageCounters.workspaceId, workspaceId) : undefined,
      ),
    )
    .groupBy(schema.usageCounters.metric);
  return Object.fromEntries(rows.map((r) => [r.metric, r.n])) as Record<string, number>;
}

/* ---------------- Platform state / health ---------------- */

export async function setState(key: string, value: Record<string, unknown>) {
  await db()
    .insert(schema.platformState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.platformState.key, set: { value, updatedAt: new Date() } })
    .catch((e) => console.error("[state]", e));
}

export async function getState(key: string) {
  return (
    (await db().query.platformState.findFirst({ where: eq(schema.platformState.key, key) })) ?? null
  );
}

export type HealthCheck = { name: string; ok: boolean; detail: string };

/** Everything an operator wants to know at a glance about whether the install is healthy. */
export async function healthReport(now = new Date()): Promise<HealthCheck[]> {
  const env = loadEnv();
  const [tick, failedHooks, brokenIntegrations, stuckPayments, dbOk, limiterOk, jobs] =
    await Promise.all([
      getState("jobs.lastTick"),
      db()
        .select({ n: count() })
        .from(schema.webhookDeliveries)
        .where(
          and(
            eq(schema.webhookDeliveries.status, "failed"),
            gte(schema.webhookDeliveries.createdAt, new Date(now.getTime() - 86_400_000)),
          ),
        ),
      db()
        .select({ n: count() })
        .from(schema.integrations)
        .where(eq(schema.integrations.status, "error")),
      db()
        .select({ n: count() })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.status, "awaiting_payment"),
            lte(schema.bookings.createdAt, new Date(now.getTime() - 3600_000)),
          ),
        ),
      db()
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false),
      getLimiter().ping(),
      jobsHealth(),
    ]);
  const tickAge = tick ? (now.getTime() - tick.updatedAt.getTime()) / 60_000 : null;
  const emailProvider = env.RESEND_API_KEY
    ? "Resend"
    : env.SMTP_HOST
      ? "SMTP"
      : "console (dev only)";
  return [
    { name: "Database", ok: dbOk, detail: dbOk ? "reachable" : "query failed" },
    {
      name: "Rate limiting",
      ok: limiterOk,
      detail:
        getLimiter().name === "upstash"
          ? limiterOk
            ? "Upstash reachable, shared across instances"
            : "Upstash unreachable: limits are not enforced"
          : "per process (set UPSTASH_REDIS_REST_URL to share across instances)",
    },
    {
      name: "Background jobs",
      ok: jobs.ok && tickAge !== null && tickAge < 30,
      detail: `${jobs.detail}; ${
        tickAge === null ? "reminders never ran" : `reminders ran ${Math.round(tickAge)} min ago`
      }`,
    },
    { name: "Email", ok: !!(env.RESEND_API_KEY || env.SMTP_HOST), detail: emailProvider },
    {
      name: "Payments (Stripe)",
      ok: paymentsConfigured(),
      detail: !paymentsConfigured()
        ? "not configured"
        : [
            env.STRIPE_WEBHOOK_SECRET
              ? "key and webhook secret set"
              : "key set, webhook secret missing",
            ...(isCloud()
              ? [
                  env.STRIPE_CONNECT_WEBHOOK_SECRET
                    ? "Connect webhook set"
                    : "Connect webhook secret missing: hosts' payments will not confirm",
                ]
              : []),
          ].join("; "),
    },
    {
      name: "Bookly video (Daily)",
      ok: dailyConfigured(),
      detail: dailyConfigured() ? "configured" : "not configured",
    },
    {
      name: "Text messages (Twilio)",
      ok: textConfigured(),
      detail: textConfigured() ? "configured" : "not configured",
    },
    {
      name: "Assistant (Anthropic)",
      ok: assistantConfigured(),
      detail: assistantConfigured()
        ? env.ASSISTANT_MODEL || "claude-sonnet-5"
        : "no API key: plain briefs, manual capture",
    },
    {
      name: "Calendar connections",
      ok: (brokenIntegrations[0]?.n ?? 0) === 0,
      detail: `${brokenIntegrations[0]?.n ?? 0} in error`,
    },
    {
      name: "Webhook deliveries (24h)",
      ok: (failedHooks[0]?.n ?? 0) === 0,
      detail: `${failedHooks[0]?.n ?? 0} failed`,
    },
    {
      name: "Unpaid bookings older than 1h",
      ok: (stuckPayments[0]?.n ?? 0) === 0,
      detail: `${stuckPayments[0]?.n ?? 0} waiting`,
    },
  ];
}

/* ---------------- Stats ---------------- */

export async function platformStats(now = new Date()) {
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const [workspaces, users, activeUsers7d, bookings30d, byPlan, minutes30d, weekly] =
    await Promise.all([
      db().select({ n: count() }).from(schema.workspaces),
      db().select({ n: count() }).from(schema.users),
      db()
        .select({ n: sql<number>`count(distinct ${schema.sessions.userId})::int` })
        .from(schema.sessions)
        .where(gte(schema.sessions.updatedAt, d7)),
      db().select({ n: count() }).from(schema.bookings).where(gte(schema.bookings.createdAt, d30)),
      db()
        .select({
          plan: schema.workspaces.plan,
          status: schema.workspaces.planStatus,
          interval: sql<string | null>`${schema.workspaces.settings}->>'billingInterval'`,
          n: count(),
        })
        .from(schema.workspaces)
        .groupBy(
          schema.workspaces.plan,
          schema.workspaces.planStatus,
          sql`${schema.workspaces.settings}->>'billingInterval'`,
        ),
      db()
        .select({
          m: sql<number>`coalesce(sum(extract(epoch from (coalesce(${schema.meetingTranscripts.endedAt}, now()) - ${schema.meetingTranscripts.startedAt})) / 60), 0)::int`,
        })
        .from(schema.meetingTranscripts)
        .where(gte(schema.meetingTranscripts.createdAt, d30)),
      db()
        .select({
          week: sql<string>`to_char(date_trunc('week', ${schema.workspaces.createdAt}), 'YYYY-MM-DD')`,
          n: count(),
        })
        .from(schema.workspaces)
        .where(gte(schema.workspaces.createdAt, new Date(now.getTime() - 12 * 7 * 86_400_000)))
        .groupBy(sql`date_trunc('week', ${schema.workspaces.createdAt})`)
        .orderBy(sql`date_trunc('week', ${schema.workspaces.createdAt})`),
    ]);
  // Monthly recurring revenue from paid, active plans (display estimate; Stripe is the truth).
  let mrr = 0;
  const plans: Record<string, number> = {};
  for (const p of byPlan) {
    plans[p.plan] = (plans[p.plan] ?? 0) + p.n;
    if (
      isPlanId(p.plan) &&
      p.plan !== "free" &&
      (!p.status || ["active", "trialing", "past_due"].includes(p.status))
    )
      mrr += monthlyEquivalent(PLANS[p.plan], p.interval === "year" ? "year" : "month") * p.n;
  }
  return {
    workspaces: workspaces[0]?.n ?? 0,
    users: users[0]?.n ?? 0,
    activeUsers7d: activeUsers7d[0]?.n ?? 0,
    bookings30d: bookings30d[0]?.n ?? 0,
    transcribedMinutes30d: minutes30d[0]?.m ?? 0,
    plans,
    mrr,
    signupsByWeek: weekly.map((w) => ({ week: w.week, n: w.n })),
  };
}

/* ---------------- Workspace queries for the console ---------------- */

export type ConsoleFilter = { q?: string; plan?: string; status?: "active" | "suspended" };

export async function listWorkspacesForConsole(f: ConsoleFilter = {}, limit = 100) {
  const conds = [];
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(schema.workspaces.name, like),
        ilike(schema.workspaces.slug, like),
        ilike(schema.users.email, like),
      )!,
    );
  }
  if (f.plan) conds.push(eq(schema.workspaces.plan, f.plan));
  if (f.status === "suspended") conds.push(isNotNull(schema.workspaces.suspendedAt));
  if (f.status === "active") conds.push(sql`${schema.workspaces.suspendedAt} is null`);
  return db()
    .select({
      ws: schema.workspaces,
      ownerEmail: schema.users.email,
      bookings: sql<number>`(select count(*)::int from bookings b where b.workspace_id = ${schema.workspaces.id})`,
      lastBookingAt: sql<Date | null>`(select max(b.created_at) from bookings b where b.workspace_id = ${schema.workspaces.id})`,
    })
    .from(schema.workspaces)
    .leftJoin(
      schema.members,
      sql`${schema.members.organizationId} = ${schema.workspaces.organizationId} and ${schema.members.role} = 'owner'`,
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.workspaces.createdAt))
    .limit(limit);
}

export async function workspaceDetail(id: string, now = new Date()) {
  const ws = await db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, id) });
  if (!ws) return null;
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [
    members,
    counts,
    bookings30d,
    recentBookings,
    integrations,
    hooks,
    failedHooks,
    minutesMonth,
    usage,
    auditRows,
    contacts,
    eventTypes,
    apiKeys,
  ] = await Promise.all([
    db()
      .select({
        role: schema.members.role,
        email: schema.users.email,
        name: schema.users.name,
        userId: schema.users.id,
        banned: schema.users.banned,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(eq(schema.members.organizationId, ws.organizationId)),
    db().select({ n: count() }).from(schema.bookings).where(eq(schema.bookings.workspaceId, id)),
    db()
      .select({ n: count() })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.workspaceId, id), gte(schema.bookings.createdAt, d30))),
    db()
      .select({ b: schema.bookings, title: schema.eventTypes.title })
      .from(schema.bookings)
      .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
      .where(eq(schema.bookings.workspaceId, id))
      .orderBy(desc(schema.bookings.createdAt))
      .limit(10),
    db()
      .select({
        provider: schema.integrations.provider,
        status: schema.integrations.status,
        label: schema.integrations.accountLabel,
      })
      .from(schema.integrations)
      .where(eq(schema.integrations.workspaceId, id)),
    db().select({ n: count() }).from(schema.webhooks).where(eq(schema.webhooks.workspaceId, id)),
    db()
      .select({ n: count() })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
      .where(
        and(
          eq(schema.webhooks.workspaceId, id),
          eq(schema.webhookDeliveries.status, "failed"),
          gte(schema.webhookDeliveries.createdAt, d30),
        ),
      ),
    db()
      .select({
        m: sql<number>`coalesce(sum(extract(epoch from (coalesce(${schema.meetingTranscripts.endedAt}, now()) - ${schema.meetingTranscripts.startedAt})) / 60), 0)::int`,
      })
      .from(schema.meetingTranscripts)
      .where(
        and(
          eq(schema.meetingTranscripts.workspaceId, id),
          gte(schema.meetingTranscripts.createdAt, month),
        ),
      ),
    usageSince(id, 30),
    listAudit({ targetId: id, limit: 20 }),
    db().select({ n: count() }).from(schema.contacts).where(eq(schema.contacts.workspaceId, id)),
    db()
      .select({ n: count() })
      .from(schema.eventTypes)
      .where(and(eq(schema.eventTypes.workspaceId, id), eq(schema.eventTypes.active, true))),
    db().select({ n: count() }).from(schema.apiKeys).where(eq(schema.apiKeys.workspaceId, id)),
  ]);
  return {
    ws,
    members,
    bookingsTotal: counts[0]?.n ?? 0,
    bookings30d: bookings30d[0]?.n ?? 0,
    recentBookings: recentBookings.map((r) => ({ ...r.b, title: r.title })),
    integrations,
    webhooks: hooks[0]?.n ?? 0,
    failedDeliveries30d: failedHooks[0]?.n ?? 0,
    transcribedMinutesMonth: minutesMonth[0]?.m ?? 0,
    usage30d: usage,
    audit: auditRows,
    contacts: contacts[0]?.n ?? 0,
    eventTypes: eventTypes[0]?.n ?? 0,
    apiKeys: apiKeys[0]?.n ?? 0,
  };
}

export async function listUsersForConsole(q?: string, limit = 100) {
  const like = q?.trim() ? `%${q.trim()}%` : null;
  const rows = await db()
    .select({
      u: schema.users,
      // Correlated subqueries must name the outer table: a bare "id" binds to the inner tables.
      lastSeen: sql<Date | null>`(select max(s.updated_at) from sessions s where s.user_id = users.id)`,
      workspaces: sql<string>`(select coalesce(string_agg(w.slug, ', '), '') from members m join workspaces w on w.organization_id = m.organization_id where m.user_id = users.id)`,
    })
    .from(schema.users)
    .where(like ? or(ilike(schema.users.email, like), ilike(schema.users.name, like)) : undefined)
    .orderBy(desc(schema.users.createdAt))
    .limit(limit);
  return rows;
}

/** Manual plans past their expiry fall back to Free (called from the tick). */
export async function expireManualPlans(now = new Date()) {
  const rows = await db()
    .update(schema.workspaces)
    .set({
      plan: "free",
      planStatus: null,
      planManagedBy: "stripe",
      planNote: null,
      planExpiresAt: null,
    })
    .where(
      and(
        eq(schema.workspaces.planManagedBy, "operator"),
        isNotNull(schema.workspaces.planExpiresAt),
        lte(schema.workspaces.planExpiresAt, now),
      ),
    )
    .returning({ id: schema.workspaces.id });
  for (const r of rows) await audit("system", "plan.expired", { type: "workspace", id: r.id });
  return rows.length;
}

export const knownPlans = () => Object.keys(PLANS);
export { inArray };
