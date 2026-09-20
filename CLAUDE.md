@apps/web/AGENTS.md

# Bookly — self-hostable scheduling platform

Third of Ahmad's three products (personal site `ahmadhakroosh.com`, **Warqa** blog platform, **Bookly**). The cross-product roadmap is `PLAN.md` in the `ahmadhakroosh.com` repo (Product 3, phases K0–K6). Keep its checkboxes current.

## Conventions

- Same skeleton as Warqa: pnpm 11 workspaces + Turborepo, Node 24, versions pinned in `pnpm-workspace.yaml` `catalog:`. Dev server on **port 3002**, Postgres on **5433**, MinIO on **9002/9003** so Warqa and Bookly can run side by side.
- Tenancy: the tenant is a **workspace** (`workspaces`, `workspace_domains`); every scheduling table carries `workspace_id`. `src/proxy.ts` resolves the host and sets `x-bookly-workspace`; read it with `getCurrentWorkspace()` from `src/server/workspace.ts`. `TENANCY=single|multi`.
- Auth: Better Auth (`src/lib/auth.ts`) with email+password, magic link, organization (owns workspaces), admin. Staff-only admin via `requireStaff()`. After changing plugins run `pnpm auth:generate`, then `pnpm db:generate` + `pnpm db:migrate`.
- Cache Components are enabled: every page is `XPage` + `XPageBoundary` (Suspense); layouts wrap their shell in Suspense; cached data uses `"use cache"` + `workspaceTag`; server actions call `refreshWorkspace`, route handlers `refreshWorkspaceBackground`.
- Providers behind interfaces: `@bookly/email`, `@bookly/storage`, `@bookly/jobs`. Calendar and conferencing providers (K2) follow the same pattern under `src/server/integrations/`.
- Domains: `_bookly.<host>` TXT verification; `/api/domains/check` gates Caddy on-demand TLS.
- Self-host first: everything must work with `docker compose up` and no third-party accounts (built-in video via Daily.co is optional).

## Public API & webhooks (K4)

- Routes under `src/app/api/v1/*` use `apiContext(req, scope?)` from `src/server/api.ts` (workspace resolution, key auth, rate limits) and return `json()` / `apiError()`. Add every new route to `openapi.json/route.ts` and `docs/api.md`.
- Domain events go through `emitEvent()` in `src/server/webhooks.ts` from the booking flow, never from routes directly.
- `refreshWorkspace()` is safe in actions and route handlers (falls back to background revalidation).
