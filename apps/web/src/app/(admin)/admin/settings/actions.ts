"use server";

import { z } from "zod";
import { eq, schema } from "@bookly/db";
import { encrypt } from "@/lib/crypto";
import { parseBlocklist } from "@/server/abuse";
import { refreshWorkspace } from "@/server/cache";
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
  paymentBody: z.string().max(8000).default(""),
  telemetryStats: z.enum(["on"]).optional(),
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
    telemetryStats,
    ...rest
  } = parsed.data;
  // A blank key keeps the stored one; no provider removes the connection.
  const crm =
    crmProvider === ""
      ? null
      : {
          provider: crmProvider,
          apiKey: crmApiKey ? encrypt(crmApiKey) : (workspace.settings.crm?.apiKey ?? ""),
          companyDomain: crmCompanyDomain || undefined,
        };
  await db()
    .update(schema.workspaces)
    .set({
      ...rest,
      description: rest.description || null,
      settings: {
        ...workspace.settings,
        blockedEmails: parseBlocklist(blocklist),
        telemetryStats: telemetryStats === "on",
        crm: crm?.apiKey ? crm : null,
        templates: {
          proposal: { subject: proposalSubject || undefined, body: proposalBody || undefined },
          paymentRequest: { subject: paymentSubject || undefined, body: paymentBody || undefined },
        },
      },
    })
    .where(eq(schema.workspaces.id, workspace.id));
  refreshWorkspace(workspace.id);
  return { ok: true };
}
