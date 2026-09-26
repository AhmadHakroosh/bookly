import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink, organization } from "better-auth/plugins";
import { loadEnv } from "@bookly/config";
import { schema } from "@bookly/db";
import { sendEmail } from "@bookly/email";
import { db } from "./db";
import { authStorage, getLimiter } from "@/server/ratelimit";
import { CONSENT_COOKIE, consentCookieOptions } from "@/server/consent";
import { configuredSocialProviders, TRUSTED_SOCIAL_PROVIDERS } from "@/lib/social-providers";

const env = loadEnv();

/**
 * Social sign-in asks the provider for identity only (name, email, picture). Calendar access is
 * a separate connection under Admin → Calendars with its own scopes, so the two never mix.
 * Sign-in never creates an account by itself: the sign-up and invitation pages ask for one
 * explicitly (`requestSignUp`), which keeps the consent and invitation rules below in force.
 */
function socialProviders() {
  const configured = new Set(configuredSocialProviders(env).map((p) => p.id));
  return {
    ...(configured.has("google") && {
      google: {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account" as const,
        disableImplicitSignUp: true,
      },
    }),
    ...(configured.has("microsoft") && {
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID!,
        clientSecret: env.MICROSOFT_CLIENT_SECRET!,
        tenantId: env.MICROSOFT_TENANT,
        prompt: "select_account" as const,
        disableImplicitSignUp: true,
      },
    }),
    ...(configured.has("github") && {
      github: {
        clientId: env.GITHUB_CLIENT_ID!,
        clientSecret: env.GITHUB_CLIENT_SECRET!,
        disableImplicitSignUp: true,
      },
    }),
  };
}

const isSocialSignUp = (path: string | undefined) => !!path?.startsWith("/callback");

async function hasPendingInvitation(email: string): Promise<boolean> {
  const pending = await db().query.invitations.findFirst({
    where: (t, { and, eq, gt }) =>
      and(eq(t.email, email.toLowerCase()), eq(t.status, "pending"), gt(t.expiresAt, new Date())),
    columns: { id: true },
  });
  return !!pending;
}

/**
 * Auth for workspace owners, editors and (later) paying members.
 * - email + password and magic links work everywhere (self-host needs no third party)
 * - Google, Microsoft and GitHub sign-in when their OAuth clients are configured
 * - organizations = the ownership/membership layer for workspaces (one workspace per org)
 * - admin plugin = platform operator tools (cloud mode)
 */
