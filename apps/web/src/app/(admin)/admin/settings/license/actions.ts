"use server";

import { z } from "zod";
import { audit } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { removeLicenseKey, saveLicenseKey } from "@/server/editions";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export type LicenseState = { ok?: boolean; error?: string };

/** The install's license key is the owner's call: it is a contract with Cloudeo. */
async function ownerOnly(): Promise<string | null> {
  const { role } = await requireStaff();
  if (role !== "owner") return "Only the workspace owner can change the license.";
  if (isCloud()) return "The hosted service's license is set by the operator.";
  return null;
}

export async function saveLicenseAction(
  _prev: LicenseState,
  formData: FormData,
): Promise<LicenseState> {
  const denied = await ownerOnly();
  if (denied) return { error: denied };
  const key = z.string().trim().min(1).max(4000).safeParse(formData.get("key"));
  if (!key.success) return { error: "Paste a license key." };
  const status = await saveLicenseKey(key.data);
  if (status.state === "missing") return { error: "Paste a license key." };
  if (status.state === "invalid") return { error: `That key isn't valid: ${status.reason}.` };
  const ws = await getCurrentWorkspace();
  await audit({
    action: "license.updated",
    target: { type: "license", id: status.license.licenseId, label: status.license.customer.name },
    changes: {
      edition: { to: status.license.edition },
      expiresAt: { to: status.license.expiresAt },
      seats: { to: status.license.seats },
    },
  });
  if (ws) refreshWorkspace(ws.id);
  return { ok: true };
}

export async function removeLicenseAction(): Promise<LicenseState> {
  const denied = await ownerOnly();
  if (denied) return { error: denied };
  await removeLicenseKey();
  const ws = await getCurrentWorkspace();
  await audit({ action: "license.removed", target: { type: "license" } });
  if (ws) refreshWorkspace(ws.id);
  return { ok: true };
}
