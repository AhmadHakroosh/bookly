"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signState } from "@/lib/crypto";
import { z } from "zod";
import type { IntegrationProvider } from "@bookly/db/schema";
import {
  authorizeUrl,
  disconnectIntegration,
  providerConfigured,
  invalidateBusy,
  isProvider,
  refreshCalendars,
  updateIntegrationSettings,
} from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function who() {
  const { session } = await requireStaff();
  return session.user.id;
}

/** Begins the OAuth round trip; the provider sends the user back to /api/integrations/<p>/callback. */
export async function startConnect(provider: string, back: string) {
  if (!isProvider(provider)) return;
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return;
  const dest = back.startsWith("/admin") ? back : "/admin/calendars";
  if (!providerConfigured(provider)) redirect(`${dest}?error=not_configured`);
  redirect(authorizeUrl(provider, signState({ u: session.user.id, w: ws.id, back: dest })));
}

export async function disconnect(provider: string) {
  if (!isProvider(provider)) return;
  const uid = await who();
  await disconnectIntegration(uid, provider);
  invalidateBusy(uid);
  revalidatePath("/admin", "layout");
}

export async function reloadCalendars(provider: string) {
  if (provider !== "google" && provider !== "microsoft") return;
  await refreshCalendars(await who(), provider);
  revalidatePath("/admin", "layout");
}

const settingsSchema = z.object({
  provider: z.string(),
  destinationCalendarId: z.string().min(1),
  conflict: z.array(z.string()).default([]),
});

export async function saveCalendarSettings(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
) {
  const parsed = settingsSchema.safeParse({
    provider: formData.get("provider"),
    destinationCalendarId: formData.get("destinationCalendarId"),
    conflict: formData.getAll("conflict"),
  });
  if (!parsed.success) return { error: "Please check the form." };
  const { provider, destinationCalendarId, conflict } = parsed.data;
  if (!isProvider(provider)) return { error: "Unknown provider" };
  const uid = await who();
  await updateIntegrationSettings(uid, provider as IntegrationProvider, {
    destinationCalendarId,
    conflictCalendarIds: conflict,
  });
  invalidateBusy(uid);
  revalidatePath("/admin", "layout");
  return { ok: true };
}
