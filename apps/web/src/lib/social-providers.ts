/**
 * Social sign-in providers (Google, Microsoft, GitHub). A provider is offered on the sign-in
 * and sign-up pages when its OAuth client is configured; nothing is required for a self-hosted
 * install, which keeps working with passwords and email links alone.
 *
 * Sign-in only ever asks for identity (name, email, avatar). Calendar access stays a separate
 * "Connect" step under Admin → Calendars, with its own consent and scopes.
 */
export type SocialProviderId = "google" | "microsoft" | "github";

export type SocialProvider = { id: SocialProviderId; label: string };

export const SOCIAL_PROVIDERS: readonly SocialProvider[] = [
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
  { id: "github", label: "GitHub" },
];

/** Providers verify the email address they hand us, so an existing account can be linked on first sign-in. */
export const TRUSTED_SOCIAL_PROVIDERS: SocialProviderId[] = ["google", "microsoft"];

type Keys = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

/** The providers whose client id and secret are both set, in display order. */
export function configuredSocialProviders(env: Keys): SocialProvider[] {
  const has = (id: SocialProviderId) => {
    const p = id.toUpperCase() as "GOOGLE" | "MICROSOFT" | "GITHUB";
    return !!(env[`${p}_CLIENT_ID`] && env[`${p}_CLIENT_SECRET`]);
  };
  return SOCIAL_PROVIDERS.filter((p) => has(p.id));
}

export function socialProviderLabel(id: string): string {
  return SOCIAL_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/**
 * Error codes Better Auth appends to the error callback URL (`?error=`), turned into a sentence.
 * `cloud` picks the wording for public sign-up; a self-hosted install only admits invited people.
 */
export function socialErrorMessage(code: string, provider: string, cloud: boolean): string {
  const name = socialProviderLabel(provider);
  switch (code) {
    case "signup_disabled":
      return cloud
        ? `No Bookly account uses that ${name} address yet. Create one from the sign-up page first.`
        : "Sign-up is closed. Ask the workspace owner for an invitation.";
    case "signup_closed":
      return "Sign-up is closed. Ask the workspace owner for an invitation.";
    case "consent_required":
      return "Accept the terms of service and privacy policy to create an account.";
    case "account_not_linked":
      return `An account with this email already exists. Sign in with your password or an email link, then connect ${name} under Booking page → Sign-in methods.`;
    case "email_not_found":
      return `${name} did not share an email address. Use another way to sign in.`;
    case "email_doesnt_match":
      return `That ${name} account uses a different email address than your Bookly account.`;
    case "account_already_linked_to_different_user":
      return `That ${name} account is already connected to another Bookly account.`;
    case "access_denied":
      return "Sign-in was cancelled.";
    default:
      return `Could not sign in with ${name}. Try again or use another method.`;
  }
}
