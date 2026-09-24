# Cloud mode (multi-tenant SaaS)

Set `TENANCY=multi`. Then:

- **Platform host** = the host of `APP_URL` (e.g. `bookly-app.io`). It serves the landing page,
  `/pricing`, `/signup`, `/workspaces` (a signed-in user's workspaces), `/login` and the operator
  console at `/console`.
- **Tenants** live at `<slug>.<ROOT_DOMAIN>` and on verified custom domains. Sign-up creates the
  account, then the workspace (organization + workspace + subdomain) and sends the user to its admin.
  Sessions are shared across subdomains (`advanced.crossSubDomainCookies`), so a user signs in once.
- Unknown tenant hosts return 404. The self-host setup wizard is disabled.

## Plans and limits

`packages/cloud` defines Free, Pro ($24 / $240 a year) and Team ($30 a member / $300, two seats
minimum; monthly prices are multiples of 6 so the yearly ten-month price also shows a whole
number of dollars a month): limits, feature gates, display prices and each plan's platform fee on paid bookings
(Free 5%, Pro and Team 0%; Console → Payments sets a rate per plan, stored in `platform_state`
key `payments` as `fees`, and the workspace page overrides one workspace). A workspace's `plan` + `plan_status` decide what applies; `self-hosted` (the default
outside cloud mode) means no limits. Enforcement points: creating event types, inviting members,
connecting integrations, adding custom domains, enabling workflows / team scheduling (paid
bookings are open to every plan; only the fee differs), Bookly video (a Pro feature: the location cannot be saved on Free, a Free workspace's
existing Bookly video rows are hidden from the booking page and provisioning skips the room), the
keyed API, and the "Powered by Bookly" line on booking pages and emails (and the workspace's own
logo and colour in its place).

Auto-capture: Pro 300 minutes a month (5 hours), Team 480 per member pooled (8 hours); the UI talks in hours
(`captureHours`, "5 hours", "$3 an hour") while billing counts minutes. Past the budget transcription
continues and the excess is billed at `CAPTURE_OVERAGE_PER_MINUTE` ($0.05) when
`STRIPE_PRICE_CAPTURE_OVERAGE` is set: a metered price on a Stripe Billing meter whose event name
is `STRIPE_METER_CAPTURE_EVENT` (`capture_minutes`). The price is added as a line at checkout and
to older subscriptions on first use; `reportCaptureOverage` sends one meter event per finished
transcript for the minutes above the budget (idempotent on the transcript id). Hosts can switch
overage off on Admin → Billing (`settings.capture.overage`), after which transcription stops at
the budget as before; without the price configured it always stops.

## Billing

