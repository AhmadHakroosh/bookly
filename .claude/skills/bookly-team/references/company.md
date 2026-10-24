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

### Hiring: cohorts first, built to bend (decided 2026-10-24)

- **Cohorts lead.** The first hiring release targets cohort-based selection: fellowships,
  accelerators, internships, bootcamps, scholarships, admissions, residencies. Jobs follow on the
  same model; nothing in the data model may assume a single hire or a single opening.
- **Customers define the pipeline.** Stages are created, renamed, reordered, removed per
  opportunity (from a template, or from scratch); each stage has a category (open, hold, won,
  lost) so reports work whatever the names are. No stage name is hard-coded anywhere.
- **Customers choose the modules per stage.** Every stage is composed from Bookly's existing
  modules, switched on and configured by the customer, not built per use case:

  | Module          | What it does on a stage                                                                                    |
  | --------------- | ---------------------------------------------------------------------------------------------------------- |
  | Forms           | Collect answers and documents (application, follow-up questions, references)                               |
  | Reviews         | Structured scorecards, assigned reviewers, independent until submitted                                     |
  | Scheduling      | 1:1 or panel interviews, self-scheduling links, group sessions (info sessions, assessment days) with seats |
  | Video + capture | Bookly video or Meet/Zoom/Teams, consent-based transcript and recap                                        |
  | Messages        | Templated emails/SMS on entering or leaving the stage; candidate replies land in one conversation          |
  | Tasks           | Coordinator checklists created when an application reaches the stage                                       |
  | Files           | Required documents, shared folders per application or cohort                                               |
  | Payments        | Application fees or deposits through the workspace's Stripe account                                        |
  | Routing         | Send applicants to tracks, reviewers or sub-cohorts by their answers                                       |
  | Decisions       | Per-person or batch decisions with a decision meeting                                                      |

  Stage rules ("when an application enters this stage, send the booking link and create the
  checklist") are data, so a customer can model a fellowship, a hiring loop or an admissions
  round without code. The architect owns the model (`pipeline_stages` + stage modules config).

### Hiring decisions taken by the specialists (2026-10-24)

The founder delegated the open questions of the hiring specs and ADRs 0001–0006; full record in
`planning/v2/decisions/2026-10-24-hiring-and-platform.md`. The cross-cutting ones:

- **X1 No numbers that rank people.** Per-criterion rating distributions and recommendations in
  words; no averages, totals or weighted scores, never a sort by rating; no calculated or
  quiz-style form fields.
- **X2 Requirements flag, a person decides.** Unmet eligibility requirements mark an
  application for a human; a bulk "Not selected: doesn't meet requirement" action records the
  decider. Nothing is rejected automatically.
- **X3 Collaborator seat** for reviewers, interviewers and viewers: 2 included on Free, 5 on
  Pro and Team, then $6 a month each; outside Team's two-seat minimum; unlimited self-hosted.
  External reviewers are collaborators (no magic-link reviewers in v1).
- **X4 Retention for people not admitted:** 6 months after the cycle's last decision; 12 months
  for job and internship opportunities (US 29 CFR 1602.14); configurable 30 days–24 months.
- **X5 Applicants are 16 or older.** Under-16 opportunities need a separate decision.
- **X6 Compliance and open core:** what one customer needs to run a lawful selection process is
  core (notice, data rights, per-opportunity retention, accommodations, separate self-ID,
  independent reviews, attributed decisions, audit log); organisation-scale compliance
  programmes are ELv2 (adverse-impact/EEO reporting, LL 144 exports, anonymised review,
  per-region policy sets, confidential opportunities, works-council packs).
- ADRs 0001–0006 are **Accepted**; the legacy contact stage column is dropped in **1.1**.

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

## Brand v2: the **02 "Open Dialogue"** mark in the **concept palette** (decided)

Two sources, one identity (decided by the founder, 2026-10-24):

- **Shape** comes from logo exploration **02** in `planning/v2/concepts/logo.png` (local,
  git-ignored; original in `~/Downloads/bookly_v2`). Only the shape: 02's blue palette is not used.
- **Colour** comes from the **UI and marketing concepts** (`app ui.png`, `ui mocks.png`,
  `mocks.png`, `hiring.png`, `marketing ui*.png`): warm orange on warm paper with near-black ink.
- The other explorations (01, 03, 04, 05) are rejected; don't mix them in. No vector of 02 exists:
  `bookly-design-system` draws it (`apps/web/src/components/brand/logo.tsx`, `brand/`).

- **Mark**: a solid lowercase **b**. Tall stem with rounded top; the bowl is a rounded speech
  bubble whose tail is the bottom of the stem, pointing down-left. Behind it, offset right and
  lower, a second, lighter bubble with its tail pointing down-right: a reply. Two sides in
  dialogue, which keeps the old story (بُكلة, a buckle fastens two sides; so does a meeting).
- **Wordmark**: "bookly", lowercase, heavy geometric sans, tight spacing, Ink. Drawn as paths.
- **App icon**: white b + Reply bubble on a Bookly Orange rounded square.
- **Lockups**: mark + wordmark on Paper; reversed (white) on Ink; stacked tile with
  "People / Conversations / Progress".
- **Palette** (sampled from the concepts; tokens and contrast in
  `bookly-design-system/references/tokens.md`):

  | Token         | Hex       | Role                                                             |
  | ------------- | --------- | ---------------------------------------------------------------- |
  | Bookly Orange | `#E85D2C` | The mark, brand fills, large display type, icons, progress, dots |
  | Ember         | `#B93E10` | Orange **text** and filled buttons with white labels (AA-safe)   |
  | Peach         | `#FBE9DF` | Active nav, selected cards and rows, recap/attention cards       |
  | Apricot       | `#FCDCC2` | Time chips ("In 15 min"), soft highlights; Ink text on it        |
  | Reply         | `#F5B6A0` | The second bubble, illustrations                                 |
  | Ink           | `#1C1C1C` | Text, dark buttons ("Join meeting", "Create"), reversed surfaces |
  | Paper         | `#FAF8F4` | App and site background                                          |
  | Sand          | `#F4F2EE` | Sidebar, secondary surfaces                                      |

  **Accessibility rule:** Bookly Orange with white text is 3.48:1 and fails WCAG AA for normal
  text. Use it for the mark, fills, icons, large type (≥ 24 px, or ≥ 18.66 px bold) and UI parts;
  use **Ember** wherever orange carries small text (button labels on orange, links, active nav
  text). Status colours stay **semantic and separate**: success green, warning amber, danger red;
  "Due today" and count badges use warning/danger, not brand.

- **Graphic language**: rounded bubble shapes, overlapping orange/reply forms. Friendly, warm,
  precise. No gradients on UI chrome.
- **Type**: Geist for UI and marketing (already shipped); display headlines bold with tight
  tracking (≈ -0.03em). The wordmark is artwork, not typed text.
- **Taglines**: "People. Conversations. Progress." (brand), "A booking starts it. Bookly keeps
  it moving." (client work), "The call ends. The context stays." (capture), **"Every applicant heard. Every decision clear."** (hiring: solution pages,
  application pages, ads; chosen by the founder 2026-10-24). It carries the hiring guardrails:
  candidates get a response and a visible status, and every decision is made and owned by a
  person. Don't use it next to anything that ranks or auto-rejects people.
