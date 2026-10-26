import { PLANS } from "@bookly/cloud";

/** "Straight answers" on Home (before the closing CTA): the questions people ask first. */
export const HOME_FAQ: [string, string][] = [
  [
    "Is Bookly really free?",
    `Yes. The Free plan gives you a booking page, ${PLANS.free.limits.eventTypes} event types, one connected calendar or video account, contacts, briefings and paid bookings (with a ${PLANS.free.feePercent}% platform fee), for as long as you like. No card needed.`,
  ],
  [
    "Is Bookly open source?",
    "The core is, under AGPL-3.0: scheduling, contacts, briefings, capture and recaps with your own AI key, the API and more. Enterprise modules such as single sign-on are source-available under the Elastic License 2.0, so every line that runs is published.",
  ],
  [
    "Can I run it on my own server?",
    "Yes. docker compose up runs everything with no third-party accounts; Bookly video through Daily is optional. Self-hosted installs have no plan limits and send nothing beyond a daily update check, which TELEMETRY=off turns off.",
  ],
  [
    "Does Bookly record my calls?",
    "Only with consent. Attendees are asked, everyone sees a live notice while the transcript runs, and it expires on the retention period you set. Any attendee can delete it.",
  ],
  [
    "Is my data used to train AI?",
    "No. AI features are optional; on Bookly's cloud they use Anthropic's Claude under commercial terms that exclude training, and self-hosters bring their own provider or none.",
  ],
  [
    "Does Bookly do hiring?",
    "Yes, in beta by invitation: round setup from templates, application and status pages, and a pipeline board. Independent reviews, interview scheduling and decisions arrive with Bookly 1.0. AI summarizes; people decide. Client work is available to everyone today.",
  ],
  [
    "Can I take my data with me?",
    "Any time. Export the whole workspace as JSON from Settings, or delete the workspace or your account yourself. No ticket needed.",
  ],
];
