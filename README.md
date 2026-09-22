<p align="center">
  <img src="apps/web/public/logo-mark.png" alt="Bookly" width="96" height="96" />
</p>

<h1 align="center">Bookly</h1>

<p align="center"><strong>The meeting is booked. Bookly handles the rest.</strong></p>

<p align="center">
  <a href="https://github.com/AhmadHakroosh/bookly/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/AhmadHakroosh/bookly/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" /></a>
  <a href="CHANGELOG.md"><img alt="Changelog" src="https://img.shields.io/badge/changelog-unreleased-lightgrey.svg" /></a>
</p>

Bookly is an open-source scheduling platform for consultants, coaches, advisors, agencies and small teams who live off their meetings. It takes bookings like Calendly or Cal.com, then does the part they leave to you: it remembers every person, briefs you before the call, transcribes and recaps the call with consent, turns the recap into tasks and follow-ups with one click, and nudges you when someone goes quiet. Self-host it with Docker or use the hosted version; every feature is in the open-source core.

The name and the mark come from the Arabic بُكْلة, "buckle": the logo is a lowercase b whose stem is the strap and whose bowl is the buckle frame. A buckle fastens two sides together; so does a meeting.

---

**Contents:** [Why Bookly](#why-bookly) · [Features](#features) · [Self-hosting](#self-hosting) · [Cloud mode](#cloud-mode) · [Documentation](#documentation) · [Contributing](#contributing) · [Security](#security) · [License](#license)

## Why Bookly

Most scheduling tools end at the calendar invite. Everything after it, the prep, the notes, the follow-up, the memory of who said what, is still on you. Bookly starts where they stop.

- **A booking page is table stakes, and it is all there.** Availability rules, buffers, group sessions with seats and waitlists, recurring series, round-robin teams, payments, reminders, routing forms, calendar sync, video links, custom domains, API and webhooks.
- **Your calendar is governed by intent, not just busy or free.** Focus blocks and weekly meeting budgets that only existing customers can book into. New leads see your open hours; the people who pay you still get in.
- **Every meeting has a relationship behind it.** One contact per person with a stage, notes and a timeline of every booking, email, form answer and note. Sync it to HubSpot or Pipedrive if that is where your team lives.
- **You walk in prepared.** Before each meeting, a briefing: who they are, what happened last time, what they asked for when booking, what to prepare.
- **The call takes care of its own notes.** On built-in video the call is transcribed with consent and speaker labels, then recapped: summary, decisions, action items for both sides with the quote they came from, open questions, objections, next step. Each item is one click to accept.
- **Outcomes actually happen.** Tasks with reminders, a drafted follow-up, proposal and payment-request emails from templates, a client-facing recap, and an inbox that shows who is waiting on you today.

The AI parts (briefings, recaps, capture) use Anthropic's Claude through an optional API key. Without it, Bookly falls back to plain summaries and manual notes rather than losing features.

## Features

| Area             | What you get                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scheduling       | Booking pages per host, weekly hours, date overrides, buffers, notice and horizon rules, timezone-aware for visitors, group sessions with seats, recurring series, waitlists, routing forms, priority-aware availability with focus blocks |
| Calendars, video | Google Calendar and Outlook sync with push notifications; Google Meet, Zoom, Microsoft Teams or built-in video (Daily.co)                                                                                                                  |
| Meeting life     | Contacts with stages, tags, notes and timeline; pre-meeting briefings; auto-capture with transcription, live notice and retention; AI recaps with evidence; tasks with overdue nudges; the Meeting Inbox                                   |
| Money            | Paid bookings and paid series via Stripe Checkout with refunds on cancel; proposal and payment-request emails                                                                                                                              |
| Messaging        | Email, SMS and WhatsApp reminders, follow-up emails, no-show tracking, host pings on Slack or text when someone books or joins                                                                                                             |
| Teams            | Invitations and roles, round-robin and collective event types                                                                                                                                                                              |
| Platform         | Public REST API with scoped keys, signed webhooks, embeddable widget, custom domains with automatic HTTPS, in-app documentation, blocklists and throttles                                                                                  |
| Cloud            | Multi-tenant mode with plans, billing, a marketing site, legal pages and an operator console                                                                                                                                               |

## Self-hosting

Bookly runs as one Next.js app on top of Postgres. Docker Compose is the supported path; Vercel with managed services is documented too.

### Requirements

- A Linux server (2 vCPU / 2 GB RAM is plenty to start) with Docker and Docker Compose.
- A domain pointed at the server if you want HTTPS and custom booking domains. Optional to try it out.
- Outbound email (Resend or any SMTP) so confirmations and reminders reach people. The `console` driver prints emails to the log for local use.

### Five-minute install

```bash
git clone https://github.com/AhmadHakroosh/bookly.git && cd bookly
cp .env.example .env
# edit .env: AUTH_SECRET (openssl rand -base64 32), APP_URL, EMAIL_* at least
docker compose --profile app up -d                      # app + Postgres + MinIO
docker compose --profile app --profile tls up -d        # …plus Caddy with automatic HTTPS
```

Open `APP_URL` (default http://localhost:3002). The setup wizard creates your account and workspace; migrations run automatically on every start.

### What to configure

| Env var group                                                           | Purpose                                                                               | Required?                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `APP_URL`, `AUTH_SECRET`, `DATABASE_URL`                                | Where the app lives, session signing, Postgres                                        | Yes                              |
| `EMAIL_DRIVER`, `EMAIL_FROM`, `RESEND_*` / `SMTP_*`                     | Transactional email                                                                   | Yes for production               |
| `STORAGE_DRIVER`, `S3_*`                                                | Profile photos and uploads (local disk or S3, R2, MinIO)                              | Defaults to local disk           |
| `GOOGLE_*`, `MICROSOFT_*`, `ZOOM_*`, `DAILY_*`                          | Calendar sync and video                                                               | Per integration you want         |
| `STRIPE_*`                                                              | Paid bookings                                                                         | Only for payments                |
| `TWILIO_*`                                                              | SMS and WhatsApp                                                                      | Only for text messages           |
| `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`                                  | Briefings, recaps, capture                                                            | Optional; plain fallback if off  |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Job queue and schedules on serverless (precise reminders, retries, dead-letter queue) | Only on serverless               |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                    | Shared rate limits across replicas or serverless instances                            | Only with more than one instance |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `METRICS_TOKEN`                 | Error tracking, Prometheus metrics at `/api/metrics`                                  | Optional                         |
| `TENANCY`, `ROOT_DOMAIN`, `PLATFORM_ADMIN_EMAILS`, `SUPPORT_EMAIL`      | Cloud (multi-tenant) mode                                                             | Single-tenant by default         |

Every variable is described in [.env.example](.env.example) and validated at boot with a clear error.

### Operating it

- **Updating:** `git pull`, then `docker compose --profile app build app && docker compose --profile app up -d`. Migrations apply on start; see [CHANGELOG.md](CHANGELOG.md) for anything that needs attention.
- **Backups:** `docker compose exec postgres pg_dump -U bookly bookly | gzip > bookly-$(date +%F).sql.gz`, plus the uploads volume or bucket.
- **Health and metrics:** `/api/health` for uptime checks; `/api/metrics` (bearer `METRICS_TOKEN`) for Prometheus.
- **Background jobs:** reminders, webhook retries, transcripts, CRM sync and housekeeping run in-process on pg-boss. On serverless hosts set `JOBS_WORKER=false` and configure QStash (`QSTASH_TOKEN` + signing keys) so jobs, precise reminders and schedules run through it; `/api/cron/tick` remains a manual fallback.
- **Update check:** once a day the install asks for the latest version and sends its own version, tenancy mode, Node version and a random install id, nothing more. The admin shows a notice when a newer release exists. Set `TELEMETRY=off` to disable it. Sharing coarse usage counts (workspaces, hosts, bookings, which integrations) is a separate opt-in under Admin → Settings, never on by default.
- **Security headers, rate limits and abuse controls** are on by default. Read [SECURITY.md](SECURITY.md) for what is covered and how to report a problem.

The full guide, including Vercel, HTTPS, custom domains, storage and password recovery: [docs/self-hosting.md](docs/self-hosting.md).

## Cloud mode

Set `TENANCY=multi` and Bookly turns into a hosted service: the platform host serves the marketing site, pricing, sign-up with terms and privacy consent, the legal pages and the operator console, and every workspace gets `<slug>.ROOT_DOMAIN` plus optional custom domains. Plans and limits live in `packages/cloud`. See [docs/cloud.md](docs/cloud.md).

## Documentation

Every install serves these pages at `/docs`; they live in [docs/](docs/).

- [Availability, event types, bookings](docs/scheduling.md)
- [Calendars and conferencing](docs/integrations.md)
- [Contacts, briefings, capture and the inbox](docs/contacts.md)
- [Routing forms](docs/routing.md)
- [Paid bookings](docs/payments.md)
- [Reminders and host notifications](docs/notifications.md)
- [Teams, round-robin, workflows](docs/teams.md)
- [Embedding the booking widget](docs/embeds.md)
- [Custom domains and HTTPS](docs/domains.md)
- [API and webhooks](docs/api.md)
- [Self-hosting](docs/self-hosting.md) · [Cloud mode](docs/cloud.md)

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for the rules of the road.

### Local development

Requirements: Node 24, pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env.local        # set AUTH_SECRET at least
pnpm docker:db                    # Postgres (5433) + MinIO for local dev
pnpm db:migrate
pnpm dev                          # http://localhost:3002
pnpm demo                         # seed a demo workspace you can sign in to
```

### Checks

| Command                         | What it does                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                     | ESLint across the workspace                                                                                       |
| `pnpm typecheck`                | Route typegen + TypeScript                                                                                        |
| `pnpm test`                     | Vitest unit tests (availability engine, recurrence, routing, webhooks, text renderers, and more)                  |
| `pnpm format:check`             | Prettier                                                                                                          |
| `pnpm build`                    | Production build                                                                                                  |
| `pnpm --filter @bookly/web e2e` | Playwright end-to-end suite against a production build (booking, admin, capture, accessibility, security headers) |

CI runs all of these plus a Docker image build on every push and pull request.

### Repository layout

```
apps/web              Next.js 16 app: public pages, /admin, /setup, auth, API, marketing site (cloud)
packages/config       env schema (zod); per-tenant settings live in the database
packages/db           Drizzle schema + migrations (Postgres)
packages/email        email drivers: console | resend | smtp
packages/storage      storage drivers: local | s3 (S3, R2, MinIO…)
packages/jobs         background jobs on Postgres (pg-boss)
packages/cloud        hosted-service plans and limits (proprietary, see License)
docs/                 user documentation, also served in-app at /docs
deploy/               Compose profiles and Caddy config
```

### Conventions in short

- Server logic lives in `apps/web/src/server/*`; pure text and formatting helpers are split into `*-text.ts` files so they can be unit-tested without a database.
- Schema changes: edit `packages/db/src/schema`, run `pnpm db:generate`, commit the migration, and note it in the changelog.
- shadcn/ui on Base UI: compose with `render={<Link />}` rather than `asChild`.
- Keep [CHANGELOG.md](CHANGELOG.md) current under `Unreleased`; releases are tagged on GitHub.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Please do not open public issues for them.

## License

Bookly is licensed under the [GNU AGPL v3](LICENSE). You can run it, modify it and redistribute it; if you offer a modified version as a network service you must publish your changes under the same license.

`packages/cloud` contains the plans and billing for the hosted service and is [not open source](packages/cloud/LICENSE). Self-hosting with the default `TENANCY=single` never uses it.
