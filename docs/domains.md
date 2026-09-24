# Domains & HTTPS

## Single-workspace (self-host)

1. Point your domain at the server: an `A` record (or `CNAME`) for `blog.example.com`.
2. Set `APP_URL=https://blog.example.com` in `.env`.
3. Start with TLS: `ACME_EMAIL=you@example.com docker compose --profile app --profile tls up -d`.
   Caddy asks the app (`/api/domains/check`) whether a hostname is served and issues a Let's Encrypt certificate on first request.
4. Optionally add the hostname under **Admin → Domains** so it is listed and verified.

Behind an existing reverse proxy (nginx, Traefik, a PaaS): terminate TLS there and forward to port 3000 with the `Host` header intact.

## Multi-tenant (cloud mode)

- `TENANCY=multi` and `ROOT_DOMAIN=bookly.app`: every workspace is served at `<slug>.bookly.app`.
- A workspace owner adds `blog.example.com` under **Admin → Domains**, publishes the `TXT` record shown at `_bookly.blog.example.com`, and points the host at `ROOT_DOMAIN` (CNAME) or its IP (A). **Verify** checks both with DNS.
- Only verified domains resolve to a workspace and only verified domains get certificates (Caddy on-demand TLS uses the same check).
- **Make primary** on a verified domain makes it the workspace's public address: booking pages, manage links, waitlist and unsubscribe links in emails and the API use it, and guest pages requested on `<slug>.bookly.app` or any other verified host redirect (308) to it. The admin stays on `<slug>.bookly.app`, where the session cookie lives.
- Wildcard DNS (`*.bookly.app`) plus a wildcard certificate for the root domain is recommended; Caddy can do this with a DNS challenge plugin, or use your platform's wildcard support.

## Platform notes

- **Vercel**: add each custom domain to the project (Domains API for automation); Vercel terminates TLS. The verification flow above still gates which hosts resolve to a workspace.
- **Cloudflare**: proxied records work; use "Full (strict)" SSL mode.

## Vercel cron

`apps/web/vercel.json` runs `/api/cron/publish` once a day (Hobby plan limit). Scheduled posts do not depend on it: a post whose publish time has passed is public at read time and cached pages refresh within the hour. The cron only normalizes the status column. On a Pro plan you can raise the schedule to `*/5 * * * *`.