export const auth = betterAuth({
  appName: "Bookly",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: env.ROOT_DOMAIN
    ? [`https://*.${env.ROOT_DOMAIN}`, `http://*.${env.ROOT_DOMAIN}`]
    : [],
  database: drizzleAdapter(db(), { provider: "pg", schema, usePlural: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Cloud: a password account is usable only once the address is verified. Better Auth 1.7
    // deletes every account of an *unverified* user the first time they sign in with a magic
    // link (the "unproven account" rule), which took people's passwords away; verifying at
    // sign-up is what makes a password account proven. Self-hosted installs verify by other
    // means: the first owner controls the install, invitees came from an invitation email.
    requireEmailVerification: env.TENANCY === "multi",
    sendResetPassword: async ({ user, url }) => {
      const { accountMail } = await import("@/emails/account");
      await sendEmail({
        to: user.email,
        ...(await accountMail({
          subject: "Reset your Bookly password",
          title: "Reset your password",
          body: `Hi ${user.name || "there"},\n\nSomeone asked to reset the password for this account. If that was you, use the button below; the link expires in one hour.`,
          cta: { href: url, label: "Choose a new password" },
          note: "If you didn't request this, you can ignore this email.",
        })),
      });
    },
  },
  socialProviders: socialProviders(),
  account: {
    accountLinking: {
      // Google and Microsoft vouch for the email they return, so their sign-in attaches to the
      // existing account with that address (once that account's own email is verified, which a
      // magic-link sign-in does). GitHub addresses are linked only from the profile page.
      trustedProviders: TRUSTED_SOCIAL_PROVIDERS,
    },
  },
  emailVerification: {
    sendOnSignUp: env.TENANCY === "multi",
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      if (user.emailVerified) return; // invited users are verified by the invitation itself
      const { accountMail } = await import("@/emails/account");
      await sendEmail({
        to: user.email,
        ...(await accountMail({
          subject: "Verify your email for Bookly",
          title: "Confirm your email address",
          body: `Hi ${user.name || "there"},\n\nUse the button below to confirm that this address is yours. The link works for one hour.`,
          cta: { href: url, label: "Confirm my email" },
          note: "If you didn't create a Bookly account, you can ignore this email.",
        })),
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Sessions stay in Postgres; secondary storage below is only for the sign-in rate limiter.
    storeSessionInDatabase: true,
  },
  // With Upstash configured every instance shares sign-in attempt counts; otherwise per process.
  ...(getLimiter().name === "upstash"
    ? { secondaryStorage: authStorage(), rateLimit: { storage: "secondary-storage" as const } }
    : {}),
  user: {
    additionalFields: {
      consentAt: { type: "date", required: false, input: true },
      consentVersion: { type: "string", required: false, input: true },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // Cloud: public sign-up must record acceptance of the terms and privacy policy. An
          // invited person reached the form through an email to this address, which verifies it.
          if (env.TENANCY === "multi" && ctx?.path === "/sign-up/email") {
            const u = user as typeof user & { consentAt?: Date | string | null };
            if (!u.consentAt)
              throw new APIError("BAD_REQUEST", {
                code: "consent_required",
                message: "Please accept the terms of service and privacy policy.",
              });
            const invited = await hasPendingInvitation(user.email);
            return {
              data: {
                ...user,
                consentAt: new Date(u.consentAt),
                ...(invited && { emailVerified: true }),
              },
            };
          }
          // Cloud, social sign-up: the sign-up page stored the accepted legal version in a cookie
          // before sending the person to the provider. Without it there is no consent on record.
          if (env.TENANCY === "multi" && isSocialSignUp(ctx?.path)) {
            const version = ctx?.getCookie(CONSENT_COOKIE);
            if (!version)
              throw new APIError("BAD_REQUEST", {
                code: "consent_required",
                message: "Please accept the terms of service and privacy policy.",
              });
            ctx?.setCookie(CONSENT_COOKIE, "", { ...consentCookieOptions(), maxAge: 0 });
            return { data: { ...user, consentAt: new Date(), consentVersion: version } };
          }
          // Single-tenant: once the workspace exists, only invitations may add accounts (public sign-up is closed).
          if (env.TENANCY !== "single") return;
          const workspace = await db().query.workspaces.findFirst({ columns: { id: true } });
          // First run: the setup wizard creates the owner, who controls the install. Invitees
          // arrived through an email to their address. Both count as a verified address.
          if (!workspace) return { data: { ...user, emailVerified: true } };
          const invited =
            (await hasPendingInvitation(user.email)) || ctx?.path?.includes("invitation");
          if (!invited)
            throw new APIError("FORBIDDEN", {
              code: "signup_closed",
              message: "Sign-up is closed. Ask the workspace owner for an invitation.",
            });
          return { data: { ...user, emailVerified: true } };
        },
      },
    },
  },
  advanced: {
    // Browsers reject a cookie domain without a dot (e.g. "localhost"), so local cloud-mode
    // runs on plain localhost fall back to host-only cookies: sign in on the host you use.
    crossSubDomainCookies:
      env.ROOT_DOMAIN && env.TENANCY === "multi" && env.ROOT_DOMAIN.split(":")[0]!.includes(".")
        ? { enabled: true, domain: `.${env.ROOT_DOMAIN.split(":")[0]}` }
        : undefined,
  },
  plugins: [
    magicLink({
      // A link signs people in; accounts are created by the sign-up and invitation pages, which
      // record consent (cloud) or check the invitation (self-hosted).
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        const { accountMail } = await import("@/emails/account");
        await sendEmail({
          to: email,
          ...(await accountMail({
            subject: "Sign in to Bookly",
            title: "Your sign-in link",
            body: "Use the button below to sign in. It works once and expires in 5 minutes.",
            cta: { href: url, label: "Sign in" },
            note: "If you didn't request this, you can ignore this email.",
          })),
        });
      },
    }),
    organization({
      allowUserToCreateOrganization: async () => env.TENANCY === "multi",
      creatorRole: "owner",
      sendInvitationEmail: async ({ email, organization: org, inviter, id }) => {
        const { accountMail } = await import("@/emails/account");
        await sendEmail({
          to: email,
          ...(await accountMail({
            subject: `${inviter.user.name} invited you to ${org.name} on Bookly`,
            title: `Join ${org.name}`,
            body: `${inviter.user.name} invited you to work together in ${org.name} on Bookly: shared booking pages, contacts and meeting notes.`,
            cta: { href: `${env.APP_URL}/accept-invitation/${id}`, label: "Accept the invitation" },
          })),
        });
      },
    }),
    admin(),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
