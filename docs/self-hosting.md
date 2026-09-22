# Self-hosting Bookly

Bookly is one container plus Postgres. Optional: a mail provider. There are no file uploads: profile photos and logos are URLs you host anywhere.

## 1. Docker Compose (recommended)

```bash
git clone https://github.com/AhmadHakroosh/bookly.git && cd bookly
cp .env.example .env
```

Edit `.env`:

| Variable                                     | Set to                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `APP_URL`                                    | The public URL, e.g. `https://bookly.example.com`                                                  |
| `AUTH_SECRET`                                | `openssl rand -base64 32`                                                                          |
| `EMAIL_DRIVER`, `EMAIL_FROM` + provider keys | `resend` or `smtp`; without email, sign-in links and notifications only print to the container log |

Then:

```bash
docker compose --profile app up -d          # app + Postgres
docker compose --profile app --profile tls up -d   # …plus Caddy with automatic HTTPS
```

With the `tls` profile, point your domain's A/AAAA record at the server and set `ACME_EMAIL` in `.env`. Caddy obtains certificates for `APP_URL` and for every custom domain you verify in the admin (on-demand TLS asks the app at `/api/domains/check`).

Open `APP_URL`: the first visit shows the setup wizard, which creates your account and your workspace. Sign-up is closed afterwards; add people through invitations.

To use a prebuilt image instead of building locally, replace `build: .` in `docker-compose.yml` with `image: ghcr.io/ahmadhakroosh/bookly:latest` (or a version tag).

## 2. Vercel + managed services

The same code runs on Vercel:

- Root Directory `apps/web`, Node 24.
- Postgres: any provider (Neon works well). `DATABASE_URL` = pooled connection string.
- Set `JOBS_WORKER=false` and configure QStash (`QSTASH_TOKEN` and the two signing keys) so reminders, retries, transcripts and schedules run through it; see [docs/cloud.md](cloud.md#background-jobs-on-qstash). Without QStash, `CRON_SECRET` plus `apps/web/vercel.json` (daily on Hobby) or the GitHub Actions tick is the fallback.
- Run migrations from your machine: `DATABASE_URL='…' pnpm db:migrate`.

## 3. Updating

```bash
git pull
docker compose --profile app build app
docker compose --profile app up -d
```

The container applies pending migrations on start (a bundled `migrate.cjs` runs before the server), and migrations are always additive within a minor version. Read `CHANGELOG.md` before major versions.

## 4. Backups

Everything lives in two places: the Postgres database and the uploads (the `local` volume or your bucket).

```bash
docker compose exec postgres pg_dump -U bookly bookly | gzip > bookly-$(date +%F).sql.gz
```

Restore with `gunzip -c file.sql.gz | docker compose exec -T postgres psql -U bookly bookly`.

## 5. Operations

- **Logs:** `docker compose logs -f app`. Email in `console` mode prints here.
- **Background jobs:** the container runs a pg-boss worker (reminders, retries) using the same database; nothing else to deploy. Set `JOBS_WORKER=false` only on serverless.
- **Scaling:** the app is stateless; run several replicas behind a load balancer with one Postgres.
- **Health:** `GET /api/domains/check?host=<APP_URL host>` returns 200 when the app and database are up.

## 6. Environment reference

See `.env.example`; every variable is documented inline and validated at startup by `packages/config`.

## Export and deletion

Admin → Settings → Your data lets the workspace owner download everything as one JSON file
(workspace, members, event types, availability, bookings, contacts and timeline, tasks, routing
forms, transcripts, recaps; tokens and keys excluded) and delete the workspace permanently.
Deletion removes the owning organization, which cascades through every table; on a
single-tenant install the app returns to the setup wizard. Users delete their own account from
Admin → Booking page once they own no workspace. Neither action touches your backups, so keep
their retention in mind when someone asks for erasure.

## Accounts and passwords

Sign-in works with a password or an emailed link. A forgotten password is reset from "Forgot your password?" on the sign-in page: Bookly emails a link (valid for one hour) to `/reset-password`, so email must be configured (`RESEND_API_KEY` or SMTP; in development links print to the console). Signed-in users change their password under `Admin → Booking page`; changing it signs out every other session.

## Rate limiting across replicas

One container needs nothing: limits are counted in memory. If you run several replicas behind
a load balancer, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` so booking-form,
API and sign-in limits are shared; otherwise each replica allows the full quota on its own.

## Update check and telemetry

Once a day (on the job tick) the install POSTs to `TELEMETRY_URL` and gets back the latest
released version. When it is newer than what you run, the admin shows a notice with a link to the
release notes.

What is sent, always: the app version, `TENANCY`, the Node version and a random install id
generated once and stored in `platform_state`. It is not derived from your hostname, IP, users or
anything else about you.

What is sent only if you opt in under **Admin → Settings → Help improve Bookly**: counts of
workspaces, hosts, event types, bookings in the last 30 days and contacts, plus which integration
providers are connected and whether video capture and payments are configured. Never names,
emails, transcripts or content.

Set `TELEMETRY=off` to disable the check entirely; the admin then never learns about new
releases. `GET /api/telemetry` on the platform returns the latest version if you want to check by
hand.

## Monitoring and error tracking

- **Errors**: set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser) and Bookly reports exceptions from pages, API routes, the cron tick and the browser to Sentry. Add `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` at build time to upload source maps. Leave them unset and nothing is sent anywhere.
- **Metrics**: set `METRICS_TOKEN` and scrape `GET /api/metrics` (see `docs/cloud.md`).
- **Security headers**: every response carries a Content-Security-Policy limited to Bookly's own origin plus Daily, Stripe and Sentry, `X-Content-Type-Options`, `Referrer-Policy`, a `Permissions-Policy` that grants camera and microphone only to the call page, and HSTS in production. Booking pages may be embedded on HTTPS sites; the admin and console send `X-Frame-Options: DENY`. If you serve avatars or uploads from another host, add it to `img-src` in `apps/web/next.config.ts`.
