/*
 * Agentic Resource Discovery (ARD, https://agenticresourcediscovery.org): the manifest an AI
 * agent reads to learn what this site offers it. Bookly publishes one entry, an Agent Skill
 * that explains how to find a host's availability and book, cancel or reschedule. Kept free of
 * server imports so the unit test can validate it the way Lighthouse's `ard-schema` audit does.
 */

export const ARD_PATH = "/.well-known/ard.json";
/** The predecessor path and link relation (`ai-catalog`); consumers may still look there. */
export const ARD_LEGACY_PATH = "/.well-known/ai-catalog.json";
export const SKILL_PATH = "/.well-known/agent-skills/scheduling.md";
export const ARD_CONTEXT = "https://agenticresourcediscovery.org/context/v1";
/** The ARD media type for an Agent Skill written in Markdown. */
export const SKILL_MEDIA_TYPE = 'text/markdown; profile="urn:air:agent-skills"';

export type ArdEntry = {
  "@context": string;
  identifier: string;
  displayName: string;
  type: string;
  url: string;
  description: string;
  capabilities: string[];
  /** 2 to 5 example requests; the semantic index is built from them. */
  representativeQueries: string[];
  tags: string[];
  version: string;
  updatedAt: string;
};

export type ArdManifest = {
  specVersion: "1.0";
  host: { displayName: string; identifier: string };
  entries: ArdEntry[];
};

/** `urn:air:<publisher>:<namespace>:<name>`; the publisher is the domain the manifest lives on. */
export const ardIdentifier = (publisher: string, namespace: string, name: string) =>
  `urn:air:${publisher}:${namespace}:${name}`;

export function buildArdManifest(opts: {
  /** `https://bookly-app.io` */
  base: string;
  name: string;
  version: string;
  updatedAt: string;
}): ArdManifest {
  const publisher = new URL(opts.base).hostname;
  return {
    specVersion: "1.0",
    host: { displayName: opts.name, identifier: `did:web:${publisher}` },
    entries: [
      {
        "@context": ARD_CONTEXT,
        identifier: ardIdentifier(publisher, "skills", "scheduling"),
        displayName: `Book a meeting with ${opts.name}`,
        type: SKILL_MEDIA_TYPE,
        url: `${opts.base}${SKILL_PATH}`,
        description:
          "How an agent finds a host's booking page, reads their event types and free times, books a meeting on the guest's behalf, and cancels or reschedules it later, using the public REST API and the booking pages.",
        capabilities: [
          "ListEventTypes",
          "GetAvailability",
          "CreateBooking",
          "CancelBooking",
          "RescheduleBooking",
        ],
        representativeQueries: [
          "book a 30 minute call with this host next week",
          "when is this person free on Thursday afternoon",
          "cancel the meeting I booked for tomorrow",
          "move my booking to a later time",
          "what kinds of meetings can I book with them",
        ],
        tags: ["scheduling", "booking", "calendar", "meetings"],
        version: opts.version,
        updatedAt: opts.updatedAt,
      },
    ],
  };
}
