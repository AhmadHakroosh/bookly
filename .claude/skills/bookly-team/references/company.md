# Bookly canon

The facts every Bookly specialist works from. When a skill and this file disagree, this file wins;
when this file and the code disagree about how something works today, the code wins and this
file gets fixed. Decisions marked **(open)** are not settled: raise them, don't assume them.

## Company

- Operator: **Cloudeo Solutions, LLC** (Delaware, file 2625383; San Francisco mailing address in
  `~/Projects/cloudeo.solutions/src/content/company.ts`). Founder: Ahmad Hakroosh.
- Cloudeo's principles, which Bookly inherits:
  1. **Automate the routine.** If a person does something the same way twice, the product does it
     the third time.
  2. **Open core, fair cloud.** The core is open source; the cloud charges for running it well,
     not for locking anyone in.
  3. **Built for people and agents.** Every product has an API and a machine-readable surface
     (`/.well-known/*`, `llms.txt`, WebMCP tools, OpenAPI).
- Hosted product: `bookly-app.io` (`TENANCY=multi`). Self-host: `docker compose up`, `TENANCY=single`.
- Sole copyright holder so far (497 commits by the founder, the rest are Dependabot), which keeps
  relicensing and the open-core split clean. Keep it that way: see Licensing.

## Product today (v0.20.x, branch `main`)

A self-hostable scheduling platform that keeps going after the booking: booking pages, event
types, availability with focus blocks and meeting budgets, routing forms, group/recurring/
round-robin, payments (Stripe Connect), calendars (Google, Microsoft, ICS feeds), conferencing
(Meet, Zoom, Teams, Bookly video on Daily.co), contacts with stages and timeline, briefings,
consent-based capture + AI recaps (Anthropic Claude, optional key), tasks (list + board),
messages (one conversation per contact + team threads), files (drive), notifications (push,
email, SMS/WhatsApp), public API v1 + webhooks, custom domains, operator console, feature flags
with beta cohorts. Next.js 16 (Cache Components), Drizzle/Postgres, Better Auth, pg-boss or
QStash, Vercel or Docker + Caddy. English only today (no i18n framework).

## Product vision (v2)

**People. Conversations. Progress.** — _A connected workspace for people, conversations and
progress._ A meeting is where two sides meet; Bookly runs everything around it: before (booking,
application, briefing), during (call, notes, capture) and after (recap, follow-up, decision,
payment).

One platform, two solutions that share every core object:

| Solution        | For                                                                                                                          | Pipeline it runs                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Client work** | Consultants, coaches, advisors, agencies, small teams selling time                                                           | Booked → Prepared → Met → Followed up → Paid                    |
| **Hiring**      | Any team selecting people: jobs, cohorts, fellowships, internships, programs, freelance gigs, admissions, volunteers, grants | Applied → In review → Interview → Decision → (Offer / Admitted) |

A workspace turns on one or both. Shared core: people (a contact _is_ a candidate in hiring
context), scheduling engine, messages, tasks, files, capture/recaps, notifications, API.

### Hiring vocabulary (use these words, in the UI and in code)

- **Opportunity**: anything people apply to. Has a _type_ (job, cohort, fellowship, internship,
  program, gig, admissions, volunteer, grant, custom), an application page, a pipeline, a review
  plan, a team, optional open/close dates and capacity (seats in a cohort).
- **Application**: one person applying to one opportunity. Carries form answers, documents, stage,
  reviews, interviews, decision. A person can hold many applications.
- **Candidate**: the person, seen from hiring. Same underlying record as a contact.
- **Pipeline / Stage**: configurable per opportunity, created from a template per type.
  Generalises today's fixed contact stages (lead/active/won/lost).
- **Review plan / Review / Scorecard**: who reviews which stage, against which criteria.
  Independent: a reviewer cannot see others' feedback until they submit their own.
- **Interview**: a booking attached to an application (panel, collective availability,
  round-robin, self-scheduling links). Reuses the scheduling engine, never a fork of it.
- **Decision**: advance, hold, waitlist, reject, offer/admit. Cohorts decide in batches with a
  decision meeting. Every decision is attributable and auditable.
- **Cohort**: an intake round of an opportunity (e.g. "2027 Horizon Fellowship — Spring cohort").

### Hiring guardrails (non-negotiable)

- AI may summarise, extract, schedule and draft. **AI never ranks, scores, rejects or recommends
  a decision about a person** unless the workspace explicitly enables an assistive feature that
  passed legal review (EU AI Act high-risk, NYC LL 144, Illinois AIVI Act, GDPR Art. 22). Humans
  decide; the UI says so.
