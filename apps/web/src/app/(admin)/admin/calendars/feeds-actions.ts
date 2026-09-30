"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addFeed, invalidateBusy, listFeeds, removeFeed, syncFeed } from "@/server/integrations";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export type FeedState = { ok?: boolean; error?: string };

const addSchema = z.object({
  url: z.string().trim().min(8).max(2000),
  label: z.string().trim().max(80).default(""),
});

/** Subscribes to a feed: the address is checked, fetched once and stored with its busy blocks. */
export async function addFeedAction(_prev: FeedState, formData: FormData): Promise<FeedState> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return { error: "No workspace" };
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Paste the feed address (an https:// or webcal:// link)." };
  try {
    await addFeed(ws.id, session.user.id, parsed.data.url, parsed.data.label || null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add the feed" };
  }
  invalidateBusy(session.user.id);
  revalidatePath("/admin/calendars");
  return { ok: true };
}

export async function refreshFeedAction(id: string): Promise<void> {
  const { session } = await requireStaff();
  const feed = (await listFeeds(session.user.id)).find((f) => f.id === id);
  if (!feed) return;
  await syncFeed(feed);
  invalidateBusy(session.user.id);
  revalidatePath("/admin/calendars");
}

export async function removeFeedAction(id: string): Promise<void> {
  const { session } = await requireStaff();
  await removeFeed(session.user.id, id);
  invalidateBusy(session.user.id);
  revalidatePath("/admin/calendars");
}
