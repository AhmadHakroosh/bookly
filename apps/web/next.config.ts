import type { NextConfig } from "next";
import { config } from "dotenv";

// Env lives at the monorepo root; Next only auto-loads from the app directory.
config({ path: ["../../.env.local", "../../.env"] });

const nextConfig: NextConfig = {
  // Standalone output feeds the Docker image; Vercel uses its own build output.
  output: process.env.VERCEL ? undefined : "standalone",
  cacheComponents: true,
  transpilePackages: [
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
};

export default nextConfig;
