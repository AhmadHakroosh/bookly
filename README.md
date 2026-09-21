# Bookly

**Scheduling is the entry point. The product is what happens before, during and after the meeting.**

Bookly is an open-source scheduling platform for consultants, freelancers and small teams who live off their meetings. It takes bookings like Calendly or Cal.com, and then it does the part they leave to you: it remembers every person, briefs you before the call, transcribes and recaps the call, turns the recap into tasks and follow-ups with one click, and nudges you when someone goes quiet. Self-host it with Docker or use the hosted version; every feature is in the open-source core.

The name comes from the Arabic بُكْلة, "buckle", the clip that holds things in place.

## Why Bookly

- **A booking page is table stakes.** Bookly has all of it: availability rules, buffers, group sessions, recurring series, round-robin teams, payments, reminders, waitlists, routing forms, calendar sync, video links, API and webhooks.
- **Your calendar is governed by intent, not just busy/free.** Focus blocks and weekly meeting budgets that only existing customers can book into. New leads see your open hours; the people who pay you still get in.
- **Every meeting has a relationship behind it.** One contact per person with a stage, notes and a timeline of every booking, email, form answer and note. Nothing gets lost between calls.
- **You walk in prepared.** Before each meeting, a briefing: who they are, what happened last time, what they asked for, what to prepare.
- **The call takes care of its own notes.** With built-in video, the call is transcribed (with consent) and recapped: summary, decisions, action items for both sides with the quote they came from, open questions, objections, next step. Each item is one click to accept.
- **Outcomes actually happen.** Tasks with reminders, proposal and payment-request emails from templates, a client-facing recap, CRM sync to HubSpot or Pipedrive, and an inbox that shows who is waiting on you today.

## What it looks like day to day

1. Someone books through your page, a routing form, or the API. Bookly recognises them if they have been in touch before.
2. An hour before, you get the briefing with the reminder.
3. You take the call on built-in video, Meet, Zoom or Teams.
4. Afterwards the recap is waiting in your inbox: create the tasks, move the stage, send the follow-up and the client's recap, all in a minute.
5. If they do not answer the proposal, the inbox tells you when to follow up.

## Features

- Booking pages per host with weekly hours, date overrides, buffers, notice and horizon rules, timezone-aware for visitors; group sessions with seats; recurring series; waitlists; routing forms
- Google Calendar and Outlook sync for conflicts and events, with push notifications for instant updates; meeting links on Google Meet, Zoom, Microsoft Teams or built-in video (Daily.co)
- Contacts with stages, tags, notes and a full timeline; pre-meeting briefings; post-meeting capture; auto-capture with transcription and AI recaps on built-in video; tasks with overdue nudges; the Meeting Inbox
- Priority-aware availability: focus blocks and weekly budgets reserved for existing customers
- Paid bookings and paid series via Stripe Checkout with refunds on cancel; proposal and payment-request emails; HubSpot and Pipedrive sync
- Email, SMS and WhatsApp reminders, follow-up emails, no-show tracking, host pings on Slack / text when someone books or joins
- Teams: invitations and roles, round-robin and collective event types
- Public REST API with scoped keys, signed webhooks, embeddable widget, custom domains with automatic HTTPS, in-app documentation
- Cloud (multi-tenant) mode with plans, billing and an operator console for running it as a service

The AI parts (briefings, recaps, capture) use Anthropic's Claude through an optional API key; without it, Bookly degrades to plain summaries and manual notes rather than losing features.

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
- [Routing forms](docs/routing.md)
- [Contacts and timeline](docs/contacts.md)
- [Embedding the booking widget](docs/embeds.md)
- [Custom domains and HTTPS](docs/domains.md)
- [API and webhooks](docs/api.md)
- [Cloud (multi-tenant) mode](docs/cloud.md)

Every install also serves these pages at `/docs`.

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
