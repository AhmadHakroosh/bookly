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

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./data/uploads"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
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
