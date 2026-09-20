import "server-only";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";

/** Everything public for one workspace is tagged `workspace:<id>`; posts additionally `post:<id>`. */
export const workspaceTag = (workspaceId: string) => `workspace:${workspaceId}`;
export const postTag = (postId: string) => `post:${postId}`;

/** Call from Server Actions: readers see fresh data on the very next request. */
export function refreshWorkspace(workspaceId: string, ...extra: string[]) {
  updateTag(workspaceTag(workspaceId));
  for (const t of extra) updateTag(t);
  revalidatePath("/", "layout");
}

/** Call from jobs/route handlers (outside actions): stale-while-revalidate. */
export function refreshWorkspaceBackground(workspaceId: string) {
  revalidateTag(workspaceTag(workspaceId), "max");
  revalidatePath("/", "layout");
}
