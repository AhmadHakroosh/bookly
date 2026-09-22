"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { deleteAccount } from "@/server/data-rights";
import { requireSession } from "@/server/session";

export type AccountState = { error?: string };

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
