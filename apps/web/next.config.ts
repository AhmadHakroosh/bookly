import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { config } from "dotenv";

// Env lives at the monorepo root; Next only auto-loads from the app directory.
config({ path: ["../../.env.local", "../../.env"] });

const dev = process.env.NODE_ENV === "development";

/**
 * Security headers. The CSP is deliberately concrete: only the hosts Bookly talks to. Add a
 * host here if you self-host a provider (e.g. an S3 endpoint that serves avatars).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://*.daily.co`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.daily.co wss://*.daily.co https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io",
  "frame-src https://*.daily.co https://js.stripe.com https://checkout.stripe.com",
  "media-src 'self' blob: https://*.daily.co",
  "worker-src 'self' blob:",
  // Booking pages may be embedded on customers' sites (?embed=1); admin routes set X-Frame-Options.
  "frame-ancestors 'self' https:",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(self "https://*.daily.co"), microphone=(self "https://*.daily.co"), display-capture=(self "https://*.daily.co"), geolocation=(), payment=(self "https://checkout.stripe.com")',
  },
  ...(dev
    ? []
    : [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ]),
];

const nextConfig: NextConfig = {
  // Standalone output feeds the Docker image; Vercel and the e2e build use the regular server.
  output: process.env.VERCEL || process.env.E2E ? undefined : "standalone",
  cacheComponents: true,
  // Local multi-tenant testing: <slug>.lvh.me resolves to 127.0.0.1 and accepts subdomain cookies.
  allowedDevOrigins: ["lvh.me", "*.lvh.me"],
  transpilePackages: [
    "@bookly/cloud",
    "@bookly/config",
    "@bookly/db",
    "@bookly/email",
    "@bookly/storage",
    "@bookly/jobs",
  ],
  serverExternalPackages: ["pg", "pg-boss", "nodemailer", "@aws-sdk/client-s3", "sharp", "shiki"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The admin and platform pages are never meant to be framed.
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/console/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

// Sentry: only wraps the build when a DSN is configured; source maps upload needs SENTRY_AUTH_TOKEN.
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
