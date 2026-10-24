import "server-only";
import { getActor } from "@/server/access";
import { hasFlag, inBeta } from "@/server/flags";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/**
 * What every hiring page and action starts from: the workspace with the `hiring` flag on and the
 * actor whose access the reads and writes check (ADR 0005). Null when hiring is off here.
 */
export async function hiringContext() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "hiring"))) return null;
  const [actor, beta] = await Promise.all([getActor(), inBeta(ws, "hiring")]);
  if (!actor) return null;
  return { ws, actor, session, beta };
}

export const opportunityPath = (id: string, rest = "") =>
  `/admin/hiring/opportunities/${id}${rest}`;
export const setupPath = (id: string, step: string, query = "") =>
  opportunityPath(id, `/setup/${step}${query ? `?${query}` : ""}`);