Stripe subscriptions, same keys as paid bookings (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
`STRIPE_TAX=on` (after enabling Stripe Tax on the account and setting the origin address there)
makes plan checkouts collect the billing address and VAT id and add sales tax or VAT
automatically; leave it off until then or checkout fails. Recurring prices are `STRIPE_PRICE_PRO` (per workspace) and `STRIPE_PRICE_TEAM` (per member; the
quantity follows the member count). Optional `STRIPE_PRICE_PRO_YEARLY` and
`STRIPE_PRICE_TEAM_YEARLY` add yearly billing (two months free, charged up front): the pricing
page and Admin → Billing show a monthly/yearly switch, the interval is mirrored onto the workspace
(`settings.billingInterval`) from the subscription, and the console MRR estimate counts a yearly
plan at a twelfth of its price. Team is billed for at least two seats (`minSeats`); above that, seats follow the member count: `syncSeats` updates the
subscription quantity with proration when someone joins or is removed, and `reconcileSeats` on
the job tick compares every Team subscription to its member count once a day (`platform_state`
key `billing.seats`) so a failed update cannot leave seats unbilled. Admin → Billing shows usage, upgrade buttons (Stripe Checkout)
and the customer portal. The webhook needs `customer.subscription.created|updated|deleted` and
`checkout.session.completed`; `syncSubscription` mirrors the subscription onto the workspace.
A lapsed subscription drops the workspace to Free limits without deleting anything.

Paid bookings are a separate money flow: guests pay the **host's** connected Stripe account, never
the platform's (`docs/payments.md`, "Cloud mode"). The platform keeps the fee set in Console →
Payments; `STRIPE_CONNECT_WEBHOOK_SECRET` verifies the events from hosts' accounts.

## Operator console

`PLATFORM_ADMIN_EMAILS` lists who may open `/console` on the platform host: workspace list with
plan, owner and booking counts, suspend / unsuspend (public pages and the API go offline; the admin
shows a banner), and "sign in as owner" (Better Auth admin impersonation, which lands you in that
workspace's admin). Stop impersonating from the account menu or by signing out.

## Background jobs on QStash

Serverless has no long-running worker, so on Vercel the app uses [QStash](https://upstash.com/docs/qstash)
as its queue and scheduler. Set `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and
`QSTASH_NEXT_SIGNING_KEY` (from the Upstash console) and `JOBS_WORKER=false`. Then:

- Every job is an HTTP message to `POST /api/jobs/<name>`, signed by QStash and verified with
  the signing keys. Handlers are idempotent, so QStash's retries (and the safety-net schedule)
  never double-send.
- Reminders and follow-ups are scheduled at their exact time when a booking is confirmed
  (`booking.remind`, deduplicated per booking and start time); a reschedule simply creates new
  messages and the old ones find nothing due.
- Webhook deliveries, transcript download + recap (`capture.process`) and CRM sync/notes run
  as jobs with retries; failures beyond the retries land in QStash's dead-letter queue.
- Three schedules are registered on boot with fixed ids (`bookly-booking-reminders` every
  5 min, `bookly-webhooks-retry` every 5 min, `bookly-calendar-sync` every 6 h). They are
  idempotent; Console → Health lists them and the dead-letter count.

`/api/cron/tick` with `CRON_SECRET` still works as a manual fallback. Self-hosted installs
keep the in-process pg-boss worker and need none of this.

## Shared rate limiting

Public-form throttles, API limits, the live-transcript endpoint and Better Auth's sign-in
limiter all go through one limiter. Without configuration it counts per process, which is
correct for a single container but not for Vercel, where every instance would count alone.
Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (any Upstash Redis database; the
free tier is plenty) and every instance shares the same counters over Upstash's REST API. No
SDK is involved: the app sends `INCR` + `PEXPIRE NX` + `PTTL` as one pipeline per check.

If Upstash is unreachable, requests are allowed and the failure is logged rather than taking
bookings down; Console → Health shows the limiter's state.

## Installs (telemetry receiver)

The platform host receives the daily update check from self-hosted installs at
`POST /api/telemetry` and answers with the running platform version as the latest release.
Console → Installs shows active installs (7 and 30 days), the version spread, and usage totals
for installs that opted in. Rows live in the `installs` table keyed by the anonymous install id.
The platform never pings itself.

## Marketing site

The platform host serves the public site: landing page, `/pricing`, `/about`, `/contact`,
`/security`, `/privacy`, `/terms` and `/changelog` (rendered from the repository's
`CHANGELOG.md`), plus `/robots.txt`, `/sitemap.xml` and the social card at `/og`. Any other
path on the platform host is a 404. Tenant hosts stay out of search engines.

- `SUPPORT_EMAIL` is the address shown on the contact page, the legal pages and the footer.
- `APP_URL` must be set **at build time** as well as at runtime: canonical URLs and Open Graph
  tags on the marketing pages are prerendered from it. Vercel does this automatically; a Docker
  image built without it would bake the default into those tags.
- Sign-up records acceptance of the terms and privacy policy on the user (`consent_at`, `consent_version` = the `legalUpdated` date). Bump `legalUpdated` when the policies change; users who accepted an older version are visible in the console.
- The legal pages are a starting point written for a sole-operator SaaS. Have them reviewed
  before you take paying customers, and update `legalUpdated` in
  `apps/web/src/app/(platform)/platform/site.ts` when you change them.

## Legal pages and compliance

The platform host serves `/terms`, `/privacy`, `/dpa` (the data processing agreement with the
sub-processor table, incorporated into the terms) and `/security`. The operator is
`SITE.operator` in `platform/site.ts` (Cloudeo Solutions, LLC) with its address from
`OPERATOR_ADDRESS`; `SUPPORT_EMAIL` is the contact on every page. What the product does for the
operator: recording notices and stored consent (`docs/contacts.md` → Auto-capture), unsubscribe
links and one-click headers on host outreach (→ Proposals), AI-generated labels on briefings and
recaps, error reports scrubbed of guest emails and phone numbers before they reach Sentry, and
Stripe Tax on plan checkouts (`STRIPE_TAX`). What stays with the operator: accept each
sub-processor's DPA, keep the table on `/dpa` current (14 days' notice to workspace owners for
additions), register for sales tax / VAT where thresholds are crossed, and complete the Google,
Microsoft and Zoom app reviews (`docs/integrations.md`). The hosted service signs no HIPAA
business associate agreements; the terms say so.

## Deploying on Vercel (bookly-app.io)

The production layout: platform `https://bookly-app.io`, tenants `<slug>.bookly-app.io`, built-in
video `https://meet.bookly-app.io`, `www` redirected to the apex by the proxy.

1. **DNS.** Point the domain's nameservers at Vercel (a wildcard domain on Vercel needs Vercel
   DNS). In the Vercel project add `bookly-app.io`, `www.bookly-app.io`, `*.bookly-app.io` and
   `meet.bookly-app.io`. Vercel issues the wildcard certificate.
2. **Project.** Root Directory `apps/web`, Node 24, install with pnpm. `apps/web/vercel.json`
   keeps a daily `/api/cron/tick` as the safety net behind QStash.
3. **Environment.** Import `.env.cloud` from the repository root (it is git-ignored and carries
   the fixed values: hosts, drivers, `JOBS_WORKER=false`, `TELEMETRY_URL`) and fill in each
   `SET:` line: Neon, `AUTH_SECRET`, Resend (verify `bookly-app.io` there first),
   Upstash Redis and QStash, Anthropic, Daily, the OAuth apps and Stripe. `APP_URL` is read at
   build time too, so set it before the first build.
4. **Database.** From your machine: `DATABASE_URL='<neon pooled url>' pnpm db:migrate`.
5. **Stripe.** Two webhook endpoints: `https://bookly-app.io/api/webhooks/stripe` on your
   account (subscriptions and Checkout) and `https://bookly-app.io/api/webhooks/stripe/connect`
   of type _Connected accounts_ (`docs/payments.md`, "Cloud mode"). Enable Connect Express and
   set the platform name and icon hosts see during onboarding. Set the fee in Console → Payments.
6. **After the first deploy.** Sign in with an address in `PLATFORM_ADMIN_EMAILS`, open
   `/console/health` and `/console/payments`, re-register the Daily webhook from Admin →
   Notifications of your own workspace, and send yourself a booking end to end.

## Local development

`TENANCY=multi APP_URL=http://localhost:3002 ROOT_DOMAIN=localhost:3002`. Subdomains of localhost
resolve in Chrome without DNS changes, so `acme.localhost:3002` works.
