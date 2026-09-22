/**
 * Cloud (SaaS) plans and limits. Pure data + helpers, shared by the app, billing and the
 * operator console. Prices are configured in Stripe; only price ids come from env.
 */
export type PlanId = "free" | "pro" | "team";

export type Limits = {
  /** Active event types per workspace (null = unlimited). */
  eventTypes: number | null;
  /** Members (hosts) per workspace. */
  members: number | null;
  /** Connected calendar / conferencing accounts per member. */
  integrations: number | null;
  /** Verified custom domains. */
  domains: number | null;
  /** New bookings per calendar month across the workspace (abuse control). */
  bookingsPerMonth: number | null;
  /** API requests per minute per key. */
  apiRequestsPerMinute: number | null;
  /** Auto-capture transcription minutes per month (0 = feature off, null = unlimited). */
  captureMinutesPerMonth: number | null;
  /** Feature gates. */
  payments: boolean;
  workflows: boolean;
  teamScheduling: boolean;
  api: boolean;
  removeBranding: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** USD per month, for display; Stripe is the source of truth. */
  priceMonthly: number;
  limits: Limits;
  /** Shown on plan cards, strongest first. */
  highlights: string[];
  /** The highlights that set this plan apart; cards render them emphasised. */
  featured: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For one person getting started.",
    priceMonthly: 0,
    limits: {
      eventTypes: 2,
      members: 1,
      integrations: 1,
      domains: 0,
      bookingsPerMonth: 100,
      apiRequestsPerMinute: 60,
      captureMinutesPerMonth: 0,
      payments: false,
      workflows: false,
      teamScheduling: false,
      api: false,
      removeBranding: false,
    },
    highlights: [
      "Contacts, briefings and the Meeting Inbox",
      "Built-in video, Meet, Zoom, Teams",
      "1 booking page, 2 event types",
      "1 connected calendar",
      "Email confirmations and reminders",
    ],
    featured: ["Contacts, briefings and the Meeting Inbox"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For professionals who take bookings seriously.",
    priceMonthly: 12,
    limits: {
      eventTypes: null,
      members: 1,
      integrations: null,
      domains: 1,
      bookingsPerMonth: null,
      apiRequestsPerMinute: 600,
      captureMinutesPerMonth: 300,
      payments: true,
      workflows: true,
      teamScheduling: false,
      api: true,
      removeBranding: true,
    },
    highlights: [
      "Auto-capture: transcripts, AI recaps, tasks (300 min / month)",
      "Paid bookings via Stripe",
      "Custom reminders, follow-ups, SMS and WhatsApp",
      "Unlimited event types",
      "Custom domain, your logo and colour, no Bookly branding",
      "API, webhooks, HubSpot and Pipedrive sync",
    ],
    featured: [
      "Auto-capture: transcripts, AI recaps, tasks (300 min / month)",
      "Paid bookings via Stripe",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "For teams that share the calendar.",
    priceMonthly: 10,
    limits: {
      eventTypes: null,
      members: 25,
      integrations: null,
      domains: 3,
      bookingsPerMonth: null,
      apiRequestsPerMinute: 1200,
      captureMinutesPerMonth: 1000,
      payments: true,
      workflows: true,
      teamScheduling: true,
      api: true,
      removeBranding: true,
    },
    highlights: [
      "Everything in Pro",
      "Round-robin and collective event types",
      "Auto-capture: 1000 transcribed minutes a month",
      "Up to 25 members, priced per member",
      "3 custom domains",
    ],
    featured: [
      "Round-robin and collective event types",
      "Auto-capture: 1000 transcribed minutes a month",
    ],
  },
};

/** Self-hosted installs have no limits at all. */
export const UNLIMITED: Limits = {
  eventTypes: null,
  members: null,
  integrations: null,
  domains: null,
  bookingsPerMonth: null,
  apiRequestsPerMinute: null,
  captureMinutesPerMonth: null,
  payments: true,
  workflows: true,
  teamScheduling: true,
  api: true,
  removeBranding: true,
};

export const isPlanId = (p: string): p is PlanId => p in PLANS;

/** Limits for a workspace: cloud plan → that plan, anything else (self-hosted) → unlimited. */
export function limitsFor(plan: string, status?: string | null): Limits {
  if (!isPlanId(plan)) return UNLIMITED;
  // A lapsed paid plan falls back to Free until Stripe reports it active again.
  if (plan !== "free" && status && !["active", "trialing", "past_due"].includes(status))
    return PLANS.free.limits;
  return PLANS[plan].limits;
}

export type CountableLimit = "eventTypes" | "members" | "integrations" | "domains";
export type RateLimitKey = "bookingsPerMonth" | "apiRequestsPerMinute";
export type FeatureLimit = "payments" | "workflows" | "teamScheduling" | "api" | "removeBranding";

/** True when adding one more of `what` stays within the limit. */
export function withinLimit(limits: Limits, what: CountableLimit, current: number): boolean {
  const max = limits[what];
  return max === null || current < max;
}

export const LIMIT_LABELS: Record<CountableLimit, string> = {
  eventTypes: "event types",
  members: "members",
  integrations: "connected accounts",
  domains: "custom domains",
};

export const FEATURE_LABELS: Record<FeatureLimit, string> = {
  payments: "Paid bookings",
  workflows: "Custom reminders and follow-ups",
  teamScheduling: "Round-robin and collective event types",
  api: "API and webhooks",
  removeBranding: "Your own branding",
};

/** First plan (cheapest) that allows `what`. */
export function planFor(what: FeatureLimit | CountableLimit, needed = 1): PlanId {
  for (const id of ["free", "pro", "team"] as PlanId[]) {
    const l = PLANS[id].limits;
    const v = l[what];
    if (typeof v === "boolean" ? v : v === null || v >= needed) return id;
  }
  return "team";
}

/** Requests per minute an API key gets on this plan (self-hosted: a generous default). */
export const apiBudget = (limits: Limits) => limits.apiRequestsPerMinute ?? 600;
