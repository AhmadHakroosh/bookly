# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/) and versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.3.5] - 2026-09-26

### Fixed

- "Max bookings per day" and the schedule's weekly budget counted every busy interval, including events from a connected calendar, so a host with a normal calendar showed no times at all; both now count Bookly bookings only, while calendar events keep blocking the times they cover

## [0.3.4] - 2026-09-26

### Fixed

- Signing in with an emailed link no longer removes the account's password. Better Auth 1.7 treats an account whose email was never confirmed as unproven and deletes its password (and every linked provider) on the first magic-link sign-in; Bookly never confirmed addresses, so any password user who tried the "Email link" tab was locked out of password sign-in. Sign-up on the hosted service now confirms the address first, invited members and the first self-hosted owner count as verified, and migration 0024 marks every existing password account as verified so this cannot happen to them
- Magic links sign in existing accounts only; an unknown address no longer gets an account without the consent step

### Changed

- Cloud sign-up: after the account form, "Check your inbox" waits for the confirmation link (one hour), which signs the person in and opens the workspace step; a password sign-in before that explains and resends the link

## [0.3.3] - 2026-09-26

### Fixed

- Calendar invitations (.ics) escape semicolons in titles and descriptions; a title such as "Intro call; with Ahmad" no longer breaks the event when a calendar app parses it
- Prometheus metrics escape backslashes and newlines in label values
- The embed script frames http(s) booking pages only, and adds `embed=1` as a proper query parameter

### Changed

- Code-scanning follow-ups: transcript cues and doc heading ids strip tags until stable, the From header is parsed without a backtracking regex, and webhook and console-email logs keep payload fields on one line

## [0.3.2] - 2026-09-26

### Changed

- Marketing site: the stylesheet is inlined so the first paint no longer waits on a blocking request (mobile LCP), the scroll-reveal reads its stagger delay without forcing layout, and the lifecycle dots pulse on the compositor
- `/llms.txt` on the platform host: a Markdown map of the site and the manual for AI crawlers
- Every response carries `Cross-Origin-Opener-Policy: same-origin-allow-popups`

### Fixed

- Paths that look like files (`/foo.txt`, `/ai-catalog.json`) returned the not-found page with a 200; they are real 404s now, on every host

## [0.3.1] - 2026-09-26

### Fixed

- Connecting a provider whose account uses a different email than the Bookly account now says so (the message fell back to a generic sentence); expired sign-in attempts and unverified provider emails get their own wording, and Sign-in methods states which address the provider account must use

## [0.3.0] - 2026-09-26

### Added

- Sign in with Google, Microsoft or GitHub. Each provider appears on the sign-in, sign-up and invitation pages once its OAuth client is configured (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are new; Google and Microsoft reuse the calendar clients with an extra callback URL). Sign-in asks for identity only, never calendar access. A provider never creates an account by itself: the sign-up page records consent first and a self-hosted install still requires an invitation. Google and Microsoft attach to an existing account with the same verified email; Admin → Booking page → Sign-in methods connects or disconnects providers and lets an account created through one set a password

### Changed

- Search and sharing: a workspace host (tenant subdomain, custom domain or self-hosted install) serves its own robots.txt and a sitemap of its public pages on its primary domain; profile, event and routing-form pages carry canonical and Open Graph tags and structured data (Person, Service, Offer); workspace pages are titled after the workspace and drop the "— Bookly" suffix on plans that remove branding. On the marketing site, docs pages get canonical tags, social tags and their own descriptions, the social card shows each page's title, the sitemap carries real dates or none, product mocks no longer inject headings, and the 404 page has a title. The event page streams its calendar behind a skeleton, and the build targets evergreen browsers

## [0.2.1] - 2026-09-25

### Added

- Event types have a **Waitlist** switch (off by default). With it on, a full group session or an empty day offers "tell me when a spot opens"; with it off, a full session shows as "Full" and cannot be joined (migration 0023)

### Changed

- The booking calendar strikes through days with no times
- Marking a booking as no-show removes the automatic "Meeting took place" note from the contact's timeline and, when the contact became active only through that meeting, returns them to lead; undoing the no-show does the reverse
- The marketing footer no longer carries a "Built by" line

