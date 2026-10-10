"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { confirmPhoneCode, sendPhoneCode, testSlackWebhook } from "@/server/phone-verification";
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

const self = (u: { id: string; email: string }) => ({ type: "profile", id: u.id, label: u.email });

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
  const current = await db().query.profiles.findFirst({
    where: and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, session.user.id)),
    columns: { phone: true, notifications: true },
  });
  // A new number has to be proved again before Bookly texts it.
  const phoneChanged = (current?.phone ?? null) !== (d.phone || null);
  const notifications = {
    channel: d.phone ? d.channel : "none",
    slackWebhookUrl: d.slackWebhookUrl || null,
    onBooking: d.onBooking,
    onCancel: d.onCancel,
    onJoin: d.onJoin,
    reminder1h: d.reminder1h,
  };
  await db()
    .update(schema.profiles)
    .set({
      phone: d.phone || null,
      ...(phoneChanged ? { phoneVerifiedAt: null, phoneVerification: null } : {}),
      notifications,
    })
    .where(
      and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, session.user.id)),
    );
  // The webhook URL carries a Slack token: record whether one is set, never the URL.
  const fields = (
    phone: string | null | undefined,
    n: Partial<typeof notifications> | undefined,
  ) => ({
    phone: phone ?? null,
    channel: n?.channel ?? "none",
    slackWebhook: !!n?.slackWebhookUrl,
    onBooking: n?.onBooking ?? false,
    onCancel: n?.onCancel ?? false,
    onJoin: n?.onJoin ?? false,
    reminder1h: n?.reminder1h ?? false,
  });
  await audit({
    action: "notifications.prefs_updated",
    target: self(session.user),
    changes: diff(
      fields(current?.phone, current?.notifications),
      fields(d.phone || null, notifications),
    ),
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Texts a verification code to the saved phone (Admin → Notifications → Send code). */
export async function sendPhoneCodeAction(): Promise<PrefsState> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  const r = await sendPhoneCode(ws.id, session.user.id);
  if (r.ok) await audit({ action: "notifications.phone_code_sent", target: self(session.user) });
  revalidatePath("/admin/notifications");
  return r.ok ? { ok: true } : { error: r.error };
}

export async function confirmPhoneCodeAction(
  _prev: PrefsState,
  formData: FormData,
): Promise<PrefsState> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  const r = await confirmPhoneCode(ws.id, session.user.id, String(formData.get("code") ?? ""));
  if (r.ok) await audit({ action: "notifications.phone_verified", target: self(session.user) });
  revalidatePath("/admin", "layout");
  return r.ok ? { ok: true } : { error: r.error };
}

/** Posts a test message to the saved Slack webhook. */
export async function testSlackAction(): Promise<PrefsState> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  const p = await db().query.profiles.findFirst({
    where: and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, session.user.id)),
    columns: { notifications: true },
  });
  const url = p?.notifications.slackWebhookUrl;
  if (!url) return { error: "Save a Slack webhook URL first." };
  const r = await testSlackWebhook(url, session.user.id);
  if (r.ok) await audit({ action: "notifications.slack_tested", target: self(session.user) });
  return r.ok ? { ok: true } : { error: r.error };
}
