# Teams, round-robin and workflows

## Team members

**Admin → Team** lists everyone in the workspace. Owners and admins invite by email; the invitee
gets a link to `/accept-invitation/<id>`, creates an account (sign-up is otherwise closed in
single-tenant mode) and lands on their booking-page setup. Roles: **owner** (one per workspace),
**admin** (manages everything), **member** (own booking page, availability, event types and
bookings).

## The activity log

Every change in a workspace is recorded: who did it (a member, a guest through a booking link,
an API key, an integration or Bookly itself), what (the action, in plain words), on which
booking, contact, event type or setting, and which fields changed, with the time, the request
id and the client address. Owners and admins read it under **Admin → Settings → Data →
Activity**, newest first, with filters by person, action, target and date, and a "Show earlier"
button that loads the next page without reloading the ones you have. Pro and Team can download
the filtered log as CSV.

How long it is kept depends on the plan: 90 days on Free, a year on Pro, two years on Team,
forever when self-hosted. Deleting the workspace keeps its log for that window. Sign-ins are
recorded too, so "who was in here on Tuesday?" has an answer.

## Team event types

On an event type, **Who hosts** offers three modes:

| Mode        | Slots offered when                                                   | Booking goes to                                             |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Just me     | the owner is free                                                    | the owner                                                   |
| Round robin | any selected host is free (each host's own schedule)                 | the free host with the fewest upcoming bookings             |
| Collective  | every selected host is free (owner's schedule, everyone's busy time) | the owner's calendar; other hosts appear in the emails only |

The public URL stays under the owner's username. Calendar events and meeting links are created
for the host who takes the booking, using that host's connected integrations.

## Reminders and follow-ups

Per event type: **Remind attendees (minutes before)**, e.g. `1440, 60`. Attendees and the host get
an email at each offset; hosts additionally get their configured pings for the one-hour mark. Text
reminders (SMS/WhatsApp) go to attendees who left a phone number when the event type enables them.

**Follow-up email** sends a message from your template a configurable number of hours after the
meeting ends, unless the booking was cancelled or marked no-show. Placeholders: `{name}` (first
name), `{host}`, `{event}`, `{bookingUrl}`. Replies go to the host.

## No-shows

Under **Admin → Bookings → Past**, mark a booking as **No-show** (or undo it). No-shows skip the
follow-up email and count in the public API as `status: "no_show"`.

## Booking questions

The event type form has a visual question builder: label, answer type (short text, long text,
email, phone, choice), required flag, choices for choice questions, and ordering. The API still
accepts the older one-line-per-question text format for imports.
