import "server-only";
import { loadEnv } from "@bookly/config";

/**
 * Fixed-window rate limiting behind one interface. Memory for a single process (self-host),
 * Upstash Redis over REST when configured, so every instance on Vercel shares the same counts.
 */
export type LimitResult = { ok: boolean; remaining: number; reset: number };

export interface Limiter {
  readonly name: "memory" | "upstash";
  hit(id: string, max: number, windowMs: number): Promise<LimitResult>;
  /** Small KV for Better Auth's limiter and anything else that needs shared, expiring state. */
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic get-then-delete. */
  getDel(key: string): Promise<string | null>;
  /** Atomic increment; the TTL (seconds) is applied only when the key is created. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
}

/* ---------------- Memory ---------------- */

export function memoryLimiter(): Limiter {
  const buckets = new Map<string, { n: number; reset: number }>();
  const kv = new Map<string, { v: string; exp: number }>();
  return {
    name: "memory",
    async hit(id, max, windowMs) {
      const now = Date.now();
      const b = buckets.get(id);
      if (!b || b.reset < now) {
        buckets.set(id, { n: 1, reset: now + windowMs });
        return { ok: true, remaining: max - 1, reset: now + windowMs };
      }
      b.n++;
      return { ok: b.n <= max, remaining: Math.max(0, max - b.n), reset: b.reset };
    },
    async get(key) {
      const e = kv.get(key);
      if (!e) return null;
      if (e.exp && e.exp < Date.now()) {
        kv.delete(key);
        return null;
      }
      return e.v;
    },
    async set(key, value, ttlSeconds) {
      kv.set(key, { v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    },
    async del(key) {
      kv.delete(key);
    },
    async getDel(key) {
      const v = await this.get(key);
      kv.delete(key);
      return v;
    },
    async incr(key, ttlSeconds) {
      const now = Date.now();
      const e = kv.get(key);
      if (!e || (e.exp && e.exp < now)) {
        kv.set(key, { v: "1", exp: now + ttlSeconds * 1000 });
        return 1;
      }
      const n = Number(e.v) + 1;
      e.v = String(n);
      return n;
    },
    async ping() {
      return true;
    },
  };
}

/* ---------------- Upstash (REST) ---------------- */

type Cmd = (string | number)[];

/**
 * Talks to Upstash's REST API directly (no SDK): one `/pipeline` POST per call. A limiter
 * call is INCR + PEXPIRE NX + PTTL, atomic enough for a fixed window; keys expire on their own.
 */
export function upstashLimiter(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Limiter {
  const base = url.replace(/\/$/, "");
  async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
    const res = await fetchImpl(`${base}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const rows = (await res.json()) as { result?: unknown; error?: string }[];
    return rows.map((r) => {
      if (r.error) throw new Error(r.error);
      return r.result;
    });
  }
  const prefix = "bookly:rl:";
  return {
    name: "upstash",
    async hit(id, max, windowMs) {
      const key = prefix + id;
      const [n, , ttl] = await pipeline([
        ["INCR", key],
        ["PEXPIRE", key, windowMs, "NX"],
        ["PTTL", key],
      ]);
      const count = Number(n);
      const left = Number(ttl);
      return {
        ok: count <= max,
        remaining: Math.max(0, max - count),
        reset: Date.now() + (left > 0 ? left : windowMs),
      };
    },
    async get(key) {
      const [v] = await pipeline([["GET", prefix + key]]);
      return v == null ? null : String(v);
    },
    async set(key, value, ttlSeconds) {
      await pipeline([
        ttlSeconds ? ["SET", prefix + key, value, "EX", ttlSeconds] : ["SET", prefix + key, value],
      ]);
    },
    async del(key) {
      await pipeline([["DEL", prefix + key]]);
    },
    async getDel(key) {
      const [v] = await pipeline([["GETDEL", prefix + key]]);
      return v == null ? null : String(v);
    },
    async incr(key, ttlSeconds) {
      const [n] = await pipeline([
        ["INCR", prefix + key],
        ["EXPIRE", prefix + key, ttlSeconds, "NX"],
      ]);
      return Number(n);
    },
    async ping() {
      try {
        const [r] = await pipeline([["PING"]]);
        return r === "PONG";
      } catch {
        return false;
      }
    },
  };
}

/* ---------------- Selection ---------------- */

let limiter: Limiter | undefined;

/** Upstash when configured, otherwise memory. Chosen once per process. */
export function getLimiter(): Limiter {
  if (limiter) return limiter;
  const env = loadEnv();
  limiter =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? upstashLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
      : memoryLimiter();
  return limiter;
}

/** Test seam. */
export function setLimiter(l: Limiter | undefined) {
  limiter = l;
}

/**
 * Count a hit against `id` and say whether it is still within `max` per window. If the shared
 * store is unreachable the request is allowed and the failure logged: a flaky limiter must not
 * take bookings down.
 */
export async function rateLimit(id: string, max: number, windowMs = 60_000): Promise<LimitResult> {
  try {
    return await getLimiter().hit(id, max, windowMs);
  } catch (e) {
    console.error(
      "[ratelimit] store unreachable, allowing request",
      e instanceof Error ? e.message : e,
    );
    return { ok: true, remaining: max, reset: Date.now() + windowMs };
  }
}

/** Better Auth `secondaryStorage` over the same store (used for its sign-in rate limiter). */
export function authStorage() {
  const l = getLimiter();
  return {
    get: (key: string) => l.get(`auth:${key}`),
    set: async (key: string, value: string, ttl?: number) => l.set(`auth:${key}`, value, ttl),
    delete: (key: string) => l.del(`auth:${key}`),
    getAndDelete: (key: string) => l.getDel(`auth:${key}`),
    increment: (key: string, ttl: number) => l.incr(`auth:${key}`, ttl),
  };
}
