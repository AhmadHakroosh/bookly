import "server-only";
import { cookies } from "next/headers";
import { loadEnv } from "@bookly/config";

/**
 * Cloud sign-up must record acceptance of the terms and privacy policy. The email form sends it
 * with the account fields; a social sign-up leaves the site for the provider, so the accepted
 * legal version travels in a short-lived cookie that the user-creation hook reads back.
 */
export const CONSENT_COOKIE = "bookly_consent";

/** Cookie attributes shared with Better Auth's own cookies so the platform host sees a cookie set on a tenant host. */
export function consentCookieOptions() {
  const env = loadEnv();
  const root = env.ROOT_DOMAIN?.split(":")[0];
  const domain = env.TENANCY === "multi" && root && root.includes(".") ? `.${root}` : undefined;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.APP_URL.startsWith("https"),
    path: "/",
    maxAge: 10 * 60,
    ...(domain ? { domain } : {}),
  };
}

/** Remembers, for ten minutes, that the person accepted the legal terms before leaving for the provider. */
export async function rememberConsent(version: string) {
  (await cookies()).set(CONSENT_COOKIE, version, consentCookieOptions());
}
