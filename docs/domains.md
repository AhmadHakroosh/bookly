# Domains & HTTPS

## Single-workspace (self-host)

1. Point your domain at the server: an `A` record (or `CNAME`) for `book.example.com`.
2. Set `APP_URL=https://book.example.com` in `.env`.
3. Start with TLS: `ACME_EMAIL=you@example.com docker compose --profile app --profile tls up -d`.
   Caddy asks the app (`/api/domains/check`) whether a hostname is served and issues a Let's Encrypt certificate on first request.
4. Optionally add the hostname under **Admin → Domains** so it is listed and verified.

Behind an existing reverse proxy (nginx, Traefik, a PaaS): terminate TLS there and forward to port 3000 with the `Host` header intact.

## Multi-tenant (cloud mode)

- `TENANCY=multi` and `ROOT_DOMAIN=bookly-app.io`: every workspace is served at `<slug>.bookly-app.io`.
- A workspace owner adds `book.example.com` under **Admin → Domains**, publishes the `TXT` record shown at `_bookly.book.example.com`, and points the host at `ROOT_DOMAIN` (CNAME) or its IP (A). **Verify** checks both with DNS.
- Only verified domains resolve to a workspace and only verified domains get certificates (Caddy on-demand TLS uses the same check).
- **Make primary** on a verified domain makes it the workspace's public address: booking pages, manage links, waitlist and unsubscribe links in emails and the API use it, and guest pages requested on `<slug>.bookly-app.io` or any other verified host redirect (308) to it. The admin stays on `<slug>.bookly-app.io`, where the session cookie lives.
- Wildcard DNS (`*.bookly-app.io`) plus a wildcard certificate for the root domain is recommended; Caddy can do this with a DNS challenge plugin, or use your platform's wildcard support.

## Platform notes

- **Vercel**: add each custom domain to the project (Domains API for automation); Vercel terminates TLS. The verification flow above still gates which hosts resolve to a workspace.
- **Cloudflare**: proxied records work; use "Full (strict)" SSL mode.

## Vercel cron

`apps/web/vercel.json` calls `/api/cron/tick` once a day (the Hobby plan limit) as a safety net: it sends any reminders that are due, retries failed webhook deliveries and renews calendar watches. It needs `CRON_SECRET` on the project; Vercel sends it as the bearer token. On the cloud the real scheduler is QStash (`docs/cloud.md`), so the daily tick only catches what QStash missed. Without QStash, run the GitHub Actions workflow `reminders.yml` (every 10 minutes) or raise the schedule on a Pro plan so reminders go out on time.
