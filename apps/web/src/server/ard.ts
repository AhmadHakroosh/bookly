import "server-only";
import { headers } from "next/headers";
import { isCloud, platformHost } from "./platform";
import { SITE, siteUrl } from "@/app/(platform)/platform/site";
import { buildArdManifest, SKILL_MEDIA_TYPE, SKILL_PATH } from "@/lib/ard";
import { version } from "../../package.json";

/** Only the platform host publishes agent resources; workspace hosts answer 404. */
export async function onPlatformHostOrNull(): Promise<string | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]!
    .trim()
    .toLowerCase();
  return isCloud() && host === platformHost() ? siteUrl() : null;
}

export const ardManifestFor = (base: string) =>
  buildArdManifest({ base, name: SITE.name, version, updatedAt: SITE.updated });

/**
 * The Agent Skill (https://agentskills.io): Markdown with a front matter an agent loads when a
 * task matches its description. Everything here is also what a person would read in docs/api.md.
 */
export function schedulingSkill(base: string): string {
  return `---
name: bookly-scheduling
description: Find a Bookly host's booking page, read their event types and free times, and book, cancel or reschedule a meeting on the guest's behalf.
---

# Booking a meeting with Bookly

Bookly hosts publish booking pages. Every workspace has its own host (\`<workspace>.bookly-app.io\`
or a custom domain) and the same public REST API under \`/api/v1\` on that host. Responses are
\`{ "data": …, "meta": … }\` or \`{ "error": { "code", "message" } }\`. Public endpoints need no
key (60 requests a minute per IP); creating or changing bookings through the API needs a key
the host issues (\`Authorization: Bearer bk_…\`). Without a key, book through the booking page:
its form is a WebMCP declarative tool (\`toolname="book_meeting"\`).

## 1. Find the host and what can be booked

- \`GET https://<host>/api/v1/workspace\`: the workspace name, timezone and its public booking
  pages (\`hosts\`, each with a \`username\`).
- \`GET https://<host>/api/v1/event-types?username=<username>\`: the bookable event types with
  \`slug\`, \`durationMin\`, \`locations\` (the ways to meet: Bookly video, Google Meet, Zoom,
  Teams, phone, in person) and \`questions\` the guest must answer.

## 2. Find a free time

\`GET https://<host>/api/v1/availability?username=<username>&event=<slug>&timezone=<IANA tz>&from=YYYY-MM-DD&to=YYYY-MM-DD\`
returns free start times grouped by day in the requested timezone (at most 62 days). Each slot
lasts the event type's duration. Group event types add \`seatsLeft\` per slot.

## 3. Book

With a key: \`POST https://<host>/api/v1/bookings\` with
\`{ "username", "event", "start", "timezone", "name", "email", "phone"?, "notes"?, "answers"?, "location"?, "address"?, "guests"? }\`.
\`answers\` is keyed by question id or label and required questions must be answered;
\`location\` is one of the event type's location types and required when it offers several.
A \`409\` means the slot was taken; fetch availability again.

Without a key, open \`https://<host>/<username>/<slug>?date=YYYY-MM-DD&slot=<ISO start>\` and
fill the booking form; the confirmation email carries a manage link.

## 4. Cancel or reschedule

With a key: \`POST /api/v1/bookings/{id}/cancel\` \`{ "reason"? }\` and
\`POST /api/v1/bookings/{id}/reschedule\` \`{ "start", "timezone"? }\` (returns the replacement).
Without a key, the manage link from the confirmation email (\`/booking/<token>\`) has forms to
cancel or reschedule; they are WebMCP declarative tools too.

## Rules

- Always show the guest the time in their own timezone before booking.
- Never invent an email or phone number; ask the guest for them.
- One booking per request; do not retry a \`409\` with the same slot.

Machine-readable API description: \`${base}/api/v1/openapi.json\`. Human documentation:
\`${base}/docs/api\`. Site map for agents: \`${base}/llms.txt\`.
`;
}

export const SKILL_HEADERS = {
  "content-type": `${SKILL_MEDIA_TYPE}; charset=utf-8`,
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
};

export { SKILL_PATH };
