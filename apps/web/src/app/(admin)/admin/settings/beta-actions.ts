"use server";

import { revalidatePath } from "next/cache";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { assertManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import type { SettingsState } from "./actions";

/** Settings → General: whether the workspace takes part in betas (flags in the `beta` state). */
export async function setBetaOptOut(optOut: boolean): Promise<SettingsState> {
  const { error } = await assertManager();
  if (error) return { error };
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace." };
  await db()
    .update(schema.workspaces)
    .set({ settings: { ...ws.settings, betaOptOut: optOut } })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
  await audit({
    action: optOut ? "settings.betas.opted_out" : "settings.betas.opted_in",
    target: { type: "workspace", id: ws.id, label: ws.name },
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}
