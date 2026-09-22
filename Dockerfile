# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/storage/package.json packages/storage/
COPY packages/jobs/package.json packages/jobs/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
ENV SKIP_ENV_VALIDATION=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @bookly/web build && pnpm --filter @bookly/db build:migrator

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S bookly && adduser -S bookly -G bookly
COPY --from=build --chown=bookly:bookly /app/apps/web/.next/standalone ./
COPY --from=build --chown=bookly:bookly /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=bookly:bookly /app/apps/web/public ./apps/web/public
COPY --from=build --chown=bookly:bookly /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=build --chown=bookly:bookly /app/packages/db/dist/migrate.cjs ./packages/db/migrate.cjs
# In-app documentation at /docs.
COPY --from=build --chown=bookly:bookly /app/docs ./docs
COPY --from=build --chown=bookly:bookly /app/CHANGELOG.md ./CHANGELOG.md
USER bookly
EXPOSE 3000
# Apply pending migrations, then serve.
CMD ["sh", "-c", "node packages/db/migrate.cjs && node apps/web/server.js"]