- Access to an application is limited to its assigned team ("Access limited to assigned
  reviewers" in the mock). Sensitive fields (demographics, accommodations) are separated, opt-in
  and never shown to reviewers.
- Candidates get: a clear privacy notice on the application page, data access/deletion, a status
  they can see, and retention that defaults to deletion after the cycle (configurable per region).

## Brand v2: exploration **02 "Open Dialogue"** (chosen)

Source sheet: `planning/v2/concepts/logo.png` (local, git-ignored; original in
`~/Downloads/bookly_v2`). The other four explorations are rejected; don't mix them in.

- **Mark**: a lowercase **b** whose bowl is a speech bubble (tail at the lower left), with a
  second, lighter bubble overlapping behind it to the right: a reply. Two sides in dialogue,
  which keeps the old story (بُكلة, a buckle fastens two sides; so does a meeting).
- **Wordmark**: "bookly", lowercase, heavy geometric sans, tight spacing, ink navy.
- **App icon**: white b + light bubble on Dialogue Blue rounded square.
- **Lockups**: mark + wordmark on paper; reversed (white) on ink navy; stacked tile with
  "People / Conversations / Progress".
- **Palette** (from the sheet; confirm against the source vector before freezing):

  | Token         | Hex        | Role                                                       |
  | ------------- | ---------- | ---------------------------------------------------------- |
  | Dialogue Blue | `#3158D5`  | Brand, primary actions, active nav, links, focus ring      |
  | Mist          | `#EAF0FF`  | Active nav background, selected rows, soft brand fills     |
  | Ink           | `#19243B`  | Text, dark buttons, reversed surfaces, wordmark            |
  | Paper         | `#F9FAFC`  | App and site background                                    |
  | Reply Blue    | ≈`#A9C1F5` | The second bubble, illustrations only (sample from vector) |

  Status colours are **semantic and separate from the brand**: success green, warning amber,
  danger red, info = brand. The orange in the concept mocks ("Due today", count badges,
  primary buttons) maps to brand blue for actions and to warning/danger for urgency.

- **Graphic language**: rounded bubble shapes and overlapping blue/light-blue forms (the pattern
  strip on the sheet). Friendly, calm, precise. No gradients on UI chrome.
- **Type**: Geist for UI and marketing (already shipped); display headlines bold with tight
  tracking (≈ -0.03em). The wordmark is artwork, not typed text.
- **Taglines**: "People. Conversations. Progress." (brand), "A booking starts it. Bookly keeps
  it moving." (client work), "The call ends. The context stays." (capture). Hiring line **(open)**.

## UI v2 concepts (local, `planning/v2/concepts/`)

- `app ui.png` — Home: greeting, today strip (meetings, follow-ups, tasks), agenda timeline with
  "pick up where you left off", next steps, recent conversations, keep-things-moving, recap ready.
- `ui mocks.png` — Home, Bookings + detail, Contact workspace, Messages, Tasks, Files.
- `mocks.png` — Public booking, Event types, Availability & routing, Live meeting & recap,
  Calendars & conferencing, Brand & communications, Team & billing, Workspace settings.
- `hiring.png` — Hiring: Opportunities pipeline (kanban by stage), candidate side panel
  (overview, documents, next interview, structured review progress, decision status),
  needs-attention strip.
- `marketing ui*.png` — Website: Home, Product, Solutions (consultants/coaches/agencies/teams),
  Pricing (Free/Pro/Team), Trust & ownership, Resources.

The concepts are drawn in orange; v2 ships them in the 02 palette. Layout and IA are the
reference, colour is not.

## Licensing: open core (decided direction)

- **Core: AGPL-3.0**, everything that makes Bookly a complete product for one team, self-hosted.
- **Commercial modules: source-available** under the _Bookly Commercial License_ (to be drafted),
  living in clearly marked directories (`packages/cloud` today; `ee/` or `packages/ee-*` next).
  Readable by anyone ("open code": every line that runs is published), usable in production only
  with a subscription or license key.
- **Never move a shipped AGPL feature behind the commercial license.** Released code stays AGPL
  forever; enterprise value comes from new modules.
- Inbound contributions need a **CLA** (license grant to Cloudeo Solutions, LLC) before the first
  external merge; the copyright holder should be the LLC (IP assignment from the founder).
- "Bookly" faces a **likely trademark conflict** (an established WordPress booking plugin of the
  same name in the same class). Clearance search before global marketing spend **(open)**.

Draft boundary (legal + product own it; see `bookly-legal-licensing`):

| Core (AGPL)                                                                        | Commercial (source-available)                                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Scheduling, booking pages, routing, payments, calendars, video                     | SSO (SAML/OIDC), SCIM, directory sync                                                                                 |
| People/contacts, pipelines, messages, tasks, files, notifications                  | Advanced roles/permissions, org-wide multi-workspace admin                                                            |
| Hiring basics: opportunities, applications, stages, interviews, reviews, decisions | Hiring compliance: anonymised review, EEO/adverse-impact reports, LL 144 audit support, retention policies per region |
| Capture + AI recaps (own key), API v1, webhooks, custom domains                    | ATS/HRIS connectors (Greenhouse, Lever, Workday, Personio, BambooHR)                                                  |
| Self-host, `TENANCY=single`                                                        | Cloud plans/billing (`packages/cloud`), audit export, data residency, SLAs                                            |

## Engineering canon

Read `CLAUDE.md`, `apps/web/AGENTS.md` (Next 16 is not the Next you know: read
`apps/web/node_modules/next/dist/docs/` first), `CONTRIBUTING.md`, `DESIGN.md`. In short:
pnpm 11 + Turborepo, Node 24; dev on 3002, Postgres on 5433; tenancy by `workspace_id`
everywhere, resolved in `src/proxy.ts`; `XPage` + `XPageBoundary`; `"use cache"` + `workspaceTag`;
`refreshWorkspace` in actions; `audit()` after every write; vendors behind interfaces; flags via
`hasFlag`; every user-visible change updates `docs/` and `CHANGELOG.md`.

### Branching

- **`v2` is the trunk for the new version.** Every v2 branch is cut from `v2` and merges back
  into `v2` by PR. `main` keeps receiving 0.20.x fixes; merge `main` into `v2` regularly, never
  the other way until v2 is released.
- Branch names: `v2-<area>-<topic>` (e.g. `v2-brand-tokens`, `v2-hiring-schema`). Not
  `v2/…`: git cannot hold a branch `v2` and branches under `v2/` at the same time.

## Plan

The working plan lives at `planning/v2/PLAN.md` (git-ignored, local only). Read it before
starting v2 work; update its status lines when a phase moves.
