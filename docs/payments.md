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

## Local testing

`stripe listen --forward-to localhost:3002/api/webhooks/stripe` prints a webhook secret for
`STRIPE_WEBHOOK_SECRET`. Use card `4242 4242 4242 4242`.
