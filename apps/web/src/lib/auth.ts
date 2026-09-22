import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink, organization } from "better-auth/plugins";
import { loadEnv } from "@bookly/config";
import { schema } from "@bookly/db";
import { sendEmail } from "@bookly/email";
import { db } from "./db";
import { authStorage, getLimiter } from "@/server/ratelimit";

const env = loadEnv();

/**
 * Auth for workspace owners, editors and (later) paying members.
 * - email + password and magic links work everywhere (self-host needs no third party)
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
          // Cloud: public sign-up must record acceptance of the terms and privacy policy.
          if (env.TENANCY === "multi" && ctx?.path === "/sign-up/email") {
            const u = user as typeof user & { consentAt?: Date | string | null };
            if (!u.consentAt)
              throw new APIError("BAD_REQUEST", {
                message: "Please accept the terms of service and privacy policy.",
              });
            return { data: { ...user, consentAt: new Date(u.consentAt) } };
          }
          // Single-tenant: once the workspace exists, only invitations may add accounts (public sign-up is closed).
          if (env.TENANCY !== "single") return;
          const workspace = await db().query.workspaces.findFirst({ columns: { id: true } });
          if (!workspace) return; // first run: the setup wizard creates the owner
          const pending = await db().query.invitations.findFirst({
            where: (t, { and, eq, gt }) =>
              and(
                eq(t.email, user.email.toLowerCase()),
                eq(t.status, "pending"),
                gt(t.expiresAt, new Date()),
              ),
            columns: { id: true },
          });
          const invited = !!pending || ctx?.path?.includes("invitation");
          if (!invited)
            throw new APIError("FORBIDDEN", {
              message: "Sign-up is closed. Ask the workspace owner for an invitation.",
            });
          return { data: user };
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
