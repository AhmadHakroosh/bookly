# Scheduling model

- **Booking page** (`Admin → Booking page`): each workspace member has a public profile at `/<username>` with a display name, bio and timezone.
- **Availability** (`Admin → Availability`): a schedule holds weekly hours in its own timezone plus date overrides (custom hours or a whole day off). A default Mon–Fri 9–17 schedule is created with the profile.
- **Event types** (`Admin → Event types`): what people can book — duration, slot interval, buffers before/after, minimum notice, booking horizon, max bookings per day, location (built-in video, Google Meet, Zoom, Teams, phone, in person, custom), booking questions, "requires confirmation", hidden (link-only).
- **Bookings** (`Admin → Bookings`): upcoming and past, confirm pending requests, cancel with a reason. Attendees get a manage link (`/booking/<token>`) to cancel, reschedule or download the `.ics`.

## Group sessions (seats)

`Seats per slot` on an event type (default 1) turns it into a group session: the same start time can be booked by several people until it is full. The public page shows "N seats left" once a session has started filling; the API reports the same in `seatsLeft`. Everyone in a session gets the same meeting link, and the host's calendar holds one event for the session with every attendee as a guest; the guest list is updated as people book or cancel, and the event moves to the next attendee if the first one cancels. Sessions at other times block the host like any booking.

## Recurring bookings

Turn on `Recurring bookings` on an event type and choose the frequency (daily, weekly, monthly), the interval and the number of sessions (2–52). An attendee picks the first time and sees the whole series before confirming; dates the host cannot take are skipped and reported. Every occurrence is its own booking (own meeting link, calendar event, reminders and manage link) tied together by a series id, so a single session can be rescheduled or cancelled, and the manage page also offers "cancel all remaining sessions". The confirmation email lists all dates and attaches one `.ics` with every occurrence. A paid series is charged in a single Stripe Checkout (price × sessions); cancelling one occurrence refunds that occurrence's share.

## Waitlist

When a group session is full, its time still shows on the booking page as "Full · join waitlist"; when a day has no free times at all, the page offers a waitlist for that day. People leave a name and email and get a confirmation with a leave link. On a cancellation Bookly emails the first person waiting for that session (one per freed seat) and everyone waiting for that day, with a link straight to the freed time; the spot goes to whoever books first. Hosts see and can remove entries under `Admin → Bookings`.

## Abuse controls

- Public forms (booking, waitlist, routing) accept at most 10 submissions per visitor (IP) per 10 minutes, and every form has a honeypot field.
- `Admin → Settings → Block bookings from` refuses named emails or whole `@domains`.
- In cloud mode the Free plan allows 100 new bookings per month per workspace; API keys get a per-plan request budget (60 / 600 / 1200 per minute). Self-hosted installs have no quotas.

## Buffers

`Buffer before` is the free time an event type needs before each of its bookings, `buffer after` the free time after. They are applied to the candidate slot: a slot is offered only if `[start − before, end + after]` does not overlap any existing booking or external busy block.

## How slots are computed

`src/server/availability/engine.ts` is pure and unit-tested: weekly rules and overrides (schedule timezone) → minus existing bookings padded with the event's buffers → minus external busy time (calendar sync, K2) → minus minimum notice and horizon → grouped by the visitor's calendar day. The public page detects the visitor's timezone and lets them change it.

## Emails

Confirmation to the attendee (with `.ics`, `METHOD:REQUEST`), notification to the host, cancellation to both (`METHOD:CANCEL`), and reminders 24h and 1h before (`booking.reminders` job every 10 minutes with the in-process worker; on serverless call `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` — the repo ships a GitHub Actions schedule (`.github/workflows/reminders.yml`, enable with the `REMINDERS_ENABLED` repository variable) because Vercel's Hobby cron is daily). All go through `@bookly/email` (console / Resend / SMTP).
