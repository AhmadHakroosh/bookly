import "server-only";
import { headers } from "next/headers";
import { and, desc, eq, gte, inArray, lt, lte, or, schema, sql } from "@bookly/db";
import type { AuditActorType, AuditChanges, AuditEntry, Workspace } from "@bookly/db/schema";
import { PLANS, limitsFor } from "@bookly/cloud";
import { db } from "@/lib/db";
import { getSession } from "./session";
import { getCurrentWorkspace } from "./workspace";

/*
 * The workspace activity log. Every server action and route handler that writes workspace
 * data calls `audit()` once, after the write, so "who cancelled this booking?" always has an
 * answer. The call never throws and never blocks the caller's result on a logging failure.
 *
 * Actions are `<target>.<verb>` in the past tense: `booking.cancelled`, `event_type.created`,
 * `settings.general.updated`, `member.role_changed`. `changes` carries only the fields that
 * changed (see `diff()`), never whole rows and never secrets.
 */

export type AuditActor = { type: AuditActorType; id?: string | null; label: string };

export type AuditInput = {
  action: string;
  target: { type: string; id?: string | null; label?: string | null };
  changes?: AuditChanges;
  /** Defaults to the current request's workspace (server actions, admin routes). */
  workspace?: Pick<Workspace, "id"> | string | null;
  /** Defaults to the signed-in user; API routes pass the key, jobs pass `system()`. */
  actor?: AuditActor;
};

export const SYSTEM_ACTOR = (job: string): AuditActor => ({
  type: "system",
  id: job,
  label: `Bookly (${job})`,
});

export const API_KEY_ACTOR = (key: { id: string; prefix: string; name?: string | null }) => ({
  type: "api_key" as const,
  id: key.id,
  label: key.name ? `${key.name} (${key.prefix}…)` : `${key.prefix}…`,
});

/** A guest acting through a booking link or the public booking page. */
export const GUEST_ACTOR = (email: string, name?: string | null): AuditActor => ({
  type: "guest",
  id: email.toLowerCase(),
  label: name ? `${name} <${email}>` : email,
});

export const INTEGRATION_ACTOR = (provider: string, id?: string | null): AuditActor => ({
  type: "integration",
  id: id ?? provider,
  label: provider,
});

/** Request context, when there is a request; jobs have none. */
async function requestContext() {
  try {
    const h = await headers();
    return {
      requestId: h.get("x-vercel-id") ?? h.get("x-request-id"),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    };
  } catch {
    return { requestId: null, ip: null, userAgent: null };
  }
}

async function currentActor(): Promise<AuditActor | null> {
  try {
    const session = await getSession();
    if (!session) return null;
    return { type: "user", id: session.user.id, label: session.user.email };
  } catch {
    return null;
  }
}

/** Records one entry. Resolves the workspace and the actor from the request when not given. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const wsId =
      typeof input.workspace === "string"
        ? input.workspace
        : (input.workspace?.id ?? (await getCurrentWorkspace())?.id);
    if (!wsId) return;
    const actor = input.actor ?? (await currentActor()) ?? SYSTEM_ACTOR("request");
    const ctx = await requestContext();
    await db()
      .insert(schema.auditLog)
      .values({
        workspaceId: wsId,
        actorType: actor.type,
        actorId: actor.id ?? null,
        actorLabel: actor.label,
        action: input.action,
        targetType: input.target.type,
        targetId: input.target.id ?? null,
        targetLabel: input.target.label?.slice(0, 200) ?? null,
        changes: input.changes ?? {},
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
  } catch (e) {
    console.error("[audit] write failed", input.action, e);
  }
}

const SECRET = /(secret|token|password|apikey|api_key|hash|hmac|key)$/i;

/**
 * The fields of `after` that differ from `before`, as `{ field: { from, to } }`. Pass `fields`
 * to limit the comparison; anything that looks like a secret is recorded as changed without
 * its values.
 */
export function diff<T extends Record<string, unknown>>(
  before: Partial<T> | null | undefined,
  after: Partial<T>,
  fields?: (keyof T & string)[],
): AuditChanges {
  const out: AuditChanges = {};
  const keys = fields ?? (Object.keys(after) as (keyof T & string)[]);
  for (const k of keys) {
    const from = before?.[k];
    const to = after[k];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    out[k] = SECRET.test(k)
      ? { from: from ? "•••" : undefined, to: to ? "•••" : undefined }
      : { from, to };
  }
  return out;
}

/* ---------------- Reading ---------------- */

export type AuditCursor = { createdAt: string; id: string };

export type AuditFilters = {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
};

