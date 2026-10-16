"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/server/audit";
import { getContact } from "@/server/contacts";
import { hasFlag } from "@/server/flags";
import { inboundOn } from "@/server/inbound";
import { hasFeature } from "@/server/limits";
import { sendTimelineReply } from "@/server/outreach";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { decodeTimelineCursor, timelineWindow, type TimelineDay } from "@/server/timeline";
import { getCurrentWorkspace } from "@/server/workspace";

/** The window before `cursor` ("Show earlier" and the infinite scroll after it). */
export async function loadTimelineAction(
  contactId: string,
  cursor: string,
): Promise<{ days: TimelineDay[]; next: string | null } | null> {
  // audit: read-only — the next page of a contact's timeline
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "timeline_v2"))) return null;
  const c = await getContact(ws.id, contactId);
  if (!c) return null;
  const tz = (await getProfileByUser(ws.id, session.user.id))?.timezone ?? ws.timezone;
  return timelineWindow(ws.id, c.id, tz, decodeTimelineCursor(cursor));
}

export type ReplyState = { ok?: boolean; error?: string };

/** Answers an email from the timeline (Pro and up, with guest replies set up). */
export async function replyFromTimelineAction(
  contactId: string,
  parentId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "timeline_v2"))) return { error: "Not available." };
  if (!hasFeature(ws, "inboundEmail"))
    return { error: "Replying from the timeline comes with Pro." };
  if (!(await inboundOn(ws))) return { error: "Guest replies are not set up on this server." };
  const c = await getContact(ws.id, contactId);
  if (!c) return { error: "That contact is gone." };
  const r = await sendTimelineReply(
    ws,
    c,
    parentId,
    session.user.id,
    String(formData.get("body") ?? ""),
  );
  if ("error" in r) return r;
  await audit({
    action: "contact.email_replied",
    target: { type: "contact", id: c.id, label: c.name || c.email },
    changes: { replyTo: { to: parentId } },
  });
  revalidatePath(`/admin/contacts/${c.id}`);
  return { ok: true };
}
