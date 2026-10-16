"use server";

import { recordHomeVisit } from "@/server/home";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/** Called once Home has rendered, so the next visit can show what is new since this one. */
export async function markHomeVisited() {
  // audit: read-only — records the member's own last Home visit (UI state, not workspace data)
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return;
  await recordHomeVisit(ws.id, session.user.id);
}
