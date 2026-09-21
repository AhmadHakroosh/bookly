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
  highlights: string[];
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
      payments: false,
      workflows: false,
      teamScheduling: false,
      api: false,
      removeBranding: false,
    },
    highlights: [
      "1 booking page",
      "2 event types",
      "1 connected calendar",
      "Built-in video, Meet, Zoom, Teams",
      "Email confirmations and reminders",
    ],
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
      payments: true,
      workflows: true,
      teamScheduling: false,
      api: true,
      removeBranding: true,
    },
    highlights: [
      "Unlimited event types",
      "Paid bookings via Stripe",
      "Custom reminders, follow-ups, SMS and WhatsApp",
      "Custom domain",
      "API and webhooks",
      "No Bookly branding",
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
      payments: true,
      workflows: true,
      teamScheduling: true,
      api: true,
      removeBranding: true,
    },
    highlights: [
      "Everything in Pro",
      "Up to 25 members, priced per member",
      "Round-robin and collective event types",
      "3 custom domains",
    ],
  },
};

/** Self-hosted installs have no limits at all. */
export const UNLIMITED: Limits = {
  eventTypes: null,
  members: null,
  integrations: null,
  domains: null,
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
  removeBranding: "Removing Bookly branding",
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
