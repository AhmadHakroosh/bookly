import "server-only";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { isCloud, platformUrl } from "./platform";
import { adminBaseUrl, publicBaseUrl } from "./urls";

/*
 * Short links on the platform host for channels whose links are fixed up front, such as the
 * dynamic-URL button of a WhatsApp template (one URL prefix per template, only the suffix
 * varies). `/b/<manage token>` sends a guest to their booking page on the workspace's own
 * host; `/h/<booking id>` sends a host to the booking in their admin, where the sign-in guard
 * does the rest. Neither adds a secret: the manage token is already the guest's link and the
 * admin page needs a session.
 */

const MANAGE_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const looksLikeManageToken = (s: string) => MANAGE_TOKEN.test(s);
export const looksLikeBookingId = (s: string) => UUID.test(s);

/** Where `/b/<token>` goes: the guest's manage page, or null when no booking has that token. */
export async function guestBookingUrl(token: string): Promise<string | null> {
  if (!looksLikeManageToken(token)) return null;
  const b = await db().query.bookings.findFirst({
    where: eq(schema.bookings.manageToken, token),
    columns: { workspaceId: true, manageToken: true },
  });
  if (!b) return null;
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, b.workspaceId),
    columns: { id: true, slug: true },
  });
  return ws ? `${await publicBaseUrl(ws)}/booking/${b.manageToken}` : null;
}

/**
 * Where `/h/<id>` goes: the booking in its workspace's admin. `admin` (used by pings that are
 * not about one booking) opens the workspace chooser on the cloud and the admin on a
 * self-hosted install; an unknown id gives null.
 */
export async function hostBookingUrl(id: string): Promise<string | null> {
  if (id === "admin") return isCloud() ? platformUrl("/workspaces") : platformUrl("/admin");
  if (!looksLikeBookingId(id)) return null;
  const b = await db().query.bookings.findFirst({
    where: eq(schema.bookings.id, id),
    columns: { id: true, workspaceId: true },
  });
  if (!b) return null;
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, b.workspaceId),
    columns: { slug: true },
  });
  return ws ? `${adminBaseUrl(ws)}/admin/bookings/${b.id}` : null;
}
