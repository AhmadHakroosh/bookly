"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { syncSeats } from "@/server/billing";
import { assertWithinLimit, LimitError } from "@/server/limits";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export type TeamState = { ok?: boolean; error?: string };

async function manager() {
  const [{ role, session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  if (role !== "owner" && role !== "admin")
    throw new Error("Only owners and admins can manage the team.");
  return { ws, session, h: await headers() };
}

export async function inviteMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const parsed = z
    .object({ email: z.email(), role: z.enum(["member", "admin"]).default("member") })
    .safeParse({
      email: String(formData.get("email") ?? "").trim(),
      role: formData.get("role") ?? "member",
    });
  if (!parsed.success) return { error: "Enter a valid email." };
  try {
    const { ws, h } = await manager();
    await assertWithinLimit(ws, "members");
    await auth.api.createInvitation({
      headers: h,
      body: { email: parsed.data.email, role: parsed.data.role, organizationId: ws.organizationId },
    });
  } catch (e) {
    if (e instanceof LimitError) return { error: `${e.message} See Billing.` };
    return { error: e instanceof Error ? e.message : "Invitation failed" };
  }
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function cancelInvite(id: string) {
  const { h } = await manager();
  await auth.api.cancelInvitation({ headers: h, body: { invitationId: id } }).catch(() => {});
  revalidatePath("/admin/team");
}

export async function removeMember(memberId: string) {
  const { ws, h } = await manager();
  await auth.api
    .removeMember({
      headers: h,
      body: { memberIdOrEmail: memberId, organizationId: ws.organizationId },
    })
    .catch(() => {});
  await syncSeats(ws);
  revalidatePath("/admin/team");
}

export async function setRole(memberId: string, role: "member" | "admin") {
  const { ws, h } = await manager();
  await auth.api
    .updateMemberRole({ headers: h, body: { memberId, role, organizationId: ws.organizationId } })
    .catch(() => {});
  revalidatePath("/admin/team");
}
