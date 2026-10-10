"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { deleteAccount } from "@/server/data-rights";
import { requireSession } from "@/server/session";

export type AccountState = { error?: string; ok?: boolean };

/** Gives an account created through a provider its first password (a second way to sign in). */
export async function setPasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  await requireSession();
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 10) return { error: "Use at least 10 characters." };
  if (newPassword !== String(formData.get("confirm") ?? ""))
    return { error: "The passwords do not match." };
  try {
    await auth.api.setPassword({ headers: await headers(), body: { newPassword } });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not set the password." };
  }
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
  const res = await deleteAccount(session.user.id);
  if ("error" in res) return res;
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/login?deleted=1");
}
