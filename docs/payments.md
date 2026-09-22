# Paid bookings (Stripe)

Set a price on an event type (Admin → Event types → Price / Currency). With Stripe configured,
booking that event type goes: pick a slot → fill the form → **Stripe Checkout** → confirmation.
The slot is held for 30 minutes while the visitor pays; unpaid bookings are released by the
cron tick / worker (`expireUnpaidBookings`) and never send emails or calendar invites.

Cancelling a paid booking (by the host, the attendee, or through the API) refunds the payment in
full through Stripe. Partial refunds and no-refund windows are not implemented yet.

## Setup

1. Stripe Dashboard → Developers → API keys → `STRIPE_SECRET_KEY` (use the test key first).
2. Developers → Webhooks → Add endpoint `https://<your-host>/api/webhooks/stripe`, events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the signing
   secret into `STRIPE_WEBHOOK_SECRET`.
3. Redeploy. The event type form now shows a working price field; the public page shows the price
   and the button reads "Continue to payment".

Without `STRIPE_SECRET_KEY`, prices are ignored and every booking is free, so a self-hoster can
run without Stripe. Bookings created through the public API behave the same way; a paid one comes
back with `status: "awaiting_payment"` and needs the attendee to pay through `manageUrl`.

## Cloud mode: hosts get paid, not the platform

With `TENANCY=multi` the platform's key is used only for plan subscriptions. Money from a host's
paid bookings and payment requests must reach the host, so each workspace connects its **own**
Stripe account through Stripe Connect (Express onboarding, hosted by Stripe):

1. Admin → Settings → Payments → **Connect Stripe** (Pro and Team; owners and admins). Stripe
   collects the business and payout details; Bookly stores only the account id and the flags
   Stripe reports (`charges_enabled`, `payouts_enabled`, `details_submitted`).
2. Once Stripe enables charges, prices on event types apply. Until then, and on Free, prices are
   ignored and the event type form says why.
3. Checkouts run on the host's account (direct charges) with an `application_fee_amount` for the
   platform; Stripe pays the host out on their own schedule. Refunds come out of the host's
   balance and return the platform fee.

Operator setup, on top of the keys above:

- Stripe Dashboard → Connect → get started with Express accounts, and set the platform's name
  and icon (hosts see them during onboarding).
- Developers → Webhooks → **Add endpoint**, choose _Listen to events on Connected accounts_,
  URL `https://<platform host>/api/webhooks/stripe/connect`, events
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`.
  Its signing secret goes into `STRIPE_CONNECT_WEBHOOK_SECRET`.
- Console → Payments shows what the keys enable, the connected hosts and their status, lets you
  disconnect one, and sets the **platform fee** (percentage of every payment; per-workspace
  override on the workspace page). Fee changes are audited.

Self-hosted installs keep the direct mode: the operator is the host, so one account is right.

## Local testing

`stripe listen --forward-to localhost:3002/api/webhooks/stripe` prints a webhook secret for
`STRIPE_WEBHOOK_SECRET`. Use card `4242 4242 4242 4242`.
