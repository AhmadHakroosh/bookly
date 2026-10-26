import type { Solution } from "@bookly/db/schema";

/*
 * Who may enter which solution (ADR 0009 §3), as a pure rule the server and tests share:
 * owners and admins enter every enabled solution; members need a `solution_access` row (an
 * opportunity-team role also opens Hiring); collaborators only ever enter Hiring.
 */

export const SOLUTION_LABEL: Record<Solution, string> = { clients: "Clients", hiring: "Hiring" };

export function canEnter(
  solution: Solution,
  who: { role: string; grants: readonly Solution[]; onOpportunityTeam?: boolean },
): boolean {
  if (who.role === "owner" || who.role === "admin") return true;
  if (who.role === "collaborator")
    return solution === "hiring" && (who.grants.includes("hiring") || !!who.onOpportunityTeam);
  if (solution === "hiring" && who.onOpportunityTeam) return true;
  return who.grants.includes(solution);
}

/** The solutions a person may use here: enabled for the workspace and open to them, in order. */
export function solutionsOpenTo(
  enabled: readonly Solution[],
  who: Parameters<typeof canEnter>[1],
): Solution[] {
  return (["clients", "hiring"] as const).filter((s) => enabled.includes(s) && canEnter(s, who));
}
