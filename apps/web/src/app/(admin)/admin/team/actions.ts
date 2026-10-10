"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/server/audit";
import { previewSeatAdd, syncSeats } from "@/server/billing";
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
  const { ws, h } = await manager();
  try {
    await assertWithinLimit(ws, "members");
  } catch (e) {
    if (e instanceof LimitError) return { error: `${e.message} See Billing.` };
    throw e;
  }
  // A member past the seats already billed costs money once they accept: show that first.
  if (formData.get("confirmed") !== "1" && (await previewSeatAdd(ws))) {
    const q = new URLSearchParams({ email: parsed.data.email, role: parsed.data.role });
    redirect(`/admin/team/invite?${q}`);
  }
  let invitationId: string | undefined;
  try {
    const inv = await auth.api.createInvitation({
      headers: h,
      body: { email: parsed.data.email, role: parsed.data.role, organizationId: ws.organizationId },
    });
    invitationId = inv?.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invitation failed" };
  }
  await audit({
    action: formData.get("confirmed") === "1" ? "member.invite_confirmed" : "member.invited",
    target: { type: "invitation", id: invitationId, label: parsed.data.email },
    changes: { role: { to: parsed.data.role } },
  });
  revalidatePath("/admin/team");
  return { ok: true };
}

/** The owner saw the seat cost and agreed: send the invitation. */
export async function confirmInvite(email: string, role: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("role", role);
  fd.set("confirmed", "1");
  const r = await inviteMember({}, fd);
  redirect(r.error ? `/admin/team?error=${encodeURIComponent(r.error)}` : "/admin/team?invited=1");
}

export async function cancelInvite(id: string) {
  const { h } = await manager();
  const inv = await auth.api
    .cancelInvitation({ headers: h, body: { invitationId: id } })
    .catch(() => null);
  if (inv)
    await audit({
      action: "member.invite_cancelled",
      target: { type: "invitation", id, label: inv.email },
    });
  revalidatePath("/admin/team");
}

export async function removeMember(memberId: string) {
  const { ws, h } = await manager();
  const r = await auth.api
    .removeMember({
      headers: h,
      body: { memberIdOrEmail: memberId, organizationId: ws.organizationId },
    })
    .catch(() => null);
  await syncSeats(ws);
  if (r)
    await audit({
      action: "member.removed",
      target: { type: "member", id: r.member.id, label: r.member.user.email },
      changes: { role: { from: r.member.role } },
    });
  revalidatePath("/admin/team");
}

export async function setRole(memberId: string, role: "member" | "admin") {
  const { ws, h } = await manager();
  const m = await auth.api
    .updateMemberRole({ headers: h, body: { memberId, role, organizationId: ws.organizationId } })
    .catch(() => null);
  if (m)
    await audit({
      action: "member.role_changed",
      target: { type: "member", id: memberId, label: m.user.email },
      changes: { role: { to: role } },
    });
  revalidatePath("/admin/team");
}
