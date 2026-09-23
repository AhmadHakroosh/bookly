import "server-only";
import { headers } from "next/headers";
import { isCountryCode } from "@/lib/phone";

/**
 * The visitor's country for defaults such as the phone country code. Edge networks put it in a
 * header (Vercel, Cloudflare, or a proxy you configure); otherwise the browser's language
 * region is the best hint. Never used for anything but a preselected value.
 */
export async function detectCountry(fallback = "US"): Promise<string> {
  const h = await headers();
  for (const name of ["x-vercel-ip-country", "cf-ipcountry", "x-country-code"]) {
    const v = h.get(name)?.trim().toUpperCase();
    if (isCountryCode(v)) return v;
  }
  const lang = h.get("accept-language") ?? "";
  const m = /^[a-z]{2,3}-([A-Za-z]{2})/.exec(lang.split(",")[0]?.trim() ?? "");
  const region = m?.[1]?.toUpperCase();
  return isCountryCode(region) ? region : fallback;
}
