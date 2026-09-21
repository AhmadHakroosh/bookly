# Cloud mode (multi-tenant SaaS)

Set `TENANCY=multi`. Then:

- **Platform host** = the host of `APP_URL` (e.g. `bookly.app`). It serves the landing page,
  `/pricing`, `/signup`, `/workspaces` (a signed-in user's workspaces), `/login` and the operator
  console at `/console`.
- **Tenants** live at `<slug>.<ROOT_DOMAIN>` and on verified custom domains. Sign-up creates the
  account, then the workspace (organization + workspace + subdomain) and sends the user to its admin.
  Sessions are shared across subdomains (`advanced.crossSubDomainCookies`), so a user signs in once.
- Unknown tenant hosts return 404. The self-host setup wizard is disabled.

## Plans and limits

`packages/cloud` defines Free, Pro and Team (limits, feature gates, display prices). A workspace's
`plan` + `plan_status` decide what applies; `self-hosted` (the default outside cloud mode) means no
limits. Enforcement points: creating event types, inviting members, connecting integrations, adding
custom domains, enabling paid bookings / workflows / team scheduling, the keyed API, and the
"Scheduling by Bookly" footer.

## Billing

Stripe subscriptions, same keys as paid bookings (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`),
plus recurring prices `STRIPE_PRICE_PRO` (per workspace) and `STRIPE_PRICE_TEAM` (per member; the
quantity follows the member count). Admin → Billing shows usage, upgrade buttons (Stripe Checkout)
and the customer portal. The webhook needs `customer.subscription.created|updated|deleted` and
`checkout.session.completed`; `syncSubscription` mirrors the subscription onto the workspace.
A lapsed subscription drops the workspace to Free limits without deleting anything.

## Operator console

`PLATFORM_ADMIN_EMAILS` lists who may open `/console` on the platform host: workspace list with
plan, owner and booking counts, suspend / unsuspend (public pages and the API go offline; the admin
shows a banner), and "sign in as owner" (Better Auth admin impersonation, which lands you in that
workspace's admin). Stop impersonating from the account menu or by signing out.

## Local development

`TENANCY=multi APP_URL=http://localhost:3002 ROOT_DOMAIN=localhost:3002`. Subdomains of localhost
resolve in Chrome without DNS changes, so `acme.localhost:3002` works.
