import "server-only";
import { and, eq, isNull, or, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { fileIdFromUrl, fileUrl, getFileAnywhere, removeFile, storeImage } from "@/server/files";

/*
 * One photo per person (planning/v2/ux/solutions-and-navigation.md §5.3): `users.image`, shown in
 * the sidebar, on every member row and avatar stack, and on each booking page that hasn't chosen
 * a photo of its own. A booking page "follows" the account photo while its `avatarUrl` is empty
 * or still the account's previous photo; a different URL there is the per-workspace override.
 */

/** The image is stored once, in the workspace it was uploaded from, as a public file. */
export async function storeAccountPhoto(
  ws: Workspace,
  userId: string,
  input: Buffer,
  name: string,
  mime: string,
) {
  const stored = await storeImage({
    ws,
    kind: "avatar",
    input,
    name,
    mime,
    userId,
    owner: { type: "user", id: userId },
  });
  return fileUrl(stored.id);
}

/**
 * Points the account at `next` (or nothing) and moves every booking page that followed the old
 * photo along with it. Returns the previous photo.
 */
export async function setAccountPhoto(userId: string, next: string | null) {
  const user = await db().query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { image: true, name: true, email: true },
  });
  const before = user?.image ?? null;
  await db()
    .update(schema.users)
    .set({ image: next, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
  const p = schema.profiles;
  await db()
    .update(p)
    .set({ avatarUrl: next })
    .where(
      and(
        eq(p.userId, userId),
        before ? or(isNull(p.avatarUrl), eq(p.avatarUrl, before)) : isNull(p.avatarUrl),
      ),
    );
  return { before, name: user?.name ?? user?.email ?? "" };
}

/** Deletes a replaced account photo when it was one of ours (not a pasted URL). */
export async function dropStoredPhoto(url: string | null, userId: string) {
  const id = fileIdFromUrl(url);
  const file = id ? await getFileAnywhere(id) : null;
  if (file && file.ownerType === "user" && file.ownerId === userId) await removeFile(file);
}

/** Hosts the sign-in providers serve profile pictures from. Nothing else is ever fetched. */
const PROVIDER_HOSTS = [
  /(^|\.)googleusercontent\.com$/,
  /^avatars\.githubusercontent\.com$/,
  /^graph\.microsoft\.com$/,
];

/** A picture a sign-in provider set (hot-linked), not one stored here. */
export function providerPhoto(image: string | null | undefined): URL | null {
  if (!image) return null;
  try {
    const u = new URL(image);
    return u.protocol === "https:" && PROVIDER_HOSTS.some((h) => h.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

/**
 * Copies a provider's picture into storage once, so it is never hot-linked (the provider sees
 * nothing of who views it, and it survives the provider changing it). Best effort and quiet: a
 * failure leaves the provider URL in place until the next try.
 */
export async function importProviderPhoto(ws: Workspace, userId: string, image: string) {
  const url = providerPhoto(image);
  if (!url) return;
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    const mime = res.headers.get("content-type") ?? "";
    const size = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || !mime.startsWith("image/") || size > 10 * 1024 * 1024) return;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return;
    const stored = await storeAccountPhoto(ws, userId, buf, "photo", mime);
    await setAccountPhoto(userId, stored);
  } catch (e) {
    console.warn("[photos] provider import", (e as Error).message);
  }
}
