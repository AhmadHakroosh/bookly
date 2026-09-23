"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, schema } from "@bookly/db";
import { encrypt } from "@/lib/crypto";
import { parseBlocklist } from "@/server/abuse";
import { refreshWorkspace } from "@/server/cache";
import { hasFeature } from "@/server/limits";
import { deleteWorkspace } from "@/server/data-rights";
import { isCloud, platformUrl } from "@/server/platform";
import { db } from "@/lib/db";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().default(""),
  locale: z.string().trim().min(2).max(10).default("en"),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  blocklist: z.string().max(20000).default(""),
  crmProvider: z.enum(["", "hubspot", "pipedrive"]).default(""),
  crmApiKey: z.string().trim().max(500).default(""),
  crmCompanyDomain: z.string().trim().max(100).default(""),
  proposalSubject: z.string().max(200).default(""),
  proposalBody: z.string().max(8000).default(""),
  paymentSubject: z.string().max(200).default(""),
  checkInSubject: z.string().max(200).default(""),
  postalAddress: z.string().trim().max(300).default(""),
  checkInBody: z.string().max(8000).default(""),
  paymentBody: z.string().max(8000).default(""),
  confirmationSubject: z.string().max(200).default(""),
  confirmationBody: z.string().max(4000).default(""),
  reminderSubject: z.string().max(200).default(""),
  reminderBody: z.string().max(4000).default(""),
  cancellationSubject: z.string().max(200).default(""),
  cancellationBody: z.string().max(4000).default(""),
  telemetryStats: z.enum(["on"]).optional(),
  logoUrl: z.string().trim().max(500).default(""),
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #e8965a")
    .or(z.literal(""))
    .default(""),
});

export type SettingsState = { ok?: boolean; error?: string; fields?: Record<string, string[]> };

export async function updateWorkspaceSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireStaff();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return { error: "No workspace." };
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Please check the form.", fields: z.flattenError(parsed.error).fieldErrors };
  const {
    blocklist,
    crmProvider,
    crmApiKey,
    crmCompanyDomain,
    proposalSubject,
    proposalBody,
    paymentSubject,
    paymentBody,
    checkInSubject,
    checkInBody,
    postalAddress,
    confirmationSubject,
    confirmationBody,
    reminderSubject,
    reminderBody,
    cancellationSubject,
    cancellationBody,
    telemetryStats,
    logoUrl,
    accent,
    ...rest
  } = parsed.data;
  // A blank key keeps the stored one only for the same provider; switching CRMs needs a new
  // token, and no provider removes the connection.
  const sameProvider = workspace.settings.crm?.provider === crmProvider;
  const crm =
    crmProvider === ""
      ? null
      : {
          provider: crmProvider,
          apiKey: crmApiKey
            ? encrypt(crmApiKey)
            : sameProvider
              ? (workspace.settings.crm?.apiKey ?? "")
              : "",
          companyDomain: crmCompanyDomain || undefined,
        };
  if (crmProvider !== "" && !crm?.apiKey)
    return {
      error: `Enter your ${crmProvider === "hubspot" ? "HubSpot access token" : "Pipedrive API token"} to connect.`,
    };
  await db()
    .update(schema.workspaces)
    .set({
      ...rest,
      description: rest.description || null,
      settings: {
        ...workspace.settings,
        blockedEmails: parseBlocklist(blocklist),
        postalAddress: postalAddress || undefined,
        telemetryStats: telemetryStats === "on",
        branding: hasFeature(workspace, "removeBranding")
          ? {
              ...workspace.settings.branding,
              logoUrl: /^https?:\/\//.test(logoUrl) ? logoUrl : null,
              accent: accent || undefined,
            }
          : workspace.settings.branding,
        crm: crm?.apiKey ? crm : null,
        templates: {
          proposal: { subject: proposalSubject || undefined, body: proposalBody || undefined },
          paymentRequest: { subject: paymentSubject || undefined, body: paymentBody || undefined },
          checkIn: { subject: checkInSubject || undefined, body: checkInBody || undefined },
          confirmation: {
            subject: confirmationSubject || undefined,
            body: confirmationBody || undefined,
          },
          reminder: { subject: reminderSubject || undefined, body: reminderBody || undefined },
          cancellation: {
            subject: cancellationSubject || undefined,
            body: cancellationBody || undefined,
          },
        },
      },
    })
    .where(eq(schema.workspaces.id, workspace.id));
  refreshWorkspace(workspace.id);
  return { ok: true };
}

const deleteSchema = z.object({ confirm: z.string().trim() });

/** Owner-only, irreversible. The typed slug guards against a slip; the cascade does the rest. */
export async function deleteWorkspaceAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { role } = await requireStaff();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return { error: "No workspace." };
  if (role !== "owner") return { error: "Only the owner can delete the workspace." };
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.confirm !== workspace.slug)
    return { error: `Type “${workspace.slug}” to confirm.` };
  await deleteWorkspace(workspace);
  redirect(isCloud() ? platformUrl("/workspaces") : "/setup");
}
