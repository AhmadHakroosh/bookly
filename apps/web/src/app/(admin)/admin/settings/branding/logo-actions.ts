"use server";

import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { syncConnectBranding } from "@/server/connect";
import { fileIdFromUrl, fileUrl, getFile, removeFile, storeImage } from "@/server/files";
import { hasFlag } from "@/server/flags";
import { hasFeature, LimitError } from "@/server/limits";
import { assertManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import type { ImageUploadState } from "../../profile/avatar-actions";

/** Workspace logo: resized once, stored, and set on the branding at the same time. */
export async function uploadLogoAction(formData: FormData): Promise<ImageUploadState> {
  const { session, error } = await assertManager();
  if (error) return { error };
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace." };
  if (!(await hasFlag(ws, "file_uploads"))) return { error: "Uploads are not enabled yet." };
  if (!hasFeature(ws, "removeBranding"))
    return { error: "Your own logo and color come with Pro and Team." };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose an image first." };
  try {
    const stored = await storeImage({
      ws,
      kind: "logo",
      input: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      mime: file.type,
      userId: session.user.id,
      owner: { type: "workspace", id: ws.id },
    });
    const url = fileUrl(stored.id);
    const from = ws.settings.branding?.logoUrl ?? null;
    await db()
      .update(schema.workspaces)
      .set({ settings: { ...ws.settings, branding: { ...ws.settings.branding, logoUrl: url } } })
      .where(eq(schema.workspaces.id, ws.id));
    await audit({
      action: "settings.branding.logo_updated",
      target: { type: "workspace", id: ws.id, label: ws.name },
      changes: { logoUrl: { from, to: url } },
    });
    refreshWorkspace(ws.id);
    const fresh = await getCurrentWorkspace();
    if (fresh) await syncConnectBranding(fresh);
    return { ok: true, url };
  } catch (e) {
    return { error: e instanceof LimitError ? e.message : (e as Error).message };
  }
}

/** Clears the logo and deletes the uploaded file when it was one of ours. */
export async function removeLogoAction(): Promise<ImageUploadState> {
  const { error } = await assertManager();
  if (error) return { error };
  const ws = await getCurrentWorkspace();
  if (!ws) return { error: "No workspace." };
  const from = ws.settings.branding?.logoUrl ?? null;
  await db()
    .update(schema.workspaces)
    .set({ settings: { ...ws.settings, branding: { ...ws.settings.branding, logoUrl: null } } })
    .where(eq(schema.workspaces.id, ws.id));
  const id = fileIdFromUrl(from);
  const stored = id ? await getFile(ws, id) : null;
  if (stored && stored.ownerType === "workspace") await removeFile(stored);
  await audit({
    action: "settings.branding.logo_removed",
    target: { type: "workspace", id: ws.id, label: ws.name },
    changes: { logoUrl: { from, to: null } },
  });
  refreshWorkspace(ws.id);
  return { ok: true, url: "" };
}
