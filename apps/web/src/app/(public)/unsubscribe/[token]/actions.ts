"use server";

import { GUEST_ACTOR, audit } from "@/server/audit";
import { getContactById, setEmailOptOut } from "@/server/contacts";
import { readUnsubscribeToken } from "@/server/unsubscribe";

export type UnsubscribeState = { ok?: boolean; error?: string };

export async function unsubscribe(token: string): Promise<UnsubscribeState> {
  const id = readUnsubscribeToken(token);
  const c = id ? await getContactById(id) : null;
  if (!c) return { error: "This link is not valid." };
  if (!c.emailOptOut) {
    await setEmailOptOut(c.workspaceId, c.id, true, "contact");
    await audit({
      action: "contact.unsubscribed",
      target: { type: "contact", id: c.id, label: c.name || c.email },
      actor: GUEST_ACTOR(c.email, c.name),
      workspace: c.workspaceId,
      changes: { emailOptOut: { from: false, to: true } },
    });
  }
  return { ok: true };
}
