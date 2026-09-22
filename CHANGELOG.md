# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [Unreleased]

Everything below is on `main` ahead of the first release, which will be tagged `v0.1.0`.

### Removed

- The unused storage layer (`packages/storage`, `STORAGE_*` and `S3_*` variables, the MinIO service in Compose): nothing in Bookly uploads files; profile photos and logos are URLs

### Added

- Yearly billing: Pro $120 a year and Team $100 a member a year (two months free), behind `STRIPE_PRICE_PRO_YEARLY` / `STRIPE_PRICE_TEAM_YEARLY`. The landing page, pricing page and Admin → Billing share a monthly/yearly switch (yearly by default), Stripe's interval is mirrored onto the workspace, offers in the structured data list both periods, and the terms and pricing FAQ describe yearly renewal and cancellation
- Cloud deployment target bookly-app.io: `www` redirects to the apex on the platform host, the update-check default points at `https://bookly-app.io/api/telemetry`, and `docs/cloud.md` gains a Vercel deployment walkthrough (domains, env import, migrations, Stripe endpoints)
- Stripe Connect for cloud mode: guests pay the host's own Stripe account, never the platform's. Owners connect through Stripe's hosted onboarding (Settings → Payments, Pro and Team); prices apply once Stripe enables charges, refunds run on the host's account, and payment requests follow the same route. A second webhook endpoint (`/api/webhooks/stripe/connect`, `STRIPE_CONNECT_WEBHOOK_SECRET`) confirms those payments and tracks onboarding. Console → Payments shows the Stripe setup, the connected hosts and sets the platform fee, with a per-workspace override on the workspace page; migration 0020 adds `stripe_account_id`
- Booking pages carry the workspace name with the Bookly mark and a “Powered by Bookly” footer; on plans that remove branding (Pro, Team, self-hosted) the logo and accent colour from Settings → Branding replace them, and the colour recolours buttons, selected days and focus rings. Emails say “Powered by Bookly” too
- Operator console reads on a phone: the tab strip wraps, health checks stack their detail under the name, search rows stay on one line, long emails and JSON wrap inside their cards, and the installs table scrolls sideways with dates on one line
- Branding in Settings: a logo URL and accent colour used in every guest email, on the plans that remove Bookly branding (Pro, Team, and every self-hosted install); Free keeps the Bookly mark and footer
- Live captions under the built-in video call while auto-capture is on: the last lines transcribed, with speaker and time, as they arrive
- Landing page: “Emails in your name” section with a mock of the branded confirmation, proposal review and pay button in the follow-up copy, a “Your data, your call” card, two new comparison rows (branded emails, self-service export and deletion) and a note on self-host update notices and opt-in telemetry
- Proposals and payment requests are sent in two steps: edit the prefilled template, then review the exact branded email (recipient, subject, rendered body, and what the Pay button will link to) in a dialog before confirming; the Pay button comes from the request itself rather than a link in the text; proposal and payment templates have Preview links in Settings; a contact without a company gets their name in the default subject
- Emails rebuilt on React Email with the workspace's branding (logo, name, accent), a details card, buttons and a plain-text alternative; confirmations, reminders, cancellations, follow-ups, proposals, payment requests, client recaps, sign-in links, password resets and invitations. Workspaces can replace the wording of the confirmation, reminder and cancellation emails (Admin → Settings → Guest emails, with previews); defaults remain
- Guest-facing emails (confirmations, reminders, cancellations, follow-ups, proposals, payment requests, client recaps) are sent as “<host name> via Bookly” at the platform address, with the host's email as Reply-To
- Plan cards are one shared component on the landing page and the pricing page, with each plan's standout features (contacts and briefings on Free, auto-capture and paid bookings on Pro, team scheduling and the larger capture budget on Team) listed first and emphasised
- Marketing SEO and mobile pass: JSON-LD (Organization, WebSite, SoftwareApplication with offers, FAQPage on pricing, breadcrumbs on every subpage), web manifest, light/dark theme colour, stable sitemap dates, noindex on the workspace chooser, a comparison table that reads at 320px, and a movement-only hero entrance so the headline paints immediately; Lighthouse mobile: SEO 100, accessibility 100, best practices 100
- Loading states everywhere: a navigation progress bar, route and page skeletons instead of blank streaming, and every form submit button disables itself with a spinner while its action runs (server-action forms included); task complete / remove controls show progress too
- Cloud-mode end-to-end suite in CI (`e2e-cloud` job): marketing pages, social metadata, robots and sitemap, real 404s, telemetry receiver, sign-up consent (API and UI), a tenant booking, the workspace chooser and the operator console, plus axe checks; the e2e build omits `upgrade-insecure-requests` so plain-http test hosts work
- Accessibility: light-theme muted text darkened to pass AA contrast; consent and telemetry checkboxes have accessible names; landing-page mocks are marked decorative
- Jobs on QStash for serverless: one job registry with pg-boss (self-host), QStash (`QSTASH_TOKEN` + signing keys; signed `POST /api/jobs/<name>`, delays, retries, dead-letter queue, cron schedules registered on boot) and inline drivers; reminders and follow-ups scheduled at their exact time per booking; webhook deliveries, transcript processing and CRM sync/notes run as retried jobs; Console → Health shows schedules and dead-letter count
- Shared rate limiting: one limiter behind public forms, the API, the live-transcript endpoint and Better Auth's sign-in limiter, counting in memory by default and in Upstash Redis (REST, no SDK) when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set, so Vercel instances and replicas share counts; store outages fail open with a log line; Console → Health reports the limiter
- Data rights: owners can download a JSON export of the whole workspace (Admin → Settings → Your data, `GET /api/admin/export`, secrets excluded) and delete the workspace permanently after typing its slug (cancels the cloud subscription; single-tenant installs return to the setup wizard); users can delete their account from the profile page once they own no workspace
- Update check and telemetry: self-hosted installs ask `TELEMETRY_URL` once a day for the latest version (sending version, tenancy, Node version and a random install id; `TELEMETRY=off` disables), the admin shows an update notice, and workspaces can opt in to share coarse usage counts. The platform records pings in `installs` (migration 0019) and Console → Installs shows active installs, versions and totals
- `GET /api/health` for uptime checks (200 when Postgres is reachable, 503 otherwise)
- Cloud sign-up requires accepting the terms of service and privacy policy; acceptance time and policy version are stored on the user (`consent_at`, `consent_version`, migration 0018) and shown in the operator console
- README rewritten with the new mark, a feature map, self-hosting requirements, env overview and operations, and a contributor section
- Marketing site (cloud mode): rebuilt landing page with the meeting lifecycle, live-transcript, routing, seats and follow-up mocks, a comparison table, scroll animations, a full header and footer; pricing page with plan comparison and FAQ; about, contact, security, privacy, terms and changelog pages; `robots.txt`, `sitemap.xml`, Open Graph and Twitter cards with a generated social image at `/og`; real 404s for unknown paths on the platform host
- Admin: a Help group pinned to the bottom of the sidebar (Documentation, Support, GitHub); Support goes to `SUPPORT_EMAIL` in cloud mode and to the issue tracker when self-hosted; sticky header and sidebar
- Brand: the buckle logo mark (بُكلة), SVG favicon, ICO and Apple touch icon
- Booking pages per host with weekly hours, date overrides, buffers, notice and horizon rules, timezone-aware for visitors
- Google Calendar and Outlook sync for conflicts and events; meeting links on Google Meet, Zoom, Microsoft Teams or built-in video (Daily.co)
- Paid bookings via Stripe Checkout with refunds on cancel
- Email, SMS and WhatsApp reminders, follow-up emails, no-show tracking, host pings on Slack / text when someone books or joins
- Teams: invitations and roles, round-robin and collective event types
- Group sessions: `seats` per event type; a slot stays bookable until full, attendees share one meeting link, seats left shown on the booking page and in the API
- Auto-capture for built-in video: opt-in or always-on transcription with speaker labels, live notice in the call, transcript on the booking page, retention and deletion; recap with summary, covered asks, decisions and action items with evidence, open questions, objections, next step, stage suggestion and follow-up, each one click; recaps to review in the inbox; client-facing recap email with chosen items; attendees can delete their transcript; cloud plans get a monthly transcription budget
- Production hardening: Playwright end-to-end suite (booking, admin, accessibility, headers) in CI, optional Sentry error tracking, and security headers (CSP, HSTS, Permissions-Policy, frame protection)
- Operator console: stats and sign-up trend, search and filters, workspace detail with usage and billing, manual plan overrides with expiry, users with ban / unban, audit log of operator actions, health checks, and a Prometheus metrics endpoint (`METRICS_TOKEN`)
- Workspace switcher in the admin header (cloud mode): current workspace, switch to any other, all workspaces, new workspace
- Password reset by email ("Forgot your password?") and password change from the profile page
- Cloud landing page rebuilt around the meeting lifecycle with light-themed mockups of the real inbox, briefing, call, recap, availability, contact and booking screens
- Polish: icon-based admin navigation, Lucide icons instead of text glyphs everywhere, external links open in a new tab, and a documentation theme with sidebar, table of contents, anchors and prev/next
- Execution: proposal and payment-request emails from templates (Stripe Checkout link for the amount), HubSpot / Pipedrive sync of contacts, stages and meeting notes, contact and task webhook events and API endpoints
- Priority-aware availability: focus blocks and a weekly meeting budget that only existing customers (active / won / vip contacts) can book into
- Meeting Inbox as the admin home: today's meetings with briefs, requests with accept / reply-instead, contacts to follow up with snooze, open and overdue tasks
- Post-meeting capture: notes or a transcript become a summary, decisions, tasks with due dates, a stage suggestion and a follow-up email draft (assistant optional); tasks with overdue nudges
- Pre-meeting briefings for hosts, written by the assistant (Anthropic, optional) or as a plain summary; shown in the admin and sent with the last reminder
- Contacts: one record per person with stage, tags, notes and follow-up date, and a timeline of every booking, email, form answer and note (Admin → Contacts)
- In-app documentation at `/docs`, rendered from the repository's `docs/` folder
- Abuse controls: per-visitor throttles on public forms, a workspace email/domain blocklist, and per-plan booking and API budgets in cloud mode
- Routing forms: a questionnaire at `/r/<slug>` with rules that send visitors to an event type, a link or a message
- Calendar push notifications: Google watch channels and Microsoft Graph subscriptions refresh busy time the moment a calendar changes (renewed automatically)
- Waitlist for full group sessions and fully booked days; first come first served when a spot frees up
- Recurring bookings: event types can repeat daily, weekly or monthly for 2–52 sessions; one booking reserves the series (a paid series is charged in one checkout), with per-session manage links and "cancel remaining"
- Public REST API with scoped keys, signed webhooks, embeddable widget, custom domains with automatic HTTPS
- Cloud (multi-tenant) mode with Free, Pro and Team plans, billing and an operator console (`packages/cloud`, proprietary).
- Docker Compose self-hosting with optional Caddy HTTPS; Vercel deployment path.
- Documentation in `docs/`.
