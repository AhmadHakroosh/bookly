# Self-hosting Bookly

Bookly is one container plus Postgres. Optional: an S3-compatible bucket for uploads and a mail provider.

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
| `STORAGE_DRIVER`                             | `local` (files in a volume) or `s3` with the `S3_*` keys                                           |

Then:

```bash
docker compose --profile app up -d          # app + Postgres + MinIO
docker compose --profile app --profile tls up -d   # …plus Caddy with automatic HTTPS
```

With the `tls` profile, point your domain's A/AAAA record at the server and set `ACME_EMAIL` in `.env`. Caddy obtains certificates for `APP_URL` and for every custom domain you verify in the admin (on-demand TLS asks the app at `/api/domains/check`).

Open `APP_URL`: the first visit shows the setup wizard, which creates your account and your workspace. Sign-up is closed afterwards; add people through invitations.

To use a prebuilt image instead of building locally, replace `build: .` in `docker-compose.yml` with `image: ghcr.io/ahmadhakroosh/bookly:latest` (or a version tag).

## 2. Vercel + managed services

The same code runs on Vercel:

- Root Directory `apps/web`, Node 24.
- Postgres: any provider (Neon works well). `DATABASE_URL` = pooled connection string.
- Storage: Cloudflare R2 or S3 with `STORAGE_DRIVER=s3` and the `S3_*` keys.
- Set `JOBS_WORKER=false` and `CRON_SECRET`; `apps/web/vercel.json` schedules the daily tick. On the Hobby plan crons run daily; see the docs for what needs a more frequent tick.
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
- **Scaling:** the app is stateless; run several replicas behind a load balancer with one Postgres. Uploads must then use `s3`.
- **Health:** `GET /api/domains/check?host=<APP_URL host>` returns 200 when the app and database are up.

## 6. Environment reference

See `.env.example`; every variable is documented inline and validated at startup by `packages/config`.

## Accounts and passwords

Sign-in works with a password or an emailed link. A forgotten password is reset from "Forgot your password?" on the sign-in page: Bookly emails a link (valid for one hour) to `/reset-password`, so email must be configured (`RESEND_API_KEY` or SMTP; in development links print to the console). Signed-in users change their password under `Admin → Booking page`; changing it signs out every other session.
