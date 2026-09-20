# Bookly

**Bookly** is a self-hostable scheduling platform: booking pages, availability rules, Google Calendar and Outlook sync, and meetings on Google Meet, Zoom, Microsoft Teams or built-in video (Daily.co). One Next.js app on Postgres.

- **Self-host:** one Docker image + Postgres. `docker compose up` and you are taking bookings.
- **Cloud:** the same codebase runs multi-tenant with custom domains and subscriptions.

> Status: early development (Phase K0 — foundation). Not ready for use yet.

## Development

Requirements: Node 24, pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env.local        # edit AUTH_SECRET at least
pnpm docker:db                    # Postgres (5433) + MinIO (9002)
pnpm db:migrate
pnpm dev                          # http://localhost:3002 → setup wizard on first run
```

## Layout

```
apps/web          Next.js 16 app: booking pages, /admin, /setup, auth
packages/config   env schema (zod) — infra config; workspace settings live in the DB
packages/db       Drizzle schema + migrations (Postgres via node-postgres)
packages/email    email drivers: console | resend | smtp
packages/storage  storage drivers: local | s3 (S3, R2, MinIO…)
packages/jobs     background jobs on Postgres (pg-boss): reminders, calendar sync
```

## Tenancy

`TENANCY=single` (default) hides multi-tenant concepts: one workspace, one team. `TENANCY=multi` resolves workspaces by `<slug>.<ROOT_DOMAIN>` or verified custom domains.

## License

To be decided before the first public release (planned: AGPL-3.0 for the core).
