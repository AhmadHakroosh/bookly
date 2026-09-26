import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Minimal QStash client over its REST API (no SDK). Publishes a JSON message to a URL, with an
 * optional delay and deduplication id; upserts cron schedules; reads the dead-letter queue.
 */
export type QstashConfig = { url: string; token: string; fetchImpl?: typeof fetch };

export type PublishOptions = {
  delaySeconds?: number;
  /** Same id within QStash's window → published once. */
  dedupeId?: string;
  retries?: number;
};

async function call(cfg: QstashConfig, path: string, init: RequestInit = {}) {
  const res = await (cfg.fetchImpl ?? fetch)(`${cfg.url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${cfg.token}`, ...(init.headers as Record<string, string>) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`qstash ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function publish(
  cfg: QstashConfig,
  destination: string,
  body: unknown,
  opts: PublishOptions = {},
): Promise<{ messageId: string; deduplicated?: boolean }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "upstash-method": "POST",
    "upstash-retries": String(opts.retries ?? 5),
  };
  if (opts.delaySeconds && opts.delaySeconds > 0)
    headers["upstash-delay"] = `${Math.ceil(opts.delaySeconds)}s`;
  // QStash allows only [A-Za-z0-9_-] in deduplication ids.
  if (opts.dedupeId)
    headers["upstash-deduplication-id"] = opts.dedupeId.replace(/[^A-Za-z0-9_-]/g, "-");
  const res = await call(cfg, `/v2/publish/${destination}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return (await res.json()) as { messageId: string; deduplicated?: boolean };
}

export type Schedule = { scheduleId: string; cron: string; destination: string };

/** Create or replace a schedule with a fixed id, so repeated boots are idempotent. */
export async function upsertSchedule(
  cfg: QstashConfig,
  s: Schedule,
  body: unknown = {},
): Promise<void> {
  await call(cfg, `/v2/schedules/${s.destination}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-cron": s.cron,
      "upstash-schedule-id": s.scheduleId,
      "upstash-method": "POST",
      "upstash-retries": "3",
    },
    body: JSON.stringify(body),
  });
}

export async function listSchedules(cfg: QstashConfig): Promise<Schedule[]> {
  const res = await call(cfg, "/v2/schedules");
  const rows = (await res.json()) as { scheduleId: string; cron: string; destination: string }[];
  return rows.map((r) => ({ scheduleId: r.scheduleId, cron: r.cron, destination: r.destination }));
}

export async function deleteSchedule(cfg: QstashConfig, scheduleId: string): Promise<void> {
  await call(cfg, `/v2/schedules/${scheduleId}`, { method: "DELETE" });
}

/** Messages that exhausted their retries. */
export async function dlqCount(cfg: QstashConfig): Promise<number> {
  const res = await call(cfg, "/v2/dlq?count=100");
  const data = (await res.json()) as { messages?: unknown[] };
  return data.messages?.length ?? 0;
}

/* ---------------- Signature verification ---------------- */

const b64url = (buf: Buffer) => buf.toString("base64url");

/**
 * Verifies the `Upstash-Signature` JWT (HS256) against the current, then the next signing key.
 * Checks expiry and that the `body` claim is the SHA-256 of the received body. Pure: no I/O.
 */
export function verifyQstashSignature(
  signature: string | null,
  body: string,
  keys: { current: string; next?: string },
  now = Date.now(),
): { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string } {
  if (!signature) return { ok: false, reason: "missing signature" };
  const parts = signature.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts as [string, string, string];
  const data = `${h}.${p}`;
  const matches = [keys.current, keys.next].filter(Boolean).some((k) => {
    const expected = createHmac("sha256", k!).update(data).digest();
    const given = Buffer.from(s, "base64url");
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!matches) return { ok: false, reason: "bad signature" };
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "bad claims" };
  }
  if (claims.iss !== "Upstash") return { ok: false, reason: "bad issuer" };
  if (typeof claims.exp === "number" && claims.exp * 1000 < now)
    return { ok: false, reason: "expired" };
  const bodyHash = b64url(createHash("sha256").update(body).digest());
  if (trimPadding(String(claims.body ?? "")) !== trimPadding(bodyHash))
    return { ok: false, reason: "body hash mismatch" };
  return { ok: true, claims };
}

/** Drops trailing `=` padding; a loop rather than `/=+$/`, which backtracks on long inputs. */
function trimPadding(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === "=") end--;
  return s.slice(0, end);
}

/** Test helper: mint a signature the way QStash does. */
export function signForTests(body: string, key: string, claims: Record<string, unknown> = {}) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        iss: "Upstash",
        exp: Math.floor(Date.now() / 1000) + 300,
        body: b64url(createHash("sha256").update(body).digest()),
        ...claims,
      }),
    ),
  );
  const sig = b64url(createHmac("sha256", key).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
