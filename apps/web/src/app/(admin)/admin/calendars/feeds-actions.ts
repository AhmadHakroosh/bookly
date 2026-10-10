"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CalendarFeed } from "@bookly/db/schema";
import { audit, diff } from "@/server/audit";
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
  let feed: CalendarFeed;
  try {
    feed = await addFeed(ws.id, session.user.id, parsed.data.url, parsed.data.label || null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add the feed" };
  }
  await audit({
    action: "calendar_feed.added",
    target: { type: "calendar_feed", id: feed.id, label: feed.label },
    changes: { status: { to: feed.status }, events: { to: feed.eventCount } },
  });
  invalidateBusy(session.user.id);
  revalidatePath("/admin/calendars");
  return { ok: true };
}

export async function refreshFeedAction(id: string): Promise<void> {
  const { session } = await requireStaff();
  const feed = (await listFeeds(session.user.id)).find((f) => f.id === id);
  if (!feed) return;
  const synced = await syncFeed(feed);
  await audit({
    action: "calendar_feed.refreshed",
    target: { type: "calendar_feed", id: feed.id, label: feed.label },
    changes: diff(feed, synced, ["status", "eventCount"]),
  });
  invalidateBusy(session.user.id);
  revalidatePath("/admin/calendars");
}

export async function removeFeedAction(id: string): Promise<void> {
  const { session } = await requireStaff();
  const feed = (await listFeeds(session.user.id)).find((f) => f.id === id);
  await removeFeed(session.user.id, id);
  await audit({
    action: "calendar_feed.removed",
    target: { type: "calendar_feed", id, label: feed?.label },
  });
  invalidateBusy(session.user.id);
  revalidatePath("/admin/calendars");
}
