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
pnpm docker:db                    # Postgres
pnpm db:migrate
pnpm demo                         # optional: demo data; sign in as demo@example.com / demo-password-1234
pnpm dev                          # http://localhost:3002
```

Before pushing: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Project conventions

- Next.js 16 with Cache Components: public data goes through `"use cache"` functions tagged per tenant; server actions call `updateTag`, route handlers `revalidateTag(tag, "max")`. Every page is an `XPage` + `XPageBoundary` (Suspense) pair.
- Database changes: edit `packages/db/src/schema`, run `pnpm db:generate`, commit the migration. Migrations are additive within a minor version.
- Vendor SDKs stay behind the package interfaces (`packages/email`, `packages/jobs`, provider drivers). Pages and actions never call a vendor API directly.
- Env: add new variables to `packages/config` and `.env.example` with a comment.
- Tenancy: every query is scoped by the tenant id; never trust the host header outside `proxy.ts`.
- UI: follow [DESIGN.md](DESIGN.md) (one button scale, pointers, loading states, section navigation). Every server action that writes workspace data calls `audit()` once after the write; `audit-coverage.test.ts` enforces it. Features that are not finished ship behind a flag (`hasFlag`).

## Pull requests

1. Fork and branch from `main`.
2. Make the change with tests and docs.
3. Fill in the PR template. CI must be green.
4. A code owner reviews; expect questions rather than silence. `main` only takes pull requests: direct and force pushes are blocked for everyone, including maintainers.

By contributing you agree that your contributions are licensed under the AGPL-3.0, like the rest of the project. Contributions to `packages/cloud` and `ee/` (the commercial modules, Elastic License 2.0) are not accepted from outside the core team.

## Releasing

Releases are cut from `main` by tag; the release workflow builds the image, pushes it to
`ghcr.io/ahmadhakroosh/bookly` (tags `X.Y.Z`, `X.Y`, `latest`) and creates the GitHub release with
the notes for that version from `CHANGELOG.md`. Do these in order, in one commit, before tagging:

1. Bump `version` in `package.json` and `apps/web/package.json` (the app reports it to the update
   check and the console).
2. In `CHANGELOG.md`, turn the `[Unreleased]` section into `## [X.Y.Z] - YYYY-MM-DD`, start a fresh
   empty `[Unreleased]` above it, and update the compare links at the bottom. The changelog page on
   the marketing site renders this file at build time, so it goes live with the deploy.
3. Commit, then `git tag -a vX.Y.Z -m "Bookly vX.Y.Z" && git push origin main vX.Y.Z`.

## Local staging

`pnpm dev` is for building. To see the trunk as staging runs it, run the production Docker image
next to it:

```bash
scripts/local-staging.sh up        # first run builds the image from the pushed v2 and seeds demo data
scripts/local-staging.sh update    # rebuild from the latest v2 and restart (migrations run on start)
```

It is multi-tenant like staging.bookly-app.io: the platform at http://localhost:3100, workspaces
at `<slug>.localhost:3100` (the demo at http://demo.localhost:3100/admin, demo@example.com /
demo-password-1234, also a platform admin for `/console`), and every email in Mailpit at
http://localhost:8026. It has its own Postgres (`localhost:5434`), the image's job worker and
websocket server, and every feature flag on. Stripe, Daily, Anthropic and the OAuth apps stay off
until you add their keys to `deploy/local-staging/.env` (git-ignored, created on first run with
fresh secrets). `REF=worktree scripts/local-staging.sh update` builds this checkout as it is
instead; `status`, `logs` and `down` (`down --wipe` drops the data) do what they say.

## Local HTTPS on the staging domain

