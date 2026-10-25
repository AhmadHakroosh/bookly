"use server";

import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { hasFlag } from "@/server/flags";
import { LimitError } from "@/server/limits";
import { notify } from "@/server/notifications";
import { dropStoredPhoto, setAccountPhoto, storeAccountPhoto } from "@/server/photos";
import { requireManager, requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export type PhotoState = { ok?: boolean; url?: string; error?: string };

const TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

/**
 * The account photo, cropped in the browser to a 512 × 512 square and stored once; every booking
 * page that follows the account photo moves with it.
 */
export async function uploadAccountPhotoAction(formData: FormData): Promise<PhotoState> {
  const { session } = await requireWorkspaceUser();
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace." };
  if (!(await hasFlag(ws, "file_uploads"))) return { error: "Uploads are not enabled here." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a picture first." };
  if (file.size > 10 * 1024 * 1024)
    return { error: "This file is over 10 MB. Choose a smaller picture." };
  if (!TYPES.has(file.type)) return { error: "Use a JPEG, PNG, WebP or HEIC picture." };
  try {
    const url = await storeAccountPhoto(
      ws,
      session.user.id,
      Buffer.from(await file.arrayBuffer()),
      file.name,
      file.type,
    );
    const { before, name } = await setAccountPhoto(session.user.id, url);
    await audit({
      action: "user.photo_updated",
      target: { type: "user", id: session.user.id, label: name },
      changes: { image: { from: before, to: url } },
    });
    refreshWorkspace(ws.id);
    return { ok: true, url };
  } catch (e) {
    return {
      error:
        e instanceof LimitError
          ? e.message
          : "The photo didn't upload. Check your connection and try again.",
    };
  }
}

/** Without uploads (a self-host with no storage): the photo is an image address. */
export async function setAccountPhotoUrlAction(formData: FormData): Promise<PhotoState> {
  const { session } = await requireWorkspaceUser();
  const ws = await getCurrentWorkspace();
  const raw = String(formData.get("url") ?? "").trim();
  if (raw && !/^https:\/\/\S+$/.test(raw)) return { error: "Use an https:// address." };
  const { before, name } = await setAccountPhoto(session.user.id, raw || null);
  await audit({
    action: raw ? "user.photo_updated" : "user.photo_removed",
    target: { type: "user", id: session.user.id, label: name },
    changes: { image: { from: before, to: raw || null } },
  });
  if (ws) refreshWorkspace(ws.id);
  return { ok: true, url: raw };
}

/** Initials everywhere, at once; the stored picture is deleted. */
export async function removeAccountPhotoAction(): Promise<PhotoState> {
  const { session } = await requireWorkspaceUser();
  const ws = await getCurrentWorkspace();
  const { before, name } = await setAccountPhoto(session.user.id, null);
  await dropStoredPhoto(before, session.user.id);
  await audit({
    action: "user.photo_removed",
    target: { type: "user", id: session.user.id, label: name },
    changes: { image: { from: before, to: null } },
  });
  if (ws) refreshWorkspace(ws.id);
  return { ok: true, url: "" };
}

/**
 * An owner or admin removes a member's photo (an inappropriate picture). Recorded, and the member
 * is told.
 */
export async function removeMemberPhotoAction(memberId: string) {
  const { session } = await requireManager();
  const ws = await getCurrentWorkspace();
  if (!ws) return;
  const member = await db().query.members.findFirst({
    where: and(
      eq(schema.members.id, memberId),
      eq(schema.members.organizationId, ws.organizationId),
    ),
    columns: { userId: true },
  });
  if (!member || member.userId === session.user.id) return;
  const { before, name } = await setAccountPhoto(member.userId, null);
  if (!before) return;
  await dropStoredPhoto(before, member.userId);
  await audit({
    action: "user.photo_removed",
    target: { type: "user", id: member.userId, label: name },
    changes: { image: { from: before, to: null } },
  });
  await notify(ws, member.userId, {
    kind: "account.photo_removed",
    title: "Your photo was removed",
    body: `${session.user.name || session.user.email} removed your photo in ${ws.name}. You can upload another one.`,
    link: "/admin/account#photo",
    email: {
      subject: "Your photo was removed",
      text: `${session.user.name || session.user.email} removed your photo in ${ws.name}. Your initials show in its place; you can upload another photo from your account.`,
    },
  });
  refreshWorkspace(ws.id);
}
