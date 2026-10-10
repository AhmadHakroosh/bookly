"use server";

import { revalidatePath } from "next/cache";
import { refreshWorkspace } from "@/server/cache";
import {
  createCohort,
  deleteCohort,
  findWorkspaces,
  isFlagKey,
  setCohortMembership,
  setFlagCohorts,
  setFlagState,
  setWorkspaceFlag,
} from "@/server/flags";
import { audit } from "@/server/ops";
import { isPlatformAdmin } from "@/server/platform";
import { getSession } from "@/server/session";

/*
 * Feature flags, cohorts and per-workspace grants are operator decisions, so every change is
 * recorded in the operator audit log (the workspace's own activity log is for what hosts do).
 */

async function operator() {
  const session = await getSession();
  if (!session || !isPlatformAdmin(session.user.email)) throw new Error("Operators only");
  return session;
}

const back = (workspaceId?: string) => {
  revalidatePath("/console/flags");
  revalidatePath("/console/audit");
  if (workspaceId) {
    revalidatePath(`/console/${workspaceId}`);
    refreshWorkspace(workspaceId);
  }
};

export async function updateFlag(key: string, formData: FormData) {
  const s = await operator();
  if (!isFlagKey(key)) return;
  const state = String(formData.get("state") ?? "off");
  if (state !== "off" && state !== "beta" && state !== "on") return;
  const cohortIds = formData.getAll("cohorts").map(String).filter(Boolean);
  await setFlagState(key, state);
  await setFlagCohorts(key, cohortIds);
  await audit(s.user.email, "flag.updated", { type: "platform" }, { key, state, cohortIds });
  back();
}

export async function addCohort(formData: FormData) {
  const s = await operator();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 300);
  if (!name) return;
  const cohort = await createCohort(name, description);
  await audit(s.user.email, "cohort.created", { type: "platform" }, { id: cohort.id, name });
  back();
}

export async function removeCohort(id: string) {
  const s = await operator();
  await deleteCohort(id);
  await audit(s.user.email, "cohort.deleted", { type: "platform" }, { id });
  back();
}

/** Adds the workspaces whose slugs are listed (one per line or comma-separated). */
export async function addCohortWorkspaces(cohortId: string, formData: FormData) {
  const s = await operator();
  const slugs = String(formData.get("slugs") ?? "")
    .split(/[\s,]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 100);
  const found = await findWorkspaces(slugs);
  for (const ws of found) await setCohortMembership(cohortId, ws.id, true);
  await audit(
    s.user.email,
    "cohort.workspaces_added",
    { type: "platform" },
    {
      cohortId,
      slugs: found.map((w) => w.slug),
      unknown: slugs.filter((x) => !found.some((w) => w.slug === x)),
    },
  );
  for (const ws of found) refreshWorkspace(ws.id);
  back();
}

export async function removeCohortWorkspace(cohortId: string, workspaceId: string) {
  const s = await operator();
  await setCohortMembership(cohortId, workspaceId, false);
  await audit(
    s.user.email,
    "cohort.workspace_removed",
    { type: "workspace", id: workspaceId },
    { cohortId },
  );
  back(workspaceId);
}

/** From the workspace page: grant, deny or clear one flag for one workspace. */
export async function setWorkspaceFlagAction(workspaceId: string, formData: FormData) {
  const s = await operator();
  const key = String(formData.get("key") ?? "");
  if (!isFlagKey(key)) return;
  const mode = String(formData.get("mode") ?? "");
  const until = String(formData.get("until") ?? "");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 200);
  const expiresAt = until && !Number.isNaN(Date.parse(until)) ? new Date(until) : null;
  await setWorkspaceFlag(workspaceId, key, mode === "grant" || mode === "deny" ? mode : null, {
    expiresAt,
    note,
    by: s.user.email,
  });
  await audit(
    s.user.email,
    mode === "grant" ? "flag.granted" : mode === "deny" ? "flag.denied" : "flag.cleared",
    { type: "workspace", id: workspaceId },
    { key, expiresAt: expiresAt?.toISOString() ?? null, note },
  );
  back(workspaceId);
}

export async function toggleWorkspaceCohort(workspaceId: string, formData: FormData) {
  const s = await operator();
  const cohortId = String(formData.get("cohortId") ?? "");
  const member = formData.get("member") === "on";
  if (!cohortId) return;
  await setCohortMembership(cohortId, workspaceId, member);
  await audit(
    s.user.email,
    member ? "cohort.workspace_added" : "cohort.workspace_removed",
    { type: "workspace", id: workspaceId },
    { cohortId },
  );
  back(workspaceId);
}
