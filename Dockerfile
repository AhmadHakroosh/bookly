# syntax=docker/dockerfile:1.7

# ---------- base: Node 24 LTS, pnpm via corepack (version pinned by package.json) ----------
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH npm_config_store_dir=/pnpm/store \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

# ---------- deps: the workspace's node_modules ----------
# Two layers on purpose. `pnpm fetch` needs only the lockfile, so the download survives every
# change except a dependency bump (a version bump in package.json only re-links). The store
# lives in a cache mount, which keeps local rebuilds offline; CI relies on layer caching.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch
COPY apps/web/package.json apps/web/
COPY packages/cloud/package.json packages/cloud/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/jobs/package.json packages/jobs/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

# ---------- build: on top of deps, so node_modules exists in one layer, not a copy ----------
FROM deps AS build
COPY . .
ENV SKIP_ENV_VALIDATION=1
RUN pnpm --filter @bookly/web build && pnpm --filter @bookly/db build:migrator

# ---------- runner: the standalone server, migrations and docs; no toolchain ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
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
