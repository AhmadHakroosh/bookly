"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import type { HostNotifications } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { hasFlag } from "@/server/flags";
import {
  KIND_KEYS,
  channelsFor,
  decodeCursor,
  listNotifications,
  markRead,
  toClient,
  unreadCount,
  type ClientNotification,
} from "@/server/notifications";
import { deviceLabel, pushToUser } from "@/server/push";
import { channels, publish } from "@/server/realtime";
import { requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * The bell, the device switch and the per-kind preferences on Admin → Notifications. Everything
 * here acts on the signed-in member's own notifications in the current workspace.
 */

async function me() {
  const [{ session }, ws] = await Promise.all([requireWorkspaceUser(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "notifications"))) return null;
  return { ws, user: session.user };
}

const self = (u: { id: string; email: string }) => ({ type: "profile", id: u.id, label: u.email });

export type FeedPage = { items: ClientNotification[]; next: string | null; unread: number };

/** One page of the panel, newest first; `cursor` is the previous page's `next`. */
export async function loadNotificationsAction(cursor?: string | null): Promise<FeedPage | null> {
  // audit: read-only — lists the member's own notifications
  const m = await me();
  if (!m) return null;
  const [page, unread] = await Promise.all([
    listNotifications(m.ws.id, m.user.id, { cursor: decodeCursor(cursor) }),
    unreadCount(m.ws.id, m.user.id),
  ]);
  return { items: page.rows.map(toClient), next: page.next, unread };
}

/** Marks the given notifications (or all of them) read; returns the new unread count. */
export async function markNotificationsReadAction(ids?: string[]): Promise<number | null> {
  // audit: read-only — the member's own read state of their notifications (UI state, not workspace data)
  const m = await me();
  if (!m) return null;
  const list = Array.isArray(ids) ? ids.filter((i) => typeof i === "string") : undefined;
  await markRead(m.ws.id, m.user.id, list);
  const unread = await unreadCount(m.ws.id, m.user.id);
  // The member's other tabs and devices update their bell too.
  await publish([channels.member(m.ws.id, m.user.id)], "count", { unread });
  return unread;
}

const subSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Stores this browser's push subscription (re-sent on every visit, so rotated keys catch up). */
export async function savePushSubscriptionAction(sub: unknown): Promise<{ ok: boolean }> {
  const m = await me();
  if (!m) return { ok: false };
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { ok: false };
  const { endpoint, keys } = parsed.data;
  const device = deviceLabel((await headers()).get("user-agent"));
  const existing = await db().query.pushSubscriptions.findFirst({
    where: eq(schema.pushSubscriptions.endpoint, endpoint),
  });
  if (
    existing &&
    existing.userId === m.user.id &&
    existing.workspaceId === m.ws.id &&
    existing.p256dh === keys.p256dh &&
    existing.auth === keys.auth
  )
    return { ok: true };
  await db()
    .insert(schema.pushSubscriptions)
    .values({ workspaceId: m.ws.id, userId: m.user.id, endpoint, ...keys, device })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { workspaceId: m.ws.id, userId: m.user.id, ...keys, device },
    });
  if (!existing || existing.userId !== m.user.id || existing.workspaceId !== m.ws.id)
    await audit({
      action: "notifications.device_added",
      target: self(m.user),
      changes: { device: { to: device } },
    });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

/** Forgets one browser (this one when it turns desktop notifications off, or any from the list). */
export async function removePushSubscriptionAction(by: {
  endpoint?: string;
  id?: string;
}): Promise<{ ok: boolean }> {
  const m = await me();
  if (!m) return { ok: false };
  const where = by.id
    ? eq(schema.pushSubscriptions.id, by.id)
    : by.endpoint
      ? eq(schema.pushSubscriptions.endpoint, by.endpoint)
      : null;
  if (!where) return { ok: false };
  const gone = await db()
    .delete(schema.pushSubscriptions)
    .where(
      and(
        where,
        eq(schema.pushSubscriptions.userId, m.user.id),
        eq(schema.pushSubscriptions.workspaceId, m.ws.id),
      ),
    )
    .returning({ device: schema.pushSubscriptions.device });
  if (gone.length)
    await audit({
      action: "notifications.device_removed",
      target: self(m.user),
      changes: { device: { from: gone[0]!.device } },
    });
  revalidatePath("/admin/notifications");
  return { ok: true };
}

/** Sends a test push to the member's own browsers. */
export async function sendTestPushAction(): Promise<{ sent: number }> {
  // audit: read-only — sends a test push to the member's own browsers; nothing is stored
  const m = await me();
  if (!m) return { sent: 0 };
  const origin = (await headers()).get("origin") ?? "";
  const sent = await pushToUser(m.ws.id, m.user.id, {
    id: `test-${Date.now()}`,
    title: "Notifications are on",
    body: "This is how Bookly will tell you about bookings, guests and payments.",
    url: `${origin}/admin/notifications`,
  });
  return { sent };
}

export type KindsState = { ok?: boolean; error?: string };

/** Saves the In Bookly / Desktop / Email grid for every kind. */
export async function saveNotificationKindsAction(
  _prev: KindsState,
  formData: FormData,
): Promise<KindsState> {
  const m = await me();
  if (!m) return { error: "Notifications are not enabled for this workspace." };
  const where = and(
    eq(schema.profiles.workspaceId, m.ws.id),
    eq(schema.profiles.userId, m.user.id),
  );
  const profile = await db().query.profiles.findFirst({ where, columns: { notifications: true } });
  if (!profile) return { error: "Set up your booking page first." };
  const prev: HostNotifications = profile.notifications ?? {};
  const kinds: NonNullable<HostNotifications["kinds"]> = {};
  for (const k of KIND_KEYS)
    kinds[k] = {
      inApp: formData.get(`${k}:inApp`) === "on",
      desktop: formData.get(`${k}:desktop`) === "on",
      email: formData.get(`${k}:email`) === "on",
    };
  const next: HostNotifications = { ...prev, kinds };
  await db().update(schema.profiles).set({ notifications: next }).where(where);
  const flat = (p: HostNotifications) =>
    Object.fromEntries(
      KIND_KEYS.flatMap((k) => {
        const c = channelsFor(p, k);
        return [
          [`${k}.inApp`, c.inApp],
          [`${k}.desktop`, c.desktop],
          [`${k}.email`, c.email],
        ];
      }),
    );
  await audit({
    action: "notifications.kinds_updated",
    target: self(m.user),
    changes: diff(flat(prev), flat(next)),
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}
