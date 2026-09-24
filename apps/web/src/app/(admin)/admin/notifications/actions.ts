"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

const prefsSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s()-]/g, ""))
    .refine(
      (s) => s === "" || /^\+\d{7,15}$/.test(s),
      "Phone must be in international format, e.g. +972501234567",
    ),
  channel: z.enum(["none", "sms", "whatsapp"]),
  slackWebhookUrl: z
    .string()
    .trim()
    .refine(
      (s) => s === "" || /^https:\/\/hooks\.slack\.com\//.test(s),
      "Must be a Slack incoming webhook URL",
    ),
  onBooking: z.boolean(),
  onCancel: z.boolean(),
  onJoin: z.boolean(),
  reminder1h: z.boolean(),
});

export type PrefsState = { ok?: boolean; error?: string };

export async function saveNotificationPrefs(
  _prev: PrefsState,
  formData: FormData,
): Promise<PrefsState> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  const parsed = prefsSchema.safeParse({
    phone: formData.get("phone") ?? "",
    channel: formData.get("channel") ?? "none",
    slackWebhookUrl: formData.get("slackWebhookUrl") ?? "",
    onBooking: !!formData.get("onBooking"),
    onCancel: !!formData.get("onCancel"),
    onJoin: !!formData.get("onJoin"),
    reminder1h: !!formData.get("reminder1h"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  await db()
    .update(schema.profiles)
    .set({
      phone: d.phone || null,
      notifications: {
        channel: d.phone ? d.channel : "none",
        slackWebhookUrl: d.slackWebhookUrl || null,
        onBooking: d.onBooking,
        onCancel: d.onCancel,
        onJoin: d.onJoin,
        reminder1h: d.reminder1h,
      },
    })
    .where(
      and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, session.user.id)),
    );
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Turns the "attendee joined" ping on for the workspace (owner/admin only). */
export async function enableJoinNotifications(): Promise<PrefsState> {
  return setJoinPings(true);
}

export async function disableJoinNotifications(): Promise<PrefsState> {
  return setJoinPings(false);
}

async function setJoinPings(on: boolean): Promise<PrefsState> {
  const [{ role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  if (role !== "owner" && role !== "admin") return { error: "Only owners can change this." };
  await db()
    .update(schema.workspaces)
    .set({ settings: { ...ws.settings, daily: { ...(ws.settings.daily ?? {}), joinPings: on } } })
    .where(eq(schema.workspaces.id, ws.id));
  revalidatePath("/admin", "layout");
  return { ok: true };
}
