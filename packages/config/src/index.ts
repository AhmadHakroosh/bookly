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
  /** GitHub OAuth app (sign-in only). Callback: <APP_URL>/api/auth/callback/github */
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  /** Zoom app "Secret Token" (Features → Access): verifies deauthorization notifications. */
  ZOOM_WEBHOOK_SECRET: z.string().optional(),
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
  /** Recall workspace secret (dashboard → Developers → API Keys & Secrets → Create Workspace Secret), `whsec_…`; signs every request Recall sends. Older accounts: the endpoint's Svix secret. */
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
  /** Pre-meeting briefings are short and frequent: a small model keeps them cheap. */
  ASSISTANT_BRIEF_MODEL: z.string().default("claude-haiku-4-5-20251001"),

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
  /**
   * Metered price for transcription minutes beyond the plan's included minutes (attached to a
   * Stripe Billing meter whose event name is STRIPE_METER_CAPTURE_EVENT). Unset = transcription
   * stops at the budget.
   */
  STRIPE_PRICE_CAPTURE_OVERAGE: z.string().optional(),
  STRIPE_METER_CAPTURE_EVENT: z.string().default("capture_minutes"),
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

  // ---- Text messages (SMS / WhatsApp reminders and host pings): Meta, Sent.dm or Twilio ----
  /**
   * Forces one provider for every channel; unset = per channel, WhatsApp via Meta when its keys
   * are present, then Sent.dm, then Twilio (Meta cannot send SMS).
   */
  TEXT_PROVIDER: z.enum(["meta", "sentdm", "twilio"]).optional(),
  /** WhatsApp Cloud API (Meta): a permanent system-user token with whatsapp_business_messaging. */
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  /** The registered sender's phone number ID from WhatsApp Manager (not the number itself). */
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  /** Language code of the approved templates (docs/notifications.md lists them). */
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("en"),
  /** Meta app secret; verifies the X-Hub-Signature-256 header on /api/webhooks/whatsapp. */
  WHATSAPP_APP_SECRET: z.string().optional(),
  /** Any string; typed into the webhook configuration so Meta can verify the endpoint. */
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  /** Sent.dm API key (https://sent.dm): one key, both channels, registration handled there. */
  SENTDM_API_KEY: z.string().optional(),
  /** Dry-run every Sent.dm request (their `sandbox: true`): validated, nothing delivered. */
  SENTDM_SANDBOX: z.stringbool().default(false),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** E.164 sender for SMS, e.g. +15551234567 */
  TWILIO_FROM_SMS: z.string().optional(),
  /** WhatsApp sender, e.g. +14155238886 (sandbox) or your approved number */
  TWILIO_FROM_WHATSAPP: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Platform-provided defaults: a Vercel preview deployment has no fixed address, so when APP_URL
 * is not set the deployment's own URL is used. That is what lets a pull request's preview sign
 * people in and build links on a host nobody knew in advance.
 */
export function withPlatformDefaults(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!source.APP_URL && source.VERCEL_URL)
    return { ...source, APP_URL: `https://${source.VERCEL_URL}` };
  return source;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  source = withPlatformDefaults(source);
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
