"use server";

import { revalidatePath } from "next/cache";
import { isEeFeature } from "@bookly/editions";
import { refreshWorkspace } from "@/server/cache";
import { setWorkspaceEntitlement } from "@/server/editions";
import { audit } from "@/server/ops";
import { isPlatformAdmin } from "@/server/platform";
import { getSession } from "@/server/session";

/*
 * Commercial grants are operator decisions (an Enterprise contract on the hosted service), so
 * every change goes to the operator audit log, like flag grants.
 */

async function operator() {
  const session = await getSession();
  if (!session || !isPlatformAdmin(session.user.email)) throw new Error("Operators only");
  return session;
}

export async function setWorkspaceEntitlementAction(workspaceId: string, formData: FormData) {
  const s = await operator();
  const feature = String(formData.get("feature") ?? "");
  if (!isEeFeature(feature)) return;
  const revoke = formData.get("mode") === "revoke";
  const until = String(formData.get("until") ?? "");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 200);
  const expiresAt = until && !Number.isNaN(Date.parse(until)) ? new Date(until) : null;
  await setWorkspaceEntitlement(
    workspaceId,
    feature,
    revoke ? null : { expiresAt, note, by: s.user.email },
  );
  await audit(
    s.user.email,
    revoke ? "entitlement.revoked" : "entitlement.granted",
    { type: "workspace", id: workspaceId },
    { feature, expiresAt: expiresAt?.toISOString() ?? null, note },
  );
  revalidatePath(`/console/${workspaceId}`);
  revalidatePath("/console/audit");
  refreshWorkspace(workspaceId);
}
