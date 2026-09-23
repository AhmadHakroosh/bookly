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
  /** The minutes are per member and pooled across the workspace (Team), not a flat budget. */
  captureMinutesPerMember?: boolean;
  /** Feature gates. */
  /** Bookly video rooms (Daily); the other conferencing providers are always available. */
  booklyVideo: boolean;
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
  /** USD per year when billed annually (two months free); 0 on Free. */
  priceYearly: number;
  /** Seats always billed, whatever the member count (Team starts at two). */
  minSeats: number;
  /** Platform fee on paid bookings, percent of each payment; the console can override it. */
  feePercent: number;
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
    priceYearly: 0,
    minSeats: 1,
    feePercent: 5,
    limits: {
      eventTypes: 2,
      members: 1,
      integrations: 1,
      domains: 0,
      bookingsPerMonth: 100,
      apiRequestsPerMinute: 60,
      captureMinutesPerMonth: 0,
      booklyVideo: false,
      payments: false,
      workflows: false,
      teamScheduling: false,
      api: false,
      removeBranding: false,
    },
    highlights: [
      "Contacts, briefings and the Meeting Inbox",
      "Google Meet, Zoom, Teams, phone, in person",
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
    priceMonthly: 19,
    priceYearly: 190,
    minSeats: 1,
    feePercent: 3,
    limits: {
      eventTypes: null,
      members: 1,
      integrations: null,
      domains: 1,
      bookingsPerMonth: null,
      apiRequestsPerMinute: 600,
      captureMinutesPerMonth: 300,
      booklyVideo: true,
      payments: true,
      workflows: true,
      teamScheduling: false,
      api: true,
      removeBranding: true,
    },
    highlights: [
      "Auto-capture: transcripts, AI recaps, tasks (300 min / month, then 5¢ a minute)",
      "Bookly video, no account needed by anyone",
      "Paid bookings via Stripe, 3% platform fee",
      "Custom reminders, follow-ups, SMS and WhatsApp",
      "Unlimited event types",
      "Custom domain, your logo and colour, no Bookly branding",
      "API, webhooks, HubSpot and Pipedrive sync",
    ],
    featured: [
      "Auto-capture: transcripts, AI recaps, tasks (300 min / month, then 5¢ a minute)",
      "Bookly video, no account needed by anyone",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "For teams that share the calendar.",
    priceMonthly: 16,
    priceYearly: 160,
    minSeats: 2,
    feePercent: 1,
    limits: {
      eventTypes: null,
      members: 25,
      integrations: null,
      domains: 3,
      bookingsPerMonth: null,
      apiRequestsPerMinute: 1200,
      captureMinutesPerMonth: 200,
      captureMinutesPerMember: true,
      booklyVideo: true,
      payments: true,
      workflows: true,
      teamScheduling: true,
      api: true,
      removeBranding: true,
    },
    highlights: [
      "Everything in Pro",
      "Round-robin and collective event types",
      "Auto-capture: 200 transcribed minutes a month per member, pooled, then 5¢ a minute",
      "Paid bookings at a 1% platform fee",
      "2 to 25 members, priced per member",
      "3 custom domains",
    ],
    featured: [
      "Round-robin and collective event types",
      "Auto-capture: 200 transcribed minutes a month per member, pooled, then 5¢ a minute",
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
  booklyVideo: true,
  payments: true,
  workflows: true,
  teamScheduling: true,
  api: true,
  removeBranding: true,
};

/** USD per transcribed minute beyond the plan's included minutes (Stripe metered price). */
export const CAPTURE_OVERAGE_PER_MINUTE = 0.05;

/**
 * Minutes to bill for a transcript that took the month from `usedBefore` to `usedAfter`
 * minutes against a budget of `max`: only the part above the budget, so a transcript that
 * straddles the line is charged for the excess alone.
 */
export function captureOverageDelta(usedBefore: number, usedAfter: number, max: number | null) {
  if (max === null) return 0;
  return Math.max(0, usedAfter - max) - Math.max(0, usedBefore - max);
}

export const isPlanId = (p: string): p is PlanId => p in PLANS;

/** How a paid plan is billed. Yearly is charged up front and works out to two months free. */
/** Seats a workspace pays for: its members, never fewer than the plan's minimum. */
export const billedSeats = (plan: Plan, members: number) => Math.max(plan.minSeats, members);

/**
 * The workspace's monthly transcription budget: flat, or per billed seat and pooled (so a
 * two-seat minimum on Team also means two seats' worth of minutes).
 */
export function captureBudget(plan: Plan, members: number): number | null {
  const m = plan.limits.captureMinutesPerMonth;
  if (m === null || m === 0) return m;
  return plan.limits.captureMinutesPerMember ? m * billedSeats(plan, members) : m;
}

export type BillingInterval = "month" | "year";
export const isInterval = (i: string): i is BillingInterval => i === "month" || i === "year";

/** What the customer pays per period for a plan (per member on Team). */
export const planPrice = (plan: Plan, interval: BillingInterval) =>
  interval === "year" ? plan.priceYearly : plan.priceMonthly;

/** The yearly price spread over twelve months, for "per month, billed yearly" labels and MRR. */
export const monthlyEquivalent = (plan: Plan, interval: BillingInterval) =>
  interval === "year" ? Math.round((plan.priceYearly / 12) * 100) / 100 : plan.priceMonthly;

/** Whole months a year of the plan saves against paying monthly (2 at the standard discount). */
export const monthsFreeYearly = (plan: Plan) =>
  plan.priceMonthly ? Math.round(12 - plan.priceYearly / plan.priceMonthly) : 0;

/** The plan that applies: a lapsed paid plan counts as Free until Stripe reports it active again. */
export function effectivePlan(plan: string, status?: string | null): Plan | null {
  if (!isPlanId(plan)) return null;
  if (plan !== "free" && status && !["active", "trialing", "past_due"].includes(status))
    return PLANS.free;
  return PLANS[plan];
}

/** Limits for a workspace: cloud plan → that plan, anything else (self-hosted) → unlimited. */
export function limitsFor(plan: string, status?: string | null): Limits {
  return effectivePlan(plan, status)?.limits ?? UNLIMITED;
}

export type CountableLimit = "eventTypes" | "members" | "integrations" | "domains";
export type RateLimitKey = "bookingsPerMonth" | "apiRequestsPerMinute";
export type FeatureLimit =
  "booklyVideo" | "payments" | "workflows" | "teamScheduling" | "api" | "removeBranding";

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
  booklyVideo: "Bookly video",
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
