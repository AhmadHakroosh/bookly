"use server";

import { z } from "zod";
import { eq, schema } from "@bookly/db";
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
  const { blocklist, ...rest } = parsed.data;
  await db()
    .update(schema.workspaces)
    .set({
      ...rest,
      description: rest.description || null,
      settings: { ...workspace.settings, blockedEmails: parseBlocklist(blocklist) },
    })
    .where(eq(schema.workspaces.id, workspace.id));
  refreshWorkspace(workspace.id);
  return { ok: true };
}