- **Press page**: the platform host serves `/press` with the logo files, colours, type, product
  UI and boilerplate (owned by `bookly-design-system`, copy by `bookly-brand-marketing`).

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

**The concepts are binding** (founder, 2026-10-25): the new app and the new marketing site look,
navigate and connect exactly as they draw it: their sidebars (no invented group headings), top
bar, page headers, screens, and the links between parts and modules (the contact workspace as
the hub, the client journey Booked → Prepared → Met → Followed up → Paid, the hiring pipeline →
candidate pane → interviews → reviews → decision). The screen-by-screen spec, the conflicts
between sheets and their resolutions are in `planning/v2/ux/concept-fidelity.md`; every UI slice
is checked against it with concept-vs-build screenshots. `https://hiresam.local` (the founder's
Sam site) is the second reference for what the concepts do not show (marketing IA, mega menus,
comparison pages, FAQ, footer, one account for every workspace), never for colour.

**Light only.** The dark theme is retired (founder, 2026-10-25), as the concepts are light: no
`.dark` tokens, no theme toggle. Logos on dark backgrounds stay a brand use (press page, CTA
bands).

Only the logo differs from the concepts: they show an outlined orange "b"; v2 replaces it with
the 02 mark in Bookly Orange.

## Licensing: open core (decided direction)

- **Core: AGPL-3.0**, everything that makes Bookly a complete product for one team, self-hosted.
- **Commercial modules: source-available** under the Elastic License 2.0 (see below),
  living in clearly marked directories (`packages/cloud` today; `ee/` or `packages/ee-*` next).
  Readable by anyone ("open code": every line that runs is published), usable in production only
  with a subscription or license key.
