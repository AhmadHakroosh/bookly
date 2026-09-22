import { randomUUID } from "node:crypto";
import { count, gt, schema, sql } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";
import pkg from "../../package.json";
import { getState, setState } from "./ops";
import {
  updateAvailable,
  type TelemetryPing,
  type TelemetryReply,
  type UsageStats,
} from "./telemetry-text";

export const APP_VERSION: string = pkg.version;
const STATE_ID = "install.id";
const STATE_LAST = "telemetry.last";
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Anonymous, random, generated once per database. Not derived from anything about the host. */
export async function installId(): Promise<string> {
  const row = await getState(STATE_ID);
  const existing = row?.value.id;
  if (typeof existing === "string" && existing) return existing;
  const id = randomUUID();
  await setState(STATE_ID, { id });
  return id;
}

/** Coarse counts for the opt-in statistics. */
export async function collectStats(now = new Date()): Promise<UsageStats> {
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [workspaces, hosts, eventTypes, bookings30d, contacts, integrations] = await Promise.all([
    one(db().select({ n: count() }).from(schema.workspaces)),
    one(db().select({ n: count() }).from(schema.members)),
    one(db().select({ n: count() }).from(schema.eventTypes)),
    one(
      db().select({ n: count() }).from(schema.bookings).where(gt(schema.bookings.createdAt, d30)),
    ),
    one(db().select({ n: count() }).from(schema.contacts)),
    db()
      .selectDistinct({ provider: schema.integrations.provider })
      .from(schema.integrations)
      .then((rows) => rows.map((r) => String(r.provider)).sort()),
  ]);
  const env = loadEnv();
  return {
    workspaces,
    hosts,
    eventTypes,
    bookings30d,
    contacts,
    integrations,
    captureEnabled: !!env.DAILY_API_KEY,
    paymentsEnabled: !!env.STRIPE_SECRET_KEY,
  };
}

/** Whether this process should ping at all: switched off, or it *is* the platform being pinged. */
function enabled(): boolean {
  const env = loadEnv();
  if (env.TELEMETRY === "off") return false;
  try {
    if (new URL(env.TELEMETRY_URL).host === new URL(env.APP_URL).host) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Daily update check. Sends version, tenancy, Node version and the install id; adds usage counts
 * only when the (single-tenant) workspace opted in. Stores the reply for the admin notice.
 * Safe to call on every tick: it returns early until 24h have passed.
 */
export async function sendTelemetryPing(now = new Date(), force = false): Promise<boolean> {
  if (!enabled()) return false;
  const last = await getState(STATE_LAST);
  const lastAt = typeof last?.value.at === "string" ? Date.parse(last.value.at) : 0;
  if (!force && now.getTime() - lastAt < INTERVAL_MS) return false;
  const env = loadEnv();
  const ws = await db().query.workspaces.findFirst({ columns: { settings: true } });
  const optIn = env.TENANCY === "single" && !!ws?.settings.telemetryStats;
  const ping: TelemetryPing = {
    installId: await installId(),
    version: APP_VERSION,
    tenancy: env.TENANCY,
    nodeVersion: process.version,
    ...(optIn ? { stats: await collectStats(now) } : {}),
  };
  let reply: TelemetryReply | null = null;
  try {
    const res = await fetch(env.TELEMETRY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `bookly/${APP_VERSION}` },
      body: JSON.stringify(ping),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const j = (await res.json()) as Partial<TelemetryReply>;
      if (typeof j.latest === "string") reply = { latest: j.latest, url: String(j.url ?? "") };
    }
  } catch (e) {
    console.warn("[telemetry] ping failed", e instanceof Error ? e.message : e);
  }
  await setState(STATE_LAST, { at: now.toISOString(), reply, sentStats: optIn });
  return true;
}

/** For the admin banner: the newer version announced by the last check, if any. */
export async function pendingUpdate(): Promise<TelemetryReply | null> {
  if (!enabled()) return null;
  const last = await getState(STATE_LAST);
  const reply = (last?.value.reply as TelemetryReply | null | undefined) ?? null;
  return updateAvailable(APP_VERSION, reply) ? reply : null;
}

/** Platform side: record a ping from an install. */
export async function recordInstall(ping: TelemetryPing, now = new Date()) {
  await db()
    .insert(schema.installs)
    .values({
      id: ping.installId,
      version: ping.version,
      tenancy: ping.tenancy,
      nodeVersion: ping.nodeVersion,
      firstSeenAt: now,
      lastSeenAt: now,
      pings: 1,
      stats: ping.stats ?? null,
    })
    .onConflictDoUpdate({
      target: schema.installs.id,
      set: {
        version: ping.version,
        tenancy: ping.tenancy,
        nodeVersion: ping.nodeVersion,
        lastSeenAt: now,
        pings: sql`${schema.installs.pings} + 1`,
        stats: ping.stats ?? null,
      },
    });
}

/** Platform side: what the console shows. */
export async function installSummary(now = new Date()) {
  const rows = await db().query.installs.findMany({ orderBy: (t, { desc }) => desc(t.lastSeenAt) });
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const active7 = rows.filter((r) => r.lastSeenAt >= since(7));
  const active30 = rows.filter((r) => r.lastSeenAt >= since(30));
  const byVersion = new Map<string, number>();
  for (const r of active30) byVersion.set(r.version, (byVersion.get(r.version) ?? 0) + 1);
  const sharing = active30.filter((r) => r.stats);
  const sum = (k: keyof UsageStats) =>
    sharing.reduce((n, r) => n + Number((r.stats as Partial<UsageStats>)?.[k] ?? 0), 0);
  return {
    rows,
    total: rows.length,
    active7: active7.length,
    active30: active30.length,
    byVersion: [...byVersion.entries()].sort((a, b) => b[1] - a[1]),
    sharing: sharing.length,
    totals: sharing.length
      ? { hosts: sum("hosts"), bookings30d: sum("bookings30d"), contacts: sum("contacts") }
      : null,
  };
}
