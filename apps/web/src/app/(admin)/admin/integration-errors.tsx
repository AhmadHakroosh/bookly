import Link from "next/link";

/** What the `?error=` codes from the OAuth start and callback routes mean to a host. */
export const INTEGRATION_ERRORS: Record<string, string> = {
  not_configured: "That provider is not set up on this server.",
  state: "The sign-in link expired. Please try again.",
  mismatch: "Please sign in with the same account you started from.",
  exchange: "The provider rejected the connection. Check the OAuth app settings and try again.",
  access_denied: "You cancelled the connection.",
  limit: "Your plan's limit on connected accounts per member is reached.",
};

/** The error banner for the Calendars and Conferencing pages; plan limits link to Billing. */
export function IntegrationError({ code }: { code: string | undefined }) {
  if (!code) return null;
  return (
    <p className="rounded-md border border-destructive/40 p-3 text-sm">
      {INTEGRATION_ERRORS[code] ?? `Connection failed (${code}). Please try again.`}
      {code === "limit" && (
        <>
          {" "}
          <Link href="/admin/billing" className="underline underline-offset-4">
            See plans
          </Link>
        </>
      )}
    </p>
  );
}
