# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [Unreleased]

Everything below is on `main` ahead of the first release, which will be tagged `v0.1.0`.

### Added

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