For maintainers with staging's variables (`.env.cloud.staging`): this machine can answer
https://staging.bookly-app.io and every `https://<slug>.staging.bookly-app.io` itself, so `next
dev` runs with staging's URLs, cookies, passkeys and OAuth apps over real HTTPS. The real staging
is shadowed on this machine only while `dns on`. Everything goes through `pnpm local:https`
(`scripts/local-https.mjs`); the reasoning is in the v2 decision "Local HTTPS on the staging
domain".

Once (no sudo): `brew install dnsmasq` (and `brew install stripe/stripe-cli/stripe` for billing
work), `pnpm local:https setup` (a mkcert certificate in `deploy/local-https/certs/`, git-ignored,
and a user LaunchAgent running dnsmasq on 127.0.0.1:5354), `pnpm dlx neonctl@2 auth`. Once, with
your password:

```bash
mkcert -install                                   # trust mkcert's CA (Keychain, Firefox)
sudo mkdir -p /etc/resolver
printf 'nameserver 127.0.0.1\nport 5354\n' | sudo tee /etc/resolver/staging.bookly-app.io
sudo killall -HUP mDNSResponder
```

Then:

```bash
pnpm local:https db branch      # a Neon branch of staging (local-<you>) → .env.cloud.staging.local
pnpm local:https db migrate     # this checkout's migrations, on the branch only
pnpm local:https proxy up       # Caddy on 127.0.0.1:443 + Mailpit (http://localhost:8025)
pnpm local:https dns on         # staging.bookly-app.io → this machine (`dns off` gives it back)
pnpm local:https dev            # next dev on :3002 behind the proxy, realtime on :3003
```

What differs from staging, by design (`pnpm local:https env` lists every variable's source, names
only):

- **Never staging's database.** `dev` refuses without a branch, and `pnpm db:migrate` refuses any
  database named in `.env.cloud.staging`, `.env.cloud.preview` or `.env.cloud` unless it runs on
  Vercel or CI (override: `BOOKLY_MIGRATE_SHARED=1`). `db reset` brings the branch back to
  staging's current data.
- **Jobs run in-process** (pg-boss on the branch): QStash is off, since it would call the real
  staging back. Upstash is off too (rate limits per process).
- **Nothing reaches real people** unless you pass `--live`: email goes to Mailpit, SMS (Twilio),
  web push and Recall bots are off. The branch holds copies of staging's people and bookings, so
  the local worker would otherwise send them reminders.
- **Stripe** is off unless `.env.cloud.staging.local` carries a Stripe sandbox of its own (all
  `STRIPE_*`); `--live` uses staging's test account, whose webhook then also receives your events.
  `pnpm local:https webhooks` forwards Stripe events here; `dev` takes the signing secret from the
  Stripe CLI.
- OAuth sign-in and calendar connections, Anthropic, Daily and S3 use staging's own settings
  unchanged (same host, same redirect URIs). Deleting a file locally deletes it from staging's
  bucket.

`bookly-web`, `bookly-web-cloud` and this all use port 3002, so run one at a time; local staging
(`:3100`) runs beside any of them. In Claude Code the launch configuration is
`bookly-web-staging-https`.

## End-to-end tests

Two Playwright suites run in CI against a production build:

- `pnpm --filter @bookly/web e2e` — single-tenant: booking, admin, capture, accessibility, headers.
- `pnpm --filter @bookly/web e2e:cloud` — cloud mode: the marketing site, sign-up with consent, a
  tenant booking on `demo.bookly.test`, the workspace chooser and the operator console. Build first
  with `APP_URL=http://platform.bookly.test:3011 ROOT_DOMAIN=bookly.test:3011 TENANCY=multi`; the
  `*.bookly.test` hosts are mapped to 127.0.0.1 inside Chromium, so nothing to add to `/etc/hosts`.

### Details

`pnpm e2e` builds the app (non-standalone), starts it on port 3010 against `DATABASE_URL`, migrates and seeds the demo workspace, and runs the Playwright suite in `apps/web/tests/e2e` (booking, admin, accessibility, security headers). Run `pnpm --filter @bookly/web exec playwright install chromium` once.
