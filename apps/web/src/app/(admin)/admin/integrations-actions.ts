"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encrypt, signState } from "@/lib/crypto";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import type {
  ConferencingType,
  IntegrationProvider,
  IntegrationSettings,
} from "@bookly/db/schema";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import {
  authorizeUrl,
  pkceVerifier,
  disconnectIntegration,
  getIntegration,
  providerConfigured,
  invalidateBusy,
  isProvider,
  refreshCalendars,
  updateIntegrationSettings,
} from "@/server/integrations";
import { refreshWorkspace } from "@/server/cache";
import { assertWithinLimit, LimitError } from "@/server/limits";
import { requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function who() {
  const { session } = await requireWorkspaceUser();
  return session.user.id;
}

/** Begins the OAuth round trip; the provider sends the user back to /api/integrations/<p>/callback. */
export async function startConnect(provider: string, back: string) {
  if (!isProvider(provider)) return;
  const [{ session }, ws] = await Promise.all([requireWorkspaceUser(), getCurrentWorkspace()]);
  if (!ws) return;
  const dest = back.startsWith("/admin") ? back : "/admin/calendars";
  if (!providerConfigured(provider)) redirect(`${dest}?error=not_configured`);
  try {
    await assertWithinLimit(ws, "integrations", session.user.id);
  } catch (e) {
    if (e instanceof LimitError) redirect(`${dest}?error=limit`);
    throw e;
  }
  // The PKCE verifier travels inside the signed state, encrypted: the callback may land on the
  // platform host (no shared cookie), and whoever sees the URL must not learn the verifier.
  const verifier = pkceVerifier(provider);
  const state = signState({
    u: session.user.id,
    w: ws.id,
    back: dest,
    ...(verifier ? { v: encrypt(verifier) } : {}),
  });
  // Nothing is stored yet (the state travels signed in the URL); the callback logs the connection.
  await audit({
    action: "integration.connect_started",
    target: { type: "integration", id: provider, label: provider },
  });
  redirect(authorizeUrl(provider, state, verifier));
}

export async function disconnect(provider: string) {
  if (!isProvider(provider)) return;
  const uid = await who();
  await disconnectIntegration(uid, provider);
  await audit({
    action: "integration.disconnected",
    target: { type: "integration", id: provider, label: provider },
  });
  invalidateBusy(uid);
  revalidatePath("/admin", "layout");
}

export async function reloadCalendars(provider: string) {
  if (provider !== "google" && provider !== "microsoft") return;
  await refreshCalendars(await who(), provider);
  await audit({
    action: "integration.calendars_reloaded",
    target: { type: "integration", id: provider, label: provider },
  });
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
  const before = await getIntegration(uid, provider as IntegrationProvider);
  const settings: IntegrationSettings = { destinationCalendarId, conflictCalendarIds: conflict };
  await updateIntegrationSettings(uid, provider as IntegrationProvider, settings);
  await audit({
    action: "integration.calendar_settings_updated",
    target: { type: "integration", id: provider, label: provider },
    changes: diff<IntegrationSettings>(before?.settings, settings, [
      "destinationCalendarId",
      "conflictCalendarIds",
    ]),
  });
  invalidateBusy(uid);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const CONFERENCING = ["daily", "google_meet", "zoom", "teams"] as const;

/** The video tool new event types start with; saved as it is picked. */
export async function saveDefaultConferencing(value: string) {
  const [{ session }, ws] = await Promise.all([requireWorkspaceUser(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  const next = (CONFERENCING as readonly string[]).includes(value)
    ? (value as ConferencingType)
    : null;
  const where = and(
    eq(schema.profiles.workspaceId, ws.id),
    eq(schema.profiles.userId, session.user.id),
  );
  const before = await db().query.profiles.findFirst({
    where,
    columns: { defaultConferencing: true, displayName: true },
  });
  if (!before) return { error: "Set up your booking page first." };
  await db().update(schema.profiles).set({ defaultConferencing: next }).where(where);
  await audit({
    action: "profile.updated",
    target: { type: "profile", id: session.user.id, label: before.displayName },
    changes: diff(before, { defaultConferencing: next }, ["defaultConferencing"]),
  });
  // Profiles are cached with the workspace tag.
  refreshWorkspace(ws.id);
  return { ok: true };
}
