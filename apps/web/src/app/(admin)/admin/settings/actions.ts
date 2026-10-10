"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, schema } from "@bookly/db";
import type { WorkspaceSettings } from "@bookly/db/schema";
import { encrypt } from "@/lib/crypto";
import { parseBlocklist } from "@/server/abuse";
import { refreshWorkspace } from "@/server/cache";
import { syncConnectBranding } from "@/server/connect";
import { hasFeature } from "@/server/limits";
import { deleteWorkspace } from "@/server/data-rights";
import { isCloud, platformUrl } from "@/server/platform";
import { db } from "@/lib/db";
import { assertManager, requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * Settings is one page per concern (general, branding, emails, integrations), each with its
 * own form. Every form posts a hidden `section` so only that section's fields are validated
 * and merged; saving Branding never touches the email templates and vice versa.
 */

const subject = z.string().max(200).default("");
const generalSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().default(""),
  locale: z.string().trim().min(2).max(10).default("en"),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  blocklist: z.string().max(20000).default(""),
  postalAddress: z.string().trim().max(300).default(""),
  telemetryStats: z.enum(["on"]).optional(),
});
const brandingSchema = z.object({
  logoUrl: z.string().trim().max(500).default(""),
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #e8965a")
    .or(z.literal(""))
    .default(""),
});
const emailsSchema = z.object({
  confirmationSubject: subject,
  confirmationBody: z.string().max(4000).default(""),
  reminderSubject: subject,
  reminderBody: z.string().max(4000).default(""),
  cancellationSubject: subject,
  cancellationBody: z.string().max(4000).default(""),
  proposalSubject: subject,
  proposalBody: z.string().max(8000).default(""),
  paymentSubject: subject,
  paymentBody: z.string().max(8000).default(""),
  checkInSubject: subject,
  checkInBody: z.string().max(8000).default(""),
});
const crmSchema = z.object({
  crmProvider: z.enum(["", "hubspot", "pipedrive"]).default(""),
  crmApiKey: z.string().trim().max(500).default(""),
  crmCompanyDomain: z.string().trim().max(100).default(""),
});

export type SettingsState = { ok?: boolean; error?: string; fields?: Record<string, string[]> };

type Section = "general" | "branding" | "emails" | "integrations";

export async function updateWorkspaceSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { error } = await assertManager();
  if (error) return { error };
  const workspace = await getCurrentWorkspace();
  if (!workspace) return { error: "No workspace." };
  const section = String(formData.get("section") ?? "") as Section;
  const raw = Object.fromEntries(formData);
  const fail = (e: z.ZodError) => ({
    error: "Please check the form.",
    fields: z.flattenError(e).fieldErrors as Record<string, string[]>,
  });
  const s = workspace.settings;
  let columns: Partial<typeof schema.workspaces.$inferInsert> = {};
  let settings: WorkspaceSettings = s;

  if (section === "general") {
    const parsed = generalSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error);
    const { blocklist, postalAddress, telemetryStats, ...rest } = parsed.data;
    columns = { ...rest, description: rest.description || null };
    settings = {
      ...s,
      blockedEmails: parseBlocklist(blocklist),
      postalAddress: postalAddress || undefined,
      telemetryStats: telemetryStats === "on",
    };
  } else if (section === "branding") {
    const parsed = brandingSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error);
    if (!hasFeature(workspace, "removeBranding"))
      return { error: "Your own logo and colour come with Pro and Team." };
    settings = {
      ...s,
      branding: {
        ...s.branding,
        logoUrl: /^https?:\/\//.test(parsed.data.logoUrl) ? parsed.data.logoUrl : null,
        accent: parsed.data.accent || undefined,
      },
    };
  } else if (section === "emails") {
    const parsed = emailsSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error);
    const d = parsed.data;
    const t = (subj: string, body: string) => ({
      subject: subj || undefined,
      body: body || undefined,
    });
    settings = {
      ...s,
      templates: {
        confirmation: t(d.confirmationSubject, d.confirmationBody),
        reminder: t(d.reminderSubject, d.reminderBody),
        cancellation: t(d.cancellationSubject, d.cancellationBody),
        proposal: t(d.proposalSubject, d.proposalBody),
        paymentRequest: t(d.paymentSubject, d.paymentBody),
        checkIn: t(d.checkInSubject, d.checkInBody),
      },
    };
  } else if (section === "integrations") {
    const parsed = crmSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error);
    const { crmProvider, crmApiKey, crmCompanyDomain } = parsed.data;
    // A blank key keeps the stored one only for the same provider; switching CRMs needs a new
    // token, and no provider removes the connection.
    const sameProvider = s.crm?.provider === crmProvider;
    const crm =
      crmProvider === ""
        ? null
        : {
            provider: crmProvider,
            apiKey: crmApiKey ? encrypt(crmApiKey) : sameProvider ? (s.crm?.apiKey ?? "") : "",
            companyDomain: crmCompanyDomain || undefined,
          };
    if (crmProvider !== "" && !crm?.apiKey)
      return {
        error: `Enter your ${crmProvider === "hubspot" ? "HubSpot access token" : "Pipedrive API token"} to connect.`,
      };
    settings = { ...s, crm: crm?.apiKey ? crm : null };
  } else {
    return { error: "Unknown settings section." };
  }

  await db()
    .update(schema.workspaces)
    .set({ ...columns, settings })
    .where(eq(schema.workspaces.id, workspace.id));
  refreshWorkspace(workspace.id);
  if (section === "general" || section === "branding") {
    // The Stripe Checkout page follows the workspace's name and branding.
    const fresh = await getCurrentWorkspace();
    if (fresh) await syncConnectBranding(fresh);
  }
  return { ok: true };
}

/** The workspace-wide "attendee joined" ping (Settings → General); owner/admin only. */
export async function enableJoinNotifications(): Promise<SettingsState> {
  return setJoinPings(true);
}

export async function disableJoinNotifications(): Promise<SettingsState> {
  return setJoinPings(false);
}

async function setJoinPings(on: boolean): Promise<SettingsState> {
  const { error } = await assertManager();
  if (error) return { error };
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace" };
  await db()
    .update(schema.workspaces)
    .set({ settings: { ...ws.settings, daily: { ...(ws.settings.daily ?? {}), joinPings: on } } })
    .where(eq(schema.workspaces.id, ws.id));
  revalidatePath("/admin", "layout");
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