### Fixed

- Group sessions stayed unbookable while seats remained when the host's connected calendar returned the session's own event as busy time
- A booking made the same day no longer receives the "tomorrow" reminder right after booking; reminder offsets that had already passed when the booking was made are skipped

## [0.2.0] - 2026-09-25

### Changed

- Group sessions, series and waitlists show their numbers everywhere: the booking page carries a "6 sessions" badge, the series note and "N seats left" on every time (full times stay in place as "Full · waitlist" or "Full · 2 waiting"); the attendee's booking page has a session card with "2 / 3 seats", the open seats and the waitlist size; `Admin → Bookings` folds each session into one card with the seat count, every attendee (name, company, email, status, actions) and who is waiting, and the brief page lists the attendees. The profile page badges recurring and group event types. The layouts fit phones as well as wide screens

## [0.1.0] - 2026-09-24

First public release: the self-hostable scheduling platform with contacts, briefings, auto-capture and recaps, plus the hosted cloud mode at bookly-app.io.

### Added

- Custom domains on the cloud: a verified domain marked **primary** under Admin → Domains is the workspace's public address. Booking pages, manage links, waitlist and unsubscribe links in emails and in the API use it, and guest pages requested on `<slug>.bookly-app.io` or another verified host redirect to it; the admin stays on the slug host, where the session cookie lives
- Zoom deauthorization endpoint (`/api/webhooks/zoom`, verified with `ZOOM_WEBHOOK_SECRET`): answers Zoom's URL validation, and removes a user's Zoom connection and tokens when they uninstall Bookly from their Zoom account, as Marketplace publication requires
- Compliance for the hosted service: outreach emails (proposals, payment requests, follow-ups) carry the workspace's postal address (new Settings field) and an unsubscribe link with one-click `List-Unsubscribe` headers; a contact who unsubscribes is marked on their page and in the inbox and the composer refuses to send, and hosts can opt a contact out or back in on request (migration 0022). Event types set to always transcribe now say so on the booking form and in the calendar invitation as well as the confirmation, bookings store when consent was given, and the notetaker announces itself in the meeting chat to everyone who joins. Briefings, recaps and drafts are labelled AI-generated. Error reports have guest emails and phone numbers scrubbed before they reach Sentry. `STRIPE_TAX=on` adds Stripe Tax (address and VAT-id collection) to plan checkouts. New `/dpa` page with the sub-processor table, incorporated into the terms; terms and privacy updated for the operating entity (Cloudeo Solutions, LLC, address from `OPERATOR_ADDRESS`), an 18+ rule, no regulated (HIPAA) data, recording-consent and commercial-email responsibilities, US state privacy rights and tax at checkout
- Follow-up emails from a contact page: a third outreach button beside Proposal and Payment request, with its own editable template (Settings → Proposal, payment and follow-up emails, placeholder `{bookingUrl}` for your booking page), the same preview-then-send flow, a timeline entry and a new follow-up date. The inbox's follow-up list links straight into the composer
- Several availability schedules per member: Admin → Availability lists them, adds one (a copy of the default), switches between them, makes any the default and deletes the others; event types choose their schedule and fall back to the default when it is removed. A date override can be applied to all of a member's schedules at once (on by default) and removed everywhere with one click
- Event types can offer several ways to meet (Bookly video, Meet, Zoom, Teams, phone, in person, custom): the editor lists them, the first is the default, and with more than one the attendee picks on the booking form; a phone call asks for the attendee's number with a country picker preselected from their location and stores it as E.164, an in-person meeting without a host address asks the attendee for one, and both show in the invitation, the emails and the booking pages (the choice is kept when rescheduling; the API takes `location` and lists `locations`). Auto-capture is offered when any of them can be transcribed and applies to the chosen one; migration 0021
- Auto-capture on Google Meet, Microsoft Teams and Zoom: with `RECALL_API_KEY` set, a notetaker bot (Recall.ai) joins calls that should be transcribed, streams the transcript live to Bookly and delivers the full transcript when it leaves; from there recap, tasks and follow-ups work exactly as on Bookly video. Same consent, plan and minute-budget rules; the bot is capped at the remaining minutes and cancelled with the booking. Event types on those providers now offer the Auto-capture setting, the confirmation email says a notetaker joins, and the health page shows the notetaker status
- Daily seat reconcile for Team subscriptions on the job tick: every Team workspace's Stripe quantity is compared to its member count and corrected, so a failed update at join or leave time cannot leave seats unbilled; the terms now state how added and removed seats are charged and credited
- Yearly billing (two months free), behind `STRIPE_PRICE_PRO_YEARLY` / `STRIPE_PRICE_TEAM_YEARLY`. The landing page, pricing page and Admin → Billing share a monthly/yearly switch (yearly by default), Stripe's interval is mirrored onto the workspace, offers in the structured data list both periods, and the terms and pricing FAQ describe yearly renewal and cancellation
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

