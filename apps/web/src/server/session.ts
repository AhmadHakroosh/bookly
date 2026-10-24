import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, schema } from "@bookly/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCollaborator } from "@/lib/roles";
import { getCurrentWorkspace } from "./workspace";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * The current user's role in the organization that owns the workspace: owner, admin, member or
 * collaborator. Staff are the first three; collaborators are outside reviewers (ADR 0005).
 */
export const getStaffRole = cache(async (): Promise<string | null> => {
  const [session, workspace] = await Promise.all([getSession(), getCurrentWorkspace()]);
  if (!session || !workspace) return null;
  const row = await db().query.members.findFirst({
    where: and(
      eq(schema.members.organizationId, workspace.organizationId),
      eq(schema.members.userId, session.user.id),
    ),
    columns: { role: true },
  });
  return row?.role ?? null;
});

/**
 * Anyone in the workspace, collaborators included. Only for what a collaborator may use: the
 * admin shell, their own profile, availability, calendars, conferencing, account and
 * notifications. Everything else uses `requireStaff()`.
 */
export async function requireWorkspaceUser() {
  const session = await requireSession();
  const role = await getStaffRole();
  if (!role) redirect("/login?error=staff");
  return { session, role };
}

/**
 * Use in every admin page/action: the workspace's own people (owner, admin, member). A
 * collaborator is sent to their profile, so new pages are closed to them unless they opt in
 * with `requireWorkspaceUser()`.
 */
export async function requireStaff() {
  const user = await requireWorkspaceUser();
  if (isCollaborator(user.role)) redirect("/admin/profile");
  return user;
}

/** Owners and admins manage the workspace; members manage their own scheduling. */
export const isManager = (role: string | null | undefined) => role === "owner" || role === "admin";

/** Workspace pages (Settings, Team, Domains, Billing): members are sent back to Home. */
export async function requireManager() {
  const staff = await requireStaff();
  if (!isManager(staff.role)) redirect("/admin?error=role");
  return staff;
}

export const ROLE_ERROR = "Only workspace owners and admins can change this.";

/** Workspace actions: the same gate, as an error the form can show instead of a redirect. */
export async function assertManager() {
  const staff = await requireStaff();
  return isManager(staff.role) ? { ...staff, error: null } : { ...staff, error: ROLE_ERROR };
}
