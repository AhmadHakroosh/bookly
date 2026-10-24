"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/server/audit";
import { getContact } from "@/server/contacts";
import { hasFlag } from "@/server/flags";
import { LimitError } from "@/server/limits";
import {
  addNote,
  addParticipants,
  canGuest,
  createTeamThread,
  guestThread,
  latestEmail,
  markThreadRead,
  postTeamMessage,
  setClosed,
  threadDetails,
  type Viewer,
} from "@/server/messages";
import { sendGuestEmail, sendTimelineReply } from "@/server/outreach";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * Everything Messages writes. Each action checks the `messages` flag; the plan gates
 * (`guestMessages`, `teamMessages`, `attachments`) are enforced in server/messages.ts and
 * reported back as a message with the plan that unlocks it. Every write is audited.
 */

export type MessageResult = { ok?: boolean; error?: string; threadId?: string };

async function viewer(): Promise<Viewer | null> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "messages"))) return null;
  return { userId: session.user.id, ws };
}

const fail = (e: unknown): MessageResult => ({
  error: e instanceof LimitError || e instanceof Error ? e.message : "Something went wrong.",
});

const refresh = () => revalidatePath("/admin", "layout");
const files = (fd: FormData) => fd.getAll("fileId").map(String).slice(0, 10);
const threadTarget = (id: string, label: string) => ({ type: "thread", id, label });

/** Opens (creating if needed) a contact's conversation, for "New message → a client". */
export async function openGuestThreadAction(contactId: string): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  if (!canGuest(v.ws)) return { error: "Messages with your clients come with Pro." };
  const c = await getContact(v.ws.id, contactId);
  if (!c) return { error: "That contact is gone." };
  const thread = await guestThread(v.ws.id, c.id);
  await audit({
    action: "thread.opened",
    target: threadTarget(thread.id, c.name || c.email),
    changes: { kind: { to: "guest" }, contactId: { to: c.id } },
  });
  refresh();
  return { ok: true, threadId: thread.id };
}

/**
 * Writes to the guest: an email from the member with the signed Reply-To, logged on the
 * timeline (and so in the conversation). It answers the newest email unless a subject starts
 * a new one.
 */
export async function sendToGuestAction(
  threadId: string,
  _prev: MessageResult,
  formData: FormData,
): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  const d = await threadDetails(v, threadId);
  if (!d || d.thread.kind !== "guest" || !d.contact) return { error: "That conversation is gone." };
  const c = await getContact(v.ws.id, d.contact.id);
  if (!c) return { error: "That contact is gone." };
  const text = String(formData.get("body") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  try {
    const parent = subject ? null : await latestEmail(v.ws.id, c.id);
    const r = parent
      ? await sendTimelineReply(v.ws, c, parent, v.userId, text, files(formData))
      : await sendGuestEmail(v.ws, c, v.userId, { subject, text, fileIds: files(formData) });
    if ("error" in r) return r;
    await markThreadRead(v, d.thread.id);
    await audit({
      action: "message.sent",
      target: threadTarget(d.thread.id, c.name || c.email),
      changes: { email: { to: r.id }, files: { to: files(formData).length } },
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** An internal note on a guest's conversation (Team); the guest never sees it. */
export async function addNoteAction(
  threadId: string,
  _prev: MessageResult,
  formData: FormData,
): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  const d = await threadDetails(v, threadId);
  if (!d) return { error: "That conversation is gone." };
  try {
    const m = await addNote(v, d, String(formData.get("body") ?? ""), files(formData));
    await audit({
      action: "message.noted",
      target: threadTarget(d.thread.id, d.contact?.name || d.contact?.email || "Conversation"),
      changes: { mentions: { to: m.mentions.length } },
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** A message in a team thread (Team). */
export async function postMessageAction(
  threadId: string,
  _prev: MessageResult,
  formData: FormData,
): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  const d = await threadDetails(v, threadId);
  if (!d) return { error: "That thread is gone." };
  try {
    const m = await postTeamMessage(v, d, String(formData.get("body") ?? ""), files(formData));
    await audit({
      action: "message.posted",
      target: threadTarget(d.thread.id, d.thread.subject || "Team thread"),
      changes: { mentions: { to: m.mentions.length } },
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** A new team thread (Team): subject, people, optionally a contact it is about, first message. */
export async function createTeamThreadAction(
  _prev: MessageResult,
  formData: FormData,
): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  try {
    const r = await createTeamThread(v, {
      subject: String(formData.get("subject") ?? ""),
      participantIds: formData.getAll("participant").map(String).slice(0, 50),
      contactId: String(formData.get("contactId") ?? "") || null,
      body: String(formData.get("body") ?? ""),
      fileIds: files(formData),
    });
    await audit({
      action: "thread.created",
      target: threadTarget(r.thread.id, r.thread.subject ?? "Team thread"),
      changes: {
        participants: { to: r.participants.length + 1 },
        contactId: { to: r.thread.contactId },
      },
    });
    refresh();
    return { ok: true, threadId: r.thread.id };
  } catch (e) {
    return fail(e);
  }
}

export async function addParticipantsAction(
  threadId: string,
  userIds: string[],
): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  const d = await threadDetails(v, threadId);
  if (!d) return { error: "That thread is gone." };
  try {
    const added = await addParticipants(v, d, userIds.slice(0, 50));
    await audit({
      action: "thread.participants_added",
      target: threadTarget(d.thread.id, d.thread.subject || "Team thread"),
      changes: { participants: { to: added } },
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

export async function setClosedAction(threadId: string, closed: boolean): Promise<MessageResult> {
  const v = await viewer();
  if (!v) return { error: "Messages are not enabled for this workspace." };
  const d = await threadDetails(v, threadId);
  if (!d) return { error: "That thread is gone." };
  await setClosed(v, d, closed);
  await audit({
    action: closed ? "thread.closed" : "thread.reopened",
    target: threadTarget(
      d.thread.id,
      d.thread.subject || d.contact?.name || d.contact?.email || "Conversation",
    ),
  });
  refresh();
  return { ok: true };
}

/** Contact search for "New message". */
export async function findContactsAction(q: string) {
  // audit: read-only — contact search for the new-message dialog
  const v = await viewer();
  if (!v) return [];
  const { listContacts } = await import("@/server/contacts");
  const list = await listContacts(v.ws.id, { q: q.slice(0, 100), limit: 12, viewer: v.userId });
  return list.map((c) => ({ id: c.id, name: c.name || c.email, email: c.email }));
}
