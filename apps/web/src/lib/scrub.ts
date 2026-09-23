const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Replaces email addresses and phone numbers in free text with placeholders. A "phone" is a run
 * of at least eight digits with the usual separators, which leaves ids, dates and small numbers.
 */
export function scrubPii(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(PHONE, (m) => (ISO_DATE.test(m) || m.replace(/\D/g, "").length < 8 ? m : "[phone]"));
}

/**
 * Walks an error-report payload (Sentry event, breadcrumb) and scrubs every string in it, so
 * attendee emails and phone numbers never reach the error tracker even when they appear in a
 * message, a URL or request data. Cycles and non-plain objects are left alone.
 */
export function scrubDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return scrubPii(value) as T;
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, seen)) as T;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, seen);
  return out as T;
}