- **Never move a shipped AGPL feature behind the commercial license.** Released code stays AGPL
  forever; enterprise value comes from new modules.
- Inbound contributions need a **CLA** (license grant to Cloudeo Solutions, LLC) before the first
  external merge; the copyright holder should be the LLC (IP assignment from the founder).
- **Commercial license: Elastic License 2.0** (decided by business + legal, 2026-10-24) for
  `packages/cloud` and every `ee/` module, with license-key gating in code. Reasons and the
  alternatives considered: `bookly-legal-licensing/references/open-core-boundary.md`. Counsel
  confirms before the first commercial module ships; fallback is a custom EE license.
- **Trademark: clearance started 2026-10-24.** "Bookly" is likely in conflict with an established
  booking product of the same name. Preliminary knockout search in
  `planning/v2/legal/trademark-clearance.md`; counsel's full search and opinion decide whether
  to file, coexist or rename. No paid marketing of the name before that.

Draft boundary (legal + product own it; see `bookly-legal-licensing`):

| Core (AGPL)                                                                        | Commercial (ELv2, source-available)                                                                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduling, booking pages, routing, payments, calendars, video                     | SSO (SAML/OIDC), SCIM, directory sync                                                                                                          |
| People/contacts, pipelines, messages, tasks, files, notifications                  | Advanced roles/permissions, org-wide multi-workspace admin                                                                                     |
| Hiring basics: opportunities, applications, stages, interviews, reviews, decisions | Hiring compliance programmes: anonymised review, EEO/adverse-impact reports, LL 144 audit exports, per-region retention policy sets (canon X6) |
| Capture + AI recaps (own key), API v1, webhooks, custom domains                    | ATS/HRIS connectors (Greenhouse, Lever, Workday, Personio, BambooHR)                                                                           |
| Self-host, `TENANCY=single`                                                        | Cloud plans/billing (`packages/cloud`), audit export, data residency, SLAs                                                                     |

## Engineering canon

Read `CLAUDE.md`, `apps/web/AGENTS.md` (Next 16 is not the Next you know: read
`apps/web/node_modules/next/dist/docs/` first), `CONTRIBUTING.md`, `DESIGN.md`. In short:
pnpm 11 + Turborepo, Node 24; dev on 3002, Postgres on 5433; tenancy by `workspace_id`
everywhere, resolved in `src/proxy.ts`; `XPage` + `XPageBoundary`; `"use cache"` + `workspaceTag`;
`refreshWorkspace` in actions; `audit()` after every write; vendors behind interfaces; flags via
`hasFlag`; every user-visible change updates `docs/` and `CHANGELOG.md`.

### Delivery: realtime first (decided 2026-10-24)

Notifications, messages and emails reach people over a **websocket first**. Email, desktop push,
SMS/WhatsApp and other channels are the **fallback**, used only when the recipient is not
connected. Every delivery goes through one presence-aware layer (`notify()` and the message and
thread services); features never email a member or a guest directly when a live channel could
carry it. Self-host keeps working with `docker compose up` and no third-party accounts (a
self-hosted websocket server and presence by default; cloud may use a provider behind an
interface). Design: ADR 0007 (to write); until it lands, the bell and Messages run on the
Server-Sent Events stream.

### Versioning

- **v2 ships as Bookly 1.0.0** (decided 2026-10-24). "v2" is the project and branch name; the
  release is the first major version. 0.20.x stays the last 0.x line on `main`.

### Branching

- **`v2` is the trunk for the new version.** Every v2 branch is cut from `v2`. When it is done
  (full check passes, verified), it is **merged straight into `v2` without a PR**
  (`git merge --no-ff`, push `v2`, delete the branch) and work continues with the next planned
  slice (founder's rule, 2026-10-24). `main` keeps receiving 0.20.x fixes; merge `main` into `v2` regularly, never
  the other way until v2 is released.
- Branch names: `v2-<area>-<topic>` (e.g. `v2-brand-tokens`, `v2-hiring-schema`). Not
  `v2/…`: git cannot hold a branch `v2` and branches under `v2/` at the same time.
- Several sessions work in parallel worktrees against one local Postgres. Run the e2e suite on
  a port and database of your own (`E2E_PORT=30xx`, `DATABASE_URL=…/bookly_e2e_<branch>`):
  the default `3010` and `bookly_e2e` collide when two runs overlap. New migrations go after
  merging `v2` into your branch, so numbers never clash.

## Plan

The working plan lives at `planning/v2/PLAN.md` (git-ignored, local only). Read it before
starting v2 work; update its status lines when a phase moves.
