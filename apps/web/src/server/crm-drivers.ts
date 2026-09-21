/**
 * Pure request builders for CRM sync — exported for tests. HubSpot uses a private-app token
 * (Bearer); Pipedrive an API token in the query string.
 */
import type { Contact } from "@bookly/db/schema";

export type CrmProvider = "hubspot" | "pipedrive";

export function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export function hubspotContactProperties(
  c: Pick<Contact, "email" | "name" | "company" | "phone" | "stage">,
) {
  const { first, last } = splitName(c.name);
  return {
    email: c.email,
    firstname: first || undefined,
    lastname: last || undefined,
    company: c.company ?? undefined,
    phone: c.phone ?? undefined,
    lifecyclestage: { lead: "lead", active: "opportunity", won: "customer", lost: "other" }[
      c.stage
    ],
  };
}

export function hubspotNoteBody(contactRemoteId: string, text: string, at = new Date()) {
  return {
    properties: { hs_timestamp: at.toISOString(), hs_note_body: text.slice(0, 65000) },
    associations: [
      {
        to: { id: contactRemoteId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
      },
    ],
  };
}

export function pipedrivePersonBody(c: Pick<Contact, "email" | "name" | "phone">) {
  return {
    name: c.name || c.email,
    email: [{ value: c.email, primary: true, label: "work" }],
    ...(c.phone ? { phone: [{ value: c.phone, primary: true, label: "work" }] } : {}),
  };
}

export const pipedriveBase = (companyDomain?: string) =>
  `https://${companyDomain?.trim() || "api"}.pipedrive.com/v1`;