### Changed

- Cloud pricing: Pro is $24 a month or $240 a year ($20 a month billed yearly), Team $30 a member ($300 yearly, $25 a month; two seats minimum). Bookly video moves to Pro (Free keeps Meet, Zoom, Teams, phone and in-person; a Free workspace's Bookly video rows are hidden from booking pages and cannot be saved). Auto-capture is sold in hours: 5 a month on Pro, 8 per member pooled on Team, and past the budget transcription continues at $3 an hour billed by the minute on the next invoice through a Stripe metered price (`STRIPE_PRICE_CAPTURE_OVERAGE`), with a switch on Admin → Billing to stop at the included hours instead. Paid bookings are available on every plan, Free included: paid plans pay no platform fee, Free pays 5%; Console → Payments sets a rate per plan. Team's shared customer memory (contacts, timelines, briefings across the workspace) is now stated on the plan. Pre-meeting briefings run on Haiku 4.5 (`ASSISTANT_BRIEF_MODEL`); recaps stay on the main model
- Dropdowns and date pickers use the app's own components everywhere (the shadcn Select and Calendar over Base UI) instead of the browser's: event type and routing editors, booking and routing forms including the country picker and choice questions, the booking page timezone picker, the console, team invites, notifications, contacts and calendar settings; dates are picked from a popover calendar with a clear button where optional; times in availability hours and date overrides are picked from a quarter-hour dropdown; colours (event type colour, branding accent) come from a popover with preset swatches and a hex field instead of the browser dialog; number fields have their own minus and plus buttons with the unit joined to the field
- The built-in video option is now called **Bookly video** everywhere: booking pages, admin, marketing, docs and health checks
- Team has a two-seat minimum: checkout and the seat sync bill at least two members, and the pooled capture budget counts the billed seats, so a one-person Team pays for two seats and gets two seats' worth of capture hours; the plan card, FAQ and terms say so

### Fixed

- Admin → Domains: a newly added custom domain no longer stretches the list off the page; each domain is a card and the TXT record, token and target wrap on any screen
- Bookly video: the Daily webhook that drives auto-capture and "attendee joined" pings is registered automatically for the whole install (first room or job tick, `platform_state` key `daily.webhook`) instead of only when a workspace turned join notifications on; the webhook route finds the booking by room across workspaces. Hosts are recognised by a Daily owner token issued when a signed-in member opens the meeting page, so transcription starts even if both sides typed the same name; attendee links carry their manage token to pre-fill their name. "Attendee joined" is now a plain on/off preference per workspace (on by default). Console → Health reports the webhook.

### Removed

- The unused storage layer (`packages/storage`, `STORAGE_*` and `S3_*` variables, the MinIO service in Compose): nothing in Bookly uploads files; profile photos and logos are URLs

[Unreleased]: https://github.com/AhmadHakroosh/bookly/compare/v0.3.5...HEAD
[0.3.5]: https://github.com/AhmadHakroosh/bookly/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/AhmadHakroosh/bookly/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/AhmadHakroosh/bookly/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/AhmadHakroosh/bookly/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/AhmadHakroosh/bookly/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/AhmadHakroosh/bookly/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/AhmadHakroosh/bookly/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/AhmadHakroosh/bookly/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AhmadHakroosh/bookly/releases/tag/v0.1.0
