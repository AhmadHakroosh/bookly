/**
 * Pure helpers for abuse controls: the workspace blocklist and request-throttle keys.
 * The in-memory limiter itself lives in `api.ts`.
 */

/** Parses the settings textarea: one email or @domain per line, case-insensitive. */
export function parseBlocklist(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length <= 200),
    ),
  ].slice(0, 500);
}

/** True when `email` matches an entry: exact address, or `@domain` for the whole domain. */
export function isBlocked(email: string, list: readonly string[] | undefined): boolean {
  if (!list?.length) return false;
  const e = email.trim().toLowerCase();
  const domain = e.slice(e.indexOf("@"));
  return list.some((x) => (x.startsWith("@") ? x === domain : x === e));
}

export const PUBLIC_FORM_LIMIT = { max: 10, windowMs: 10 * 60_000 };
