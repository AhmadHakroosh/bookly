/**
 * The WebAuthn relying-party id a passkey is bound to. In cloud mode it is the root domain, so
 * one passkey registered on a workspace host (`acme.bookly-app.io`) also signs in on the
 * platform host and every other subdomain: WebAuthn accepts any origin whose host is the rp id
 * or a subdomain of it. Self-hosted installs use the app's own host. Ports never belong in it.
 */
export function passkeyRpId(env: { TENANCY: string; ROOT_DOMAIN?: string; APP_URL: string }) {
  if (env.TENANCY === "multi" && env.ROOT_DOMAIN) return env.ROOT_DOMAIN.split(":")[0]!;
  return new URL(env.APP_URL).hostname;
}

/** The person closed the browser's passkey prompt: nothing to report. */
export function dismissed(error: { code?: string; message?: string }) {
  return error.code === "NotAllowedError" || /NotAllowed|cancel/i.test(error.message ?? "");
}
