# Bookly

**Bookly** (from the Arabic بُكْلة, "buckle", the clip that holds things in place) is an open-source scheduling platform: booking pages, calendar sync, video links, payments, reminders and team scheduling.

Bookly is one Next.js application on Postgres that you can run yourself with Docker, or use as a hosted service. Every feature is in the open-source core; the hosted version only adds plans and billing.

## Features

- Booking pages per host with weekly hours, date overrides, buffers, notice and horizon rules, timezone-aware for visitors
- Google Calendar and Outlook sync for conflicts and events; meeting links on Google Meet, Zoom, Microsoft Teams or built-in video (Daily.co)
- Paid bookings via Stripe Checkout with refunds on cancel
- Email, SMS and WhatsApp reminders, follow-up emails, no-show tracking, host pings on Slack / text when someone books or joins
- Teams: invitations and roles, round-robin and collective event types
- Public REST API with scoped keys, signed webhooks, embeddable widget, custom domains with automatic HTTPS

## Self-host in five minutes

Requirements: Docker with Compose. A domain is optional to start.

```bash
git clone https://github.com/AhmadHakroosh/bookly.git && cd bookly
cp .env.example .env
# set AUTH_SECRET (openssl rand -base64 32) and APP_URL
docker compose --profile app up -d
```

Open `APP_URL` (default http://localhost:3002): the setup wizard creates your account and workspace. Full guide with HTTPS, email, storage, backups and updates: [docs/self-hosting.md](docs/self-hosting.md).

Prefer a PaaS? The app also runs on Vercel with a managed Postgres (Neon) and S3-compatible storage (Cloudflare R2); see the same guide.

## Documentation

- [Availability, event types, bookings](docs/scheduling.md)
- [Calendars and conferencing](docs/integrations.md)
- [Paid bookings](docs/payments.md)
- [Reminders and host notifications](docs/notifications.md)
- [Teams, round-robin, workflows](docs/teams.md)
- [Embedding the booking widget](docs/embeds.md)
- [Custom domains and HTTPS](docs/domains.md)
- [API and webhooks](docs/api.md)
- [Cloud (multi-tenant) mode](docs/cloud.md)

## Development

Requirements: Node 24, pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env.local        # edit AUTH_SECRET at least
pnpm docker:db                    # Postgres (5433) + MinIO for local dev
pnpm db:migrate
pnpm dev                          # http://localhost:3002
```

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` mirror CI. `pnpm demo` seeds a demo workspace you can sign in to (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Layout

```
apps/web          Next.js 16 app: public pages, /admin, /setup, auth, API
packages/config   env schema (zod); per-tenant settings live in the database
packages/db       Drizzle schema + migrations (Postgres)
packages/email    email drivers: console | resend | smtp
packages/storage  storage drivers: local | s3 (S3, R2, MinIO…)
packages/jobs     background jobs on Postgres (pg-boss)
packages/cloud    hosted-service plans and limits (proprietary, see below)
```

## License

Bookly is licensed under the [GNU AGPL v3](LICENSE). You can run it, modify it and redistribute it; if you offer a modified version as a network service you must publish your changes under the same license.

`packages/cloud` contains the plans and billing for the hosted service and is [not open source](packages/cloud/LICENSE). Self-hosting with the default `TENANCY=single` never uses it.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
