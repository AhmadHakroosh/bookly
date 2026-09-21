import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull, schema } from "@bookly/db";
import type { ApiKey, ApiScope, Booking, EventType, Profile, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { apiBudget } from "@bookly/cloud";
import { hasFeature, workspaceLimits } from "./limits";
import { recurrenceOf } from "./recurrence";
import { baseUrl, locationLabel } from "./scheduling";
import { getCurrentWorkspace } from "./workspace";

/* ---------------- Keys ---------------- */

export function generateApiKey() {
  const raw = `bk_${randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 10), hash: hashKey(raw) };
}
export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function authenticateKey(req: Request, workspaceId: string): Promise<ApiKey | null> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (new URL(req.url).searchParams.get("api_key") ?? "");
  if (!raw.startsWith("bk_")) return null;
  const key = await db().query.apiKeys.findFirst({
    where: and(
      eq(schema.apiKeys.keyHash, hashKey(raw)),
      eq(schema.apiKeys.workspaceId, workspaceId),
      isNull(schema.apiKeys.revokedAt),
    ),
  });
  if (!key) return null;
  void db()
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, key.id))
    .catch(() => {});
  return key;
}

/* ---------------- Rate limiting (per instance) ---------------- */

const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(id: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || b.reset < now) {
    buckets.set(id, { n: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, reset: now + windowMs };
  }
  b.n++;
  return { ok: b.n <= limit, remaining: Math.max(0, limit - b.n), reset: b.reset };
}

/* ---------------- Responses ---------------- */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function json(
  data: unknown,
  init: { status?: number; headers?: Record<string, string>; meta?: Record<string, unknown> } = {},
) {
  const body = init.meta ? { data, meta: init.meta } : { data };
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...CORS, ...(init.headers ?? {}) },
  });
}
export function apiError(message: string, status: number, code = "error") {
  return NextResponse.json({ error: { code, message } }, { status, headers: CORS });
}
export const options = () => new NextResponse(null, { status: 204, headers: CORS });

/** Parses a JSON body, returning an API error response when it is not an object. */
export async function readJson(req: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const v = (await req.json()) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v))
      return apiError("Body must be a JSON object", 400, "bad_request");
    return v as Record<string, unknown>;
  } catch {
    return apiError("Body must be valid JSON", 400, "bad_request");
  }
}

/**
 * Resolves the workspace and applies rate limits. `scope` makes the route require a key with
 * that scope. Public routes (no scope) accept an optional key to lift the anonymous limit.
 */
export async function apiContext(
  req: Request,
  scope?: ApiScope,
): Promise<{ workspace: Workspace; key: ApiKey | null } | NextResponse> {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return apiError("Unknown workspace", 404, "unknown_workspace");
  if (workspace.suspendedAt) return apiError("Workspace suspended", 403, "suspended");
  const key = await authenticateKey(req, workspace.id);
  if (scope) {
    if (!hasFeature(workspace, "api"))
      return apiError("The API needs the Pro plan", 402, "upgrade_required");
    if (!key) return apiError("An API key with the required scope is needed", 401, "unauthorized");
    if (!key.scopes.includes(scope)) return apiError(`Missing scope ${scope}`, 403, "forbidden");
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = key
    ? rateLimit(`key:${key.id}`, apiBudget(workspaceLimits(workspace)))
    : rateLimit(`ip:${workspace.id}:${ip}`, 60);
  if (!rl.ok) return apiError("Rate limit exceeded", 429, "rate_limited");
  return { workspace, key };
}

/* ---------------- Serializers ---------------- */

export function serializeEventType(e: EventType, host: Pick<Profile, "username" | "displayName">) {
  return {
    id: e.id,
    slug: e.slug,
    url: `${baseUrl()}/${host.username}/${e.slug}`,
    title: e.title,
    description: e.description,
    durationMin: e.durationMin,
    minNoticeMin: e.minNoticeMin,
    maxDaysAhead: e.maxDaysAhead,
    location: { type: e.location.type, label: locationLabel(e.location) },
    questions: e.questions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      required: q.required,
      options: q.options ?? null,
    })),
    requiresConfirmation: e.requiresConfirmation,
    hidden: e.hidden,
    seats: e.seats,
    recurrence: recurrenceOf(e.recurrence),
    price: e.priceCents != null ? { cents: e.priceCents, currency: e.currency } : null,
    host: { username: host.username, name: host.displayName },
  };
}

export function serializeBooking(
  b: Booking,
  extra: { eventType?: Pick<EventType, "id" | "slug" | "title"> | null } = {},
) {
  return {
    id: b.id,
    status: b.status,
    start: b.startAt.toISOString(),
    end: b.endAt.toISOString(),
    timezone: b.timezone,
    attendee: { name: b.attendeeName, email: b.attendeeEmail, phone: b.attendeePhone },
    notes: b.notes,
    answers: b.answers,
    location: { type: b.location.type, label: locationLabel(b.location) },
    meetingUrl: b.meetingUrl,
    manageUrl: `${baseUrl()}/booking/${b.manageToken}`,
    eventType: extra.eventType
      ? { id: extra.eventType.id, slug: extra.eventType.slug, title: extra.eventType.title }
      : b.eventTypeId
        ? { id: b.eventTypeId }
        : null,
    payment:
      b.paymentStatus && b.amountCents != null
        ? { status: b.paymentStatus, amountCents: b.amountCents, currency: b.currency }
        : null,
    rescheduledFromId: b.rescheduledFromId,
    series: b.seriesId ? { id: b.seriesId, index: b.seriesIndex, count: b.seriesCount } : null,
    cancelledBy: b.cancelledBy,
    cancelReason: b.cancelReason,
    createdAt: b.createdAt.toISOString(),
  };
}
