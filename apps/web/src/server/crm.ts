import "server-only";
import type { Contact, Workspace } from "@bookly/db/schema";
import { decrypt } from "@/lib/crypto";
import {
  hubspotContactProperties,
  hubspotNoteBody,
  pipedriveBase,
  pipedrivePersonBody,
} from "./crm-drivers";
import { api } from "./integrations/types";

/**
 * Best-effort CRM sync. Every call is fire-and-forget from the caller's point of view: a CRM
 * outage never blocks a booking. Remote ids are looked up by email on each call (no local map),
 * which keeps this stateless at the cost of one extra request.
 */
const HUBSPOT = "https://api.hubapi.com";

const crmOf = (ws: Workspace) => ws.settings.crm ?? null;
export const crmConfigured = (ws: Workspace) => !!crmOf(ws)?.apiKey;

async function hubspotFind(token: string, email: string): Promise<string | null> {
  const r = await api<{ results?: { id: string }[] }>(`${HUBSPOT}/crm/v3/objects/contacts/search`, {
    method: "POST",
    token,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email"],
      limit: 1,
    }),
  });
  return r.results?.[0]?.id ?? null;
}

async function pipedriveFind(base: string, key: string, email: string): Promise<number | null> {
  const r = await api<{ data?: { items?: { item: { id: number } }[] } }>(
    `${base}/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&limit=1&api_token=${encodeURIComponent(key)}`,
  );
  return r.data?.items?.[0]?.item.id ?? null;
}

/** Creates or updates the contact in the CRM; returns the remote id. */
export async function syncContact(ws: Workspace, c: Contact): Promise<string | null> {
  const crm = crmOf(ws);
  if (!crm?.apiKey) return null;
  const key = decrypt(crm.apiKey);
  try {
    if (crm.provider === "hubspot") {
      const props = hubspotContactProperties(c);
      const id = await hubspotFind(key, c.email);
      if (id) {
        await api(`${HUBSPOT}/crm/v3/objects/contacts/${id}`, {
          method: "PATCH",
          token: key,
          body: JSON.stringify({ properties: props }),
        });
        return id;
      }
      const created = await api<{ id: string }>(`${HUBSPOT}/crm/v3/objects/contacts`, {
        method: "POST",
        token: key,
        body: JSON.stringify({ properties: props }),
      });
      return created.id;
    }
    const base = pipedriveBase(crm.companyDomain);
    const id = await pipedriveFind(base, key, c.email);
    if (id) {
      await api(`${base}/persons/${id}?api_token=${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify(pipedrivePersonBody(c)),
      });
      return String(id);
    }
    const created = await api<{ data?: { id: number } }>(
      `${base}/persons?api_token=${encodeURIComponent(key)}`,
      { method: "POST", body: JSON.stringify(pipedrivePersonBody(c)) },
    );
    return created.data ? String(created.data.id) : null;
  } catch (e) {
    console.error(`[crm] ${crm.provider} sync failed for ${c.email}`, e);
    return null;
  }
}

/** Attaches a note (meeting summary, sent email) to the contact in the CRM. */
export async function pushNote(ws: Workspace, c: Contact, text: string): Promise<void> {
  const crm = crmOf(ws);
  if (!crm?.apiKey) return;
  const remoteId = await syncContact(ws, c);
  if (!remoteId) return;
  const key = decrypt(crm.apiKey);
  try {
    if (crm.provider === "hubspot") {
      await api(`${HUBSPOT}/crm/v3/objects/notes`, {
        method: "POST",
        token: key,
        body: JSON.stringify(hubspotNoteBody(remoteId, text)),
      });
    } else {
      await api(`${pipedriveBase(crm.companyDomain)}/notes?api_token=${encodeURIComponent(key)}`, {
        method: "POST",
        body: JSON.stringify({ content: text.slice(0, 65000), person_id: Number(remoteId) }),
      });
    }
  } catch (e) {
    console.error(`[crm] ${crm.provider} note failed for ${c.email}`, e);
  }
}
