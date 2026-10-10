"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, inArray, schema } from "@bookly/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit, type AuditActor } from "@/server/audit";
import { deleteAccount } from "@/server/data-rights";
import { requireSession } from "@/server/session";

export type AccountState = { error?: string; ok?: boolean };

/** Gives an account created through a provider its first password (a second way to sign in). */
export async function setPasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await requireSession();
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 10) return { error: "Use at least 10 characters." };
  if (newPassword !== String(formData.get("confirm") ?? ""))
    return { error: "The passwords do not match." };
  try {
    await auth.api.setPassword({ headers: await headers(), body: { newPassword } });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not set the password." };
  }
  await audit({
    action: "account.password_set",
    target: { type: "user", id: session.user.id, label: session.user.email },
  });
  return { ok: true };
}

/** Delete the signed-in user. Refused while they still own a workspace. */
export async function deleteAccountAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await requireSession();
  if (String(formData.get("confirm")).trim().toLowerCase() !== session.user.email.toLowerCase())
    return { error: "Type your email address to confirm." };
  // Every workspace the user belongs to keeps a record; memberships are gone after the delete,
  // and so is the session's user, so both are captured here.
  const orgs = (
    await db().query.members.findMany({
      where: eq(schema.members.userId, session.user.id),
      columns: { organizationId: true },
    })
  ).map((m) => m.organizationId);
  const workspaces = orgs.length
    ? await db().query.workspaces.findMany({
        where: inArray(schema.workspaces.organizationId, orgs),
        columns: { id: true },
      })
    : [];
  const actor: AuditActor = { type: "user", id: session.user.id, label: session.user.email };
  const res = await deleteAccount(session.user.id);
  if ("error" in res) return res;
  for (const ws of workspaces)
    await audit({
      action: "account.deleted",
      target: { type: "user", id: session.user.id, label: session.user.email },
      workspace: ws.id,
      actor,
    });
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/login?deleted=1");
}
