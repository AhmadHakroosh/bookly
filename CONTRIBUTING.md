# Contributing to Bookly

Thanks for helping. This guide keeps contributions smooth for you and for maintainers.

## Ground rules

- Open an issue before a large change so we can agree on the approach.
- Keep pull requests focused. Small, reviewable changes land faster.
- Match the existing style: Prettier and ESLint run in CI (`pnpm format`, `pnpm lint`).
- Add or update tests for behaviour you change (`pnpm test`, Vitest).
- Update `docs/` when you change something a self-hoster would notice.

## Setup

```bash
pnpm install
cp .env.example .env.local        # set AUTH_SECRET
pnpm docker:db                    # Postgres + MinIO
pnpm db:migrate
pnpm demo                         # optional: demo data; sign in as demo@example.com / demo-password-1234
pnpm dev                          # http://localhost:3002
```

Before pushing: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Project conventions

- Next.js 16 with Cache Components: public data goes through `"use cache"` functions tagged per tenant; server actions call `updateTag`, route handlers `revalidateTag(tag, "max")`. Every page is an `XPage` + `XPageBoundary` (Suspense) pair.
- Database changes: edit `packages/db/src/schema`, run `pnpm db:generate`, commit the migration. Migrations are additive within a minor version.
- Vendor SDKs stay behind the package interfaces (`packages/email`, `packages/storage`, provider drivers). Pages and actions never call a vendor API directly.
- Env: add new variables to `packages/config` and `.env.example` with a comment.
- Tenancy: every query is scoped by the tenant id; never trust the host header outside `proxy.ts`.

## Pull requests

1. Fork and branch from `main`.
2. Make the change with tests and docs.
3. Fill in the PR template. CI must be green.
4. A maintainer reviews; expect questions rather than silence.

By contributing you agree that your contributions are licensed under the AGPL-3.0, like the rest of the project. Contributions to `packages/cloud` are not accepted from outside the core team.

## End-to-end tests

`pnpm e2e` builds the app (non-standalone), starts it on port 3010 against `DATABASE_URL`, migrates and seeds the demo workspace, and runs the Playwright suite in `apps/web/tests/e2e` (booking, admin, accessibility, security headers). Run `pnpm --filter @bookly/web exec playwright install chromium` once.
