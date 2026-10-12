"use server";

import { eq, and, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { fileIdFromUrl, fileUrl, getFile, removeFile, storeImage } from "@/server/files";
import { hasFlag } from "@/server/flags";
import { LimitError } from "@/server/limits";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export type ImageUploadState = { ok?: boolean; url?: string; error?: string };

/** Profile photo: the image is resized to 512×512 and the profile points at it at once. */
export async function uploadAvatarAction(formData: FormData): Promise<ImageUploadState> {
  const { session } = await requireStaff();
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace." };
  if (!(await hasFlag(ws, "file_uploads"))) return { error: "Uploads are not enabled yet." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose an image first." };
  try {
    const stored = await storeImage({
      ws,
      kind: "avatar",
      input: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      mime: file.type,
      userId: session.user.id,
      owner: { type: "profile", id: session.user.id },
    });
    const url = fileUrl(stored.id);
    const before = await getProfileByUser(ws.id, session.user.id);
    if (before)
      await db()
        .update(schema.profiles)
        .set({ avatarUrl: url })
        .where(
          and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, session.user.id)),
        );
    await audit({
      action: "profile.avatar_updated",
      target: {
        type: "profile",
        id: session.user.id,
        label: before?.displayName ?? session.user.email,
      },
      changes: { avatarUrl: { from: before?.avatarUrl ?? null, to: url } },
    });
    refreshWorkspace(ws.id);
    return { ok: true, url };
  } catch (e) {
    return { error: e instanceof LimitError ? e.message : (e as Error).message };
  }
}

/** Clears the profile photo and deletes the uploaded file when it was one of ours. */
export async function removeAvatarAction(): Promise<ImageUploadState> {
  const { session } = await requireStaff();
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace." };
  const before = await getProfileByUser(ws.id, session.user.id);
  if (!before) return { ok: true, url: "" };
  await db()
    .update(schema.profiles)
    .set({ avatarUrl: null })
    .where(
      and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.userId, session.user.id)),
    );
  const id = fileIdFromUrl(before.avatarUrl);
  const stored = id ? await getFile(ws, id) : null;
  if (stored && stored.ownerType === "profile" && stored.ownerId === session.user.id)
    await removeFile(stored);
  await audit({
    action: "profile.avatar_removed",
    target: { type: "profile", id: session.user.id, label: before.displayName },
    changes: { avatarUrl: { from: before.avatarUrl ?? null, to: null } },
  });
  refreshWorkspace(ws.id);
  return { ok: true, url: "" };
}
