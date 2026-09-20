# Scheduling model

- **Booking page** (`Admin → Booking page`): each workspace member has a public profile at `/<username>` with a display name, bio and timezone.
- **Availability** (`Admin → Availability`): a schedule holds weekly hours in its own timezone plus date overrides (custom hours or a whole day off). A default Mon–Fri 9–17 schedule is created with the profile.
- **Event types** (`Admin → Event types`): what people can book — duration, slot interval, buffers before/after, minimum notice, booking horizon, max bookings per day, location (built-in video, Google Meet, Zoom, Teams, phone, in person, custom), booking questions, "requires confirmation", hidden (link-only).
- **Bookings** (`Admin → Bookings`): upcoming and past, confirm pending requests, cancel with a reason. Attendees get a manage link (`/booking/<token>`) to cancel, reschedule or download the `.ics`.

## Buffers

`Buffer before` is the free time an event type needs before each of its bookings, `buffer after` the free time after. They are applied to the candidate slot: a slot is offered only if `[start − before, end + after]` does not overlap any existing booking or external busy block.

## How slots are computed

`src/server/availability/engine.ts` is pure and unit-tested: weekly rules and overrides (schedule timezone) → minus existing bookings padded with the event's buffers → minus external busy time (calendar sync, K2) → minus minimum notice and horizon → grouped by the visitor's calendar day. The public page detects the visitor's timezone and lets them change it.

## Emails

Confirmation to the attendee (with `.ics`, `METHOD:REQUEST`), notification to the host, cancellation to both (`METHOD:CANCEL`), and reminders 24h and 1h before (`booking.reminders` job every 10 minutes with the in-process worker; on serverless call `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` — the repo ships a GitHub Actions schedule (`.github/workflows/reminders.yml`, enable with the `REMINDERS_ENABLED` repository variable) because Vercel's Hobby cron is daily). All go through `@bookly/email` (console / Resend / SMTP).
