import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink, organization } from "better-auth/plugins";
import { loadEnv } from "@bookly/config";
import { schema } from "@bookly/db";
import { sendEmail } from "@bookly/email";
import { db } from "./db";

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
      await sendEmail({
        to: user.email,
        subject: "Reset your Bookly password",
        text: `Reset your password: ${url}\n\nIf you didn't request this, ignore this email.`,
      });
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  databaseHooks: {
    user: {
      create: {
        // Single-tenant: once the workspace exists, only invitations may add accounts (public sign-up is closed).
        before: async (user, ctx) => {
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
    crossSubDomainCookies:
      env.ROOT_DOMAIN && env.TENANCY === "multi"
        ? { enabled: true, domain: `.${env.ROOT_DOMAIN.split(":")[0]}` }
        : undefined,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          to: email,
          subject: "Sign in to Bookly",
          text: `Click to sign in: ${url}\n\nThis link expires in 5 minutes.`,
        });
      },
    }),
    organization({
      allowUserToCreateOrganization: async () => env.TENANCY === "multi",
      creatorRole: "owner",
      sendInvitationEmail: async ({ email, organization: org, inviter, id }) => {
        await sendEmail({
          to: email,
          subject: `${inviter.user.name} invited you to ${org.name} on Bookly`,
          text: `Accept the invitation: ${env.APP_URL}/accept-invitation/${id}`,
        });
      },
    }),
    admin(),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