export const encodeCursor = (e: Pick<AuditEntry, "createdAt" | "id">) =>
  Buffer.from(`${e.createdAt.toISOString()}|${e.id}`).toString("base64url");

export function decodeCursor(s: string | null | undefined): AuditCursor | null {
  if (!s) return null;
  try {
    const [createdAt, id] = Buffer.from(s, "base64url").toString().split("|");
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Newest first, keyset-paginated on (created_at, id): the page after `cursor` costs the same
 * however long the history is. Returns one extra row to know whether there is more.
 */
export async function listActivity(
  workspaceId: string,
  opts: { cursor?: AuditCursor | null; limit?: number; filters?: AuditFilters } = {},
): Promise<{ rows: AuditEntry[]; next: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const f = opts.filters ?? {};
  const conds = [eq(schema.auditLog.workspaceId, workspaceId)];
  if (opts.cursor) {
    const at = new Date(opts.cursor.createdAt);
    conds.push(
      or(
        lt(schema.auditLog.createdAt, at),
        and(eq(schema.auditLog.createdAt, at), lt(schema.auditLog.id, opts.cursor.id)),
      )!,
    );
  }
  if (f.actor) conds.push(eq(schema.auditLog.actorLabel, f.actor));
  if (f.action)
    conds.push(
      f.action.endsWith(".")
        ? sql`${schema.auditLog.action} like ${f.action + "%"}`
        : eq(schema.auditLog.action, f.action),
    );
  if (f.targetType) conds.push(eq(schema.auditLog.targetType, f.targetType));
  if (f.targetId) conds.push(eq(schema.auditLog.targetId, f.targetId));
  if (f.from) conds.push(gte(schema.auditLog.createdAt, f.from));
  if (f.to) conds.push(lte(schema.auditLog.createdAt, f.to));
  const rows = await db()
    .select()
    .from(schema.auditLog)
    .where(and(...conds))
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  return { rows: page, next: more ? encodeCursor(page[page.length - 1]!) : null };
}

/** The distinct actors and action prefixes in a workspace's log, for the filter controls. */
export async function activityFacets(workspaceId: string) {
  const [actors, actions] = await Promise.all([
    db()
      .selectDistinct({ label: schema.auditLog.actorLabel })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.workspaceId, workspaceId))
      .orderBy(schema.auditLog.actorLabel)
      .limit(100),
    db()
      .selectDistinct({ action: schema.auditLog.action })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.workspaceId, workspaceId))
      .orderBy(schema.auditLog.action)
      .limit(200),
  ]);
  return { actors: actors.map((a) => a.label), actions: actions.map((a) => a.action) };
}

/** "booking.cancelled" → "Booking cancelled"; "settings.general.updated" → "Settings general updated". */
export const describeAction = (action: string) => {
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/* ---------------- Retention ---------------- */

/** Days a workspace's log is kept on its plan (null = forever; self-hosted). */
export const auditRetentionDays = (ws: Pick<Workspace, "plan" | "planStatus">) =>
  limitsFor(ws.plan, ws.planStatus).auditRetentionDays;

/**
 * Removes entries older than each plan's retention (called from the tick). Entries of deleted
 * workspaces no longer have a plan to read, so they get the longest paid retention.
 */
export async function sweepAuditLog(now = new Date()): Promise<number> {
  const plans = await db()
    .select({
      id: schema.workspaces.id,
      plan: schema.workspaces.plan,
      status: schema.workspaces.planStatus,
    })
    .from(schema.workspaces);
  const byDays = new Map<number, string[]>();
  for (const w of plans) {
    const days = limitsFor(w.plan, w.status).auditRetentionDays;
    if (days === null) continue;
    byDays.set(days, [...(byDays.get(days) ?? []), w.id]);
  }
  let removed = 0;
  const cutoff = (days: number) => new Date(now.getTime() - days * 86_400_000);
  for (const [days, ids] of byDays) {
    const r = await db()
      .delete(schema.auditLog)
      .where(
        and(inArray(schema.auditLog.workspaceId, ids), lt(schema.auditLog.createdAt, cutoff(days))),
      )
      .returning({ id: schema.auditLog.id });
    removed += r.length;
  }
  // Orphans (workspace deleted): keep for the longest paid retention, then drop.
  const longest = Math.max(...Object.values(PLANS).map((p) => p.limits.auditRetentionDays ?? 0));
  const known = plans.map((w) => w.id);
  const orphans = await db()
    .delete(schema.auditLog)
    .where(
      and(
        known.length ? sql`${schema.auditLog.workspaceId} not in ${known}` : sql`true`,
        lt(schema.auditLog.createdAt, cutoff(longest)),
      ),
    )
    .returning({ id: schema.auditLog.id });
  return removed + orphans.length;
}
