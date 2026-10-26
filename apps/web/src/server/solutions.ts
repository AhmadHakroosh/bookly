import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, eq, isNull, schema } from "@bookly/db";
import type { Solution } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { workspaceTag } from "./cache";
import { onAnyOpportunityTeam } from "./hiring/team";
import { solutionsOpenTo } from "./solutions-text";

/*
 * Clients and Hiring as solutions of a workspace (ADR 0009). Which ones run lives in
 * `workspace_solutions`; who may enter lives in roles and `solution_access` (the rule is in
 * `solutions-text.ts`). Records carry their own `solution`, set from the route or the parent.
 */

/** The solutions this workspace runs. */
export async function enabledSolutions(workspaceId: string): Promise<Solution[]> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  const rows = await db()
    .select({ solution: schema.workspaceSolutions.solution })
    .from(schema.workspaceSolutions)
    .where(
      and(
        eq(schema.workspaceSolutions.workspaceId, workspaceId),
        isNull(schema.workspaceSolutions.disabledAt),
      ),
    );
  return (["clients", "hiring"] as const).filter((s) => rows.some((r) => r.solution === s));
}

/** The solutions one member may use in this workspace. */
export async function solutionsFor(workspaceId: string, userId: string, role: string) {
  const [enabled, grants, team] = await Promise.all([
    enabledSolutions(workspaceId),
    db()
      .select({ solution: schema.solutionAccess.solution })
      .from(schema.solutionAccess)
      .where(
        and(
          eq(schema.solutionAccess.workspaceId, workspaceId),
          eq(schema.solutionAccess.userId, userId),
        ),
      ),
    onAnyOpportunityTeam(workspaceId, userId),
  ]);
  return solutionsOpenTo(enabled, {
    role,
    grants: grants.map((g) => g.solution),
    onOpportunityTeam: team,
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** A new workspace's solutions, written in the transaction that creates it. */
export async function startSolutions(
  tx: Tx,
  workspaceId: string,
  solutions: readonly Solution[],
  userId: string | null,
) {
  if (!solutions.length) throw new Error("A workspace runs at least one solution.");
  await tx
    .insert(schema.workspaceSolutions)
    .values(solutions.map((solution) => ({ workspaceId, solution, enabledBy: userId })))
    .onConflictDoNothing();
}
