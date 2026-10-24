"use server";

import { isCollaborator } from "@/lib/roles";
import { listContacts } from "@/server/contacts";
import { requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export type JumpContact = { id: string; name: string; detail: string };

/**
 * ⌘K's search: the workspace's contacts by name, email or company. Collaborators see no client
 * work (ADR 0005), so they get nothing back and the menu only jumps between their pages.
 */
export async function searchContactsAction(q: string): Promise<JumpContact[]> {
  // audit: read-only — a search as the member types; nothing is stored
  const [{ role }, ws] = await Promise.all([requireWorkspaceUser(), getCurrentWorkspace()]);
  const query = q.trim().slice(0, 100);
  if (!ws || isCollaborator(role) || query.length < 2) return [];
  const rows = await listContacts(ws.id, { q: query, limit: 6 });
  return rows.map((c) => ({
    id: c.id,
    name: c.name || c.email,
    detail: [c.company, c.email].filter(Boolean).join(" · "),
  }));
}
