import { z } from "zod";

/**
 * Infrastructure configuration (env). Per-workspace settings live in the database.
 * Validated once at startup; import `env` anywhere on the server.
 */
const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TENANCY: z.enum(["single", "multi"]).default("single"),
  APP_URL: z.url().default("http://localhost:3002"),
  ROOT_DOMAIN: z.string().min(1).optional(),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),

  EMAIL_DRIVER: z.enum(["console", "resend", "smtp"]).default("console"),
  EMAIL_FROM: z.string().min(3).default("Bookly <noreply@localhost>"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool,

  // ---- Integrations (all optional; a provider is "available" when its keys are set) ----
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  /** Entra tenant: "common" (any account), "consumers", "organizations" or a tenant id. */
  MICROSOFT_TENANT: z.string().default("common"),
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  /** Daily.co (Bookly video). DAILY_DOMAIN is your Daily subdomain, e.g. "acme.daily.co". */
  DAILY_API_KEY: z.string().optional(),
  DAILY_DOMAIN: z.string().optional(),
  /** Public URL of the built-in meeting pages, e.g. https://meet.example.com. Defaults to APP_URL + /meet. */
  MEET_URL: z.url().optional(),
  /**
   * Notetaker for auto-capture on Google Meet, Teams and Zoom (Recall.ai). The bot joins the
   * call, streams the transcript live and delivers the full transcript when the call ends.
   */
  RECALL_API_KEY: z.string().optional(),
  /** Recall data region; the API key belongs to exactly one. */
  RECALL_REGION: z
    .enum(["us-west-2", "us-east-1", "eu-central-1", "ap-northeast-1"])
    .default("us-west-2"),
  /** Signing secret of the status-change webhook endpoint (Recall dashboard → Webhooks). */
  RECALL_WEBHOOK_SECRET: z.string().optional(),
  /** What participants see the bot called. */
  RECALL_BOT_NAME: z.string().max(100).default("Bookly Notetaker"),

  // ---- Observability ----
  /** Sentry DSNs (server and browser). Unset = error tracking off. */
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  /** Bearer token for GET /api/metrics (Prometheus text format). Unset = endpoint disabled. */
  METRICS_TOKEN: z.string().optional(),

  // ---- Assistant (briefings, meeting capture) ----
  /** Anthropic API key; without it briefs are plain summaries and capture is manual. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ASSISTANT_MODEL: z.string().default("claude-sonnet-5"),

  // ---- Payments (Stripe) ----
  STRIPE_SECRET_KEY: z.string().optional(),
  /** "on" adds Stripe Tax (automatic tax, VAT-id collection) to plan checkouts; needs Stripe Tax enabled on the account. */
  STRIPE_TAX: z.enum(["on", "off"]).default("off"),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Cloud mode: signing secret of the Connect webhook endpoint (events from hosts' accounts). */
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  // ---- Cloud mode (TENANCY=multi) ----
  /** Stripe recurring price ids for the Pro and Team plans. */
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  /** Optional yearly prices; without them the plans are monthly only. */
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  STRIPE_PRICE_TEAM_YEARLY: z.string().optional(),
  /** Comma-separated emails allowed into the operator console at /console on the platform host. */
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  /** Shown on the marketing site's contact, legal and footer (cloud mode). */
  SUPPORT_EMAIL: z.string().optional(),
  /** Operator's postal address, one line, printed on the legal pages and in platform emails. */
  OPERATOR_ADDRESS: z.string().max(300).optional(),
  /**
   * Daily update check: the install asks TELEMETRY_URL for the latest version and sends its own
   * version, tenancy and an anonymous install id. "off" disables it entirely. Usage statistics
   * are a separate opt-in in workspace settings.
   */
  TELEMETRY: z.enum(["on", "off"]).default("on"),
  /**
   * Shared rate limiting (public forms, API, sign-in) across instances via Upstash Redis REST.
   * Unset = per-process memory, which is right for a single self-hosted container.
   */
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  /**
   * Background jobs on serverless: QStash publishes to /api/jobs/<name> with delays, retries
   * and cron schedules. Unset = in-process pg-boss worker (self-host) or inline (JOBS_WORKER=false).
   */
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_URL: z.url().default("https://qstash.upstash.io"),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  TELEMETRY_URL: z.url().default("https://bookly-app.io/api/telemetry"),

  // ---- Text messages (Twilio) for SMS / WhatsApp reminders and host pings ----
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** E.164 sender for SMS, e.g. +15551234567 */
  TWILIO_FROM_SMS: z.string().optional(),
  /** WhatsApp sender, e.g. +14155238886 (sandbox) or your approved number */
  TWILIO_FROM_WHATSAPP: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  if (source.SKIP_ENV_VALIDATION) {
    cached = envSchema.partial().parse(source) as Env;
    return cached;
  }
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_t, key: string) {
    return loadEnv()[key as keyof Env];
  },
});

export const isSingleTenant = () => loadEnv().TENANCY === "single";
