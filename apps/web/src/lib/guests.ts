/**
 * The "bring colleagues" field on the booking form: one address per line or separated by
 * commas. Addresses are lowercased and deduplicated; the attendee's own address is dropped.
 */
export type ParsedGuests = { guests: string[]; invalid: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseGuests(
  raw: string | string[] | null | undefined,
  opts: { exclude?: string | null } = {},
): ParsedGuests {
  const parts = (Array.isArray(raw) ? raw : (raw ?? "").split(/[\n,;]+/))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const own = opts.exclude?.trim().toLowerCase();
  const guests: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!EMAIL.test(p) || p.length > 254) invalid.push(p);
    else if (p !== own && !guests.includes(p)) guests.push(p);
  }
  return { guests, invalid };
}
