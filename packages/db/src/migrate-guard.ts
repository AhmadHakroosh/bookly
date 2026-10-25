import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Migrations never reach a shared environment's database from a developer's machine.
 *
 * The maintainer keeps the cloud environments' variables in git-ignored files at the repo root
 * (`.env.cloud.staging`, `.env.cloud.preview`, `.env.cloud`). If `pnpm db:migrate` is pointed at
 * the database one of them names, a v2 branch's migrations would land on staging (or worse), so it
 * stops. Vercel builds (`VERCEL`) and CI (`CI`) migrate those databases on purpose and are not
 * checked; `BOOKLY_MIGRATE_SHARED=1` is the explicit override. Self-hosters have none of these
 * files, so nothing changes for them. A Neon branch has its own endpoint, so migrating a branch of
 * staging (`pnpm local:https db migrate`) passes.
 */
export const SHARED_ENV_FILES = [".env.cloud.staging", ".env.cloud.preview", ".env.cloud"];

/** host/database, with Neon's `-pooler` endpoint suffix folded so pooled and direct URLs match. */
export function databaseKey(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.");
    return `${host}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`;
  } catch {
    return null;
  }
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|postgres|host\.docker\.internal)$/;

/** The shared environment whose database `url` points at, or null. Never returns the URL itself. */
export function sharedEnvironmentFor(
  url: string | undefined,
  files: Record<string, string | undefined>,
): string | null {
  const key = databaseKey(url);
  if (!key || LOOPBACK.test(key.split("/")[0]!)) return null;
  for (const [file, shared] of Object.entries(files)) if (databaseKey(shared) === key) return file;
  return null;
}

/** Reads DATABASE_URL from each shared environment file present under `root`. */
export function sharedDatabaseUrls(root: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const file of SHARED_ENV_FILES) {
    const p = path.join(root, file);
    if (!existsSync(p)) continue;
    try {
      out[file] = parseEnv(readFileSync(p, "utf8")).DATABASE_URL;
    } catch {
      // An unreadable file protects nothing; the others still count.
    }
  }
  return out;
}

/** Throws when this run would migrate a shared environment's database from a developer machine. */
export function assertMigrationTargetAllowed(
  root: string,
  source: NodeJS.ProcessEnv = process.env,
): void {
  if (source.VERCEL || source.CI || source.BOOKLY_MIGRATE_SHARED === "1") return;
  const file = sharedEnvironmentFor(source.DATABASE_URL, sharedDatabaseUrls(root));
  if (!file) return;
  throw new Error(
    `Refusing to migrate: DATABASE_URL is the database named in ${file}, a shared environment. ` +
      `Deploys migrate it (Vercel build, release workflow). For local work use a branch of it ` +
      `(pnpm local:https db branch, then pnpm local:https db migrate). ` +
      `If you really mean it: BOOKLY_MIGRATE_SHARED=1 pnpm db:migrate`,
  );
}
