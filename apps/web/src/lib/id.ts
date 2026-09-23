/**
 * Short random ids for client-side lists (rules, questions). `crypto.randomUUID` needs a secure
 * context, which a plain-http host on a LAN or a dev domain is not; `getRandomValues` works
 * everywhere, with a time-based fallback for very old runtimes.
 */
export function shortId(length = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(length);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, length);
}
