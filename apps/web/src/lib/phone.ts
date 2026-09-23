import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/** Phone numbers as attendees type them: a country plus a national number, stored as E.164. */

export type CountryOption = { code: CountryCode; name: string; calling: string; flag: string };

/** Regional indicator symbols: "US" → 🇺🇸. */
export const flagEmoji = (code: string) =>
  code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));

let cache: { locale: string; list: CountryOption[] } | null = null;

/** Every country the library knows, named in `locale`, sorted by name. */
export function countryOptions(locale = "en"): CountryOption[] {
  if (cache?.locale === locale) return cache.list;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  const list = getCountries()
    .map((code) => ({
      code,
      name: names?.of(code) ?? code,
      calling: `+${getCountryCallingCode(code)}`,
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  cache = { locale, list };
  return list;
}

export const isCountryCode = (c: string | null | undefined): c is CountryCode =>
  !!c && (getCountries() as string[]).includes(c.toUpperCase());

/** A valid E.164 number from what the attendee typed, or null. */
export function toE164(input: string, country?: string | null): string | null {
  const p = parsePhoneNumberFromString(
    input.trim(),
    isCountryCode(country) ? (country.toUpperCase() as CountryCode) : undefined,
  );
  return p?.isValid() ? p.number : null;
}

/** "+1 201 555 0123" for display; anything unparseable comes back unchanged. */
export function formatPhone(value: string): string {
  const p = parsePhoneNumberFromString(value);
  return p ? p.formatInternational() : value;
}

/** Whether a stored location value is an attendee's phone number rather than a host note. */
export const looksLikePhone = (value: string | undefined | null) =>
  !!value && /^\+\d{6,}$/.test(value.replace(/[\s()-]/g, ""));
