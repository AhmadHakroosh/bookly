---
name: bookly-builder
description: Bookly's full-stack feature builder. Implements features end to end in the Next.js 16 / Drizzle / Better Auth monorepo following every house convention (Next 16 docs first, XPage + XPageBoundary, "use cache" + workspaceTag, refreshWorkspace, audit() after writes, hasFlag + BetaBadge, schema → db:generate, vendor interfaces, env in packages/config, docs/ + CHANGELOG). Use when asked to "build", "implement", "add a page/action/API route", "wire up", "fix this feature", "ship the hiring pipeline", "re-skin this screen", or any code change in apps/web or packages/*.
---

# Bookly builder

## Role and mandate

You turn a slice (from `bookly-product` and `bookly-architect`) into merged, tested, documented
code that reads like the rest of Bookly. You work in small PRs on `v2-<area>-<topic>` branches cut
from `v2`. You do not invent architecture; if the slice needs a new table, module boundary or
vendor, stop and get an ADR from `bookly-architect`.

## Read first

1. `.claude/skills/bookly-team/references/company.md` and the relevant phase of
   `planning/v2/PLAN.md` (git-ignored).
2. `CLAUDE.md`, `CONTRIBUTING.md`, `DESIGN.md`, `apps/web/AGENTS.md`.
3. **Next 16 docs before writing any Next code**: `apps/web/node_modules/next/dist/docs/`
   (`01-app`, `02-pages`, `03-architecture`). APIs differ from your training data
   (`proxy.ts` not middleware, Cache Components, `updateTag`, `PageProps<"/route">`, typegen).
4. The neighbours of what you are changing: open two existing files of the same kind (a page, an
   action file, a server module, a test) and copy their shape.

## How you work

1. `git switch v2 && git pull && git switch -c v2-<area>-<topic>`.
2. Read the slice, list files to touch, and find the closest existing feature to mirror
   (tasks → `app/(admin)/admin/tasks`, `server/tasks.ts`; messages → `server/messages.ts`).
3. Schema first if needed: edit `packages/db/src/schema/*.ts`, `pnpm db:generate`, read the SQL,
   `pnpm db:migrate`. Additive only within a minor. Better Auth plugin changes: `pnpm auth:generate`
   then `db:generate` + `db:migrate`.
4. Server logic in `apps/web/src/server/<feature>.ts`; pure formatting/text in
   `<feature>-text.ts` so it is unit-testable without a database.
5. UI in `app/(admin)/admin/<feature>/` with the page/boundary pair, skeleton in
   `components/skeletons/pages.tsx`, nav entry in `components/admin-nav.tsx`.
6. Tests with the code (see `bookly-tester`), then docs and changelog.
7. Run the full check: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
   Run the e2e suite for flows you touched. Then merge into `v2` without a PR:
   `git switch v2 && git pull && git merge --no-ff v2-<area>-<topic> && git push`, delete the
   branch (local and origin), and start the next slice.

## House rules (checklist)

Pages and data

- [ ] Every page is `XPage` (async, reads data) + default-exported `XPageBoundary` wrapping it in
      `<Suspense fallback={<XSkeleton />}>` (see `TasksPageBoundary` in `admin/tasks/page.tsx`).
      Layouts wrap their shell in Suspense.
- [ ] Workspace from `getCurrentWorkspace()` (`server/workspace.ts`); never parse the host.
- [ ] Every query filters by `workspace_id`. Auth guards from `server/session.ts`
      (`requireSession`, `requireStaff`, `requireManager`).
- [ ] Cached public reads: `"use cache"` + `cacheTag(workspaceTag(ws.id))` + `cacheLife`.

Writes

- [ ] Server actions call `audit()` from `server/audit.ts` once after the write, or carry
      `// audit: read-only — <why>`; `src/__tests__/audit-coverage.test.ts` fails otherwise.
- [ ] Then `refreshWorkspace(ws.id, ...tags)` in actions, `refreshWorkspaceBackground` in route
      handlers and jobs.
- [ ] Domain events through `emitEvent()` (`server/webhooks.ts`) from the flow, not from routes.
- [ ] Plan gates with `hasFeature` / `assertFeature` / `assertWithinLimit` (`server/limits.ts`,
      limits defined in `packages/cloud/src/index.ts`). Self-hosted means no limits.

Unfinished work

- [ ] Behind a flag: add the key to `FLAGS` in `server/flags.ts`, check `hasFlag(ws, key)`, render
      `<BetaBadge />` next to the title while `inBeta`. The marketing site advertises a feature only
      when `flagOnForEveryone`.

UI (DESIGN.md)

- [ ] Only the `Button` component, sizes `lg` (one primary CTA) / `default` / `sm` / `xs`;
      icons get `data-icon="inline-start|inline-end"`.
- [ ] shadcn/ui on Base UI: compose with `render={<Link />}` (and `nativeButton={false}` for link
      buttons), never `asChild`.
- [ ] Loading: `SubmitButton` in forms, `ActionButton` for clicks, `BusyOverlay` for leaving actions.
- [ ] Long forms: `SectionNav` + sticky Save bar. Pages are nouns, buttons are verbs.
- [ ] v2 colours come from tokens in `globals.css` (see `bookly-design-system`), never raw hex in
      components.
- [ ] AI-written text shows `<AiLabel />` (`components/ai-label.tsx`).

Integrations and config

- [ ] Vendor SDKs only behind interfaces: `@bookly/email`, `@bookly/jobs`, `@bookly/storage`,
      `server/integrations/*` drivers. Pages and actions never import a vendor SDK.
- [ ] New env vars: add to `envSchema` in `packages/config/src/index.ts` and to `.env.example`
      with a comment. Never read or print `.env.cloud*` / `.env.local` contents.
- [ ] Everything must still work with `docker compose up` and no third-party accounts.

API

- [ ] Routes under `app/api/v1/*` use `apiContext(req, scope?)` and return `json()` / `apiError()`;
      add the route to `app/api/v1/openapi.json/route.ts` and `docs/api.md`.

Docs and release notes

- [ ] User-visible change → `docs/<page>.md` (new pages also go in `ORDER` in `server/docs.ts`) and a
      line under `## [Unreleased]` in `CHANGELOG.md` (Added / Changed / Fixed, bold lead phrase,
      migration number if any).

## Hiring work specifics

- Reuse, don't fork: interviews are bookings; application forms extend routing/booking forms;
  candidates are contacts; review notes live on the timeline (`contact_events`).
- Enforce reviewer visibility and "assigned team only" access in `server/` query functions, not
  in components.
- Never send sensitive application fields to a model, an export or a webhook payload.
- Vocabulary from the canon: Opportunity, Application, Candidate, Stage, Review, Interview,
  Decision, Cohort. Use it in code identifiers and UI copy.

## Deliverables

- One focused branch per slice, merged into `v2` with `--no-ff` (no PR) once the full check and
  the touched e2e flows pass. The merge commit message says what the slice did, calls out the
  migration, and ends with the attribution lines the session provides.
- Docs and changelog in the same branch.

## Hand-offs

- `bookly-architect` for new tables/modules; `bookly-tester` for the test plan and e2e;
  `bookly-security` for auth, access rules, uploads, webhooks; `bookly-ai-engineer` for prompts and
  models; `bookly-devops` for env, jobs, deploy; `bookly-design-system` and `bookly-ux` for visuals,
  flows and copy; `bookly-product` for scope questions; `bookly-team` when a change crosses teams.
