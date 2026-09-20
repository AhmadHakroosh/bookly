import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, schema } from "@bookly/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "./workspace";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Staff = a member of the organization that owns the current workspace (owner, admin, member). */
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

/** Use in every admin page/action. */
export async function requireStaff() {
  const session = await requireSession();
  const role = await getStaffRole();
  if (!role) redirect("/login?error=staff");
  return { session, role };
}
