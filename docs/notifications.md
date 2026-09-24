# Host notifications and text reminders

Attendees always get email: confirmation with calendar invite, 24-hour and 1-hour reminders,
cancellation. Hosts choose how they hear about things under **Admin → Notifications**.

## Host pings

Events: someone books, an attendee cancels, an attendee joins the Bookly video room, a call
starts in one hour. Channels: email (always available), WhatsApp or SMS via Twilio, and a Slack
incoming webhook. Each host sets their own phone, channel and toggles.

## Attendee joined (Bookly video)

On by default; owners can mute it for the workspace under Admin → Notifications
(`settings.daily.joinPings`). The first attendee to enter a booking's room triggers one ping. The
host is recognised because the meeting page gives signed-in workspace members a Daily owner
token (`owner: true` on the `participant.joined` event); a host who opens the raw room link
elsewhere is still matched by display name as a fallback. The Daily webhook itself is registered
once for the whole install (`docs/integrations.md` → Daily.co), not per workspace.

## Text messages (Twilio)

Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_SMS` (an E.164 number you own),
`TWILIO_FROM_WHATSAPP` (the sandbox number `+14155238886` for testing, or your approved WhatsApp
sender). Either sender may be omitted; the admin shows which channels are available.

- **Hosts** receive texts on the channel they pick.
- **Attendees** receive text reminders only for event types with "Text reminders" enabled and only
  when they typed a phone number. Bookly tries SMS first and falls back to WhatsApp.

WhatsApp business messaging needs an approved sender and, outside a 24-hour conversation window, an
approved message template. The sandbox is enough to test; production needs the Twilio WhatsApp
onboarding.

## Who the guest sees as the sender

Every email to a guest is sent from the verified platform address in `EMAIL_FROM` (so SPF and
DKIM hold), but with the host's name in the sender line, `"Ahmad Hakroosh via Bookly"
<noreply@example.com>`, and the host's own address as Reply-To. Replies go straight to the
host. Applies to confirmations, reminders, cancellations, follow-ups, proposals, payment
requests and client recaps. The platform name comes from the display name in `EMAIL_FROM`.

## Look and wording

Emails are rendered with React Email in the workspace's look: your logo and name in the
header (Admin → Settings → Branding: logo URL and accent colour, on Pro, Team and self-hosted installs; the Free plan keeps the Bookly mark), your accent colour on
buttons, the booking details in a card, and a plain-text alternative generated from the same
template. "Powered by Bookly" appears in the footer unless the plan removes branding. The same logo, colour and footer rule applies to the booking pages themselves.

Under Admin → Settings → Guest emails you can replace the opening words of the confirmation,
reminder and cancellation emails; the details block, buttons and branding are always added.
Placeholders: `{name}` `{host}` `{event}` `{when}` `{where}` `{duration}` `{bookingUrl}`
`{workspace}`, plus `{relative}` in reminders ("tomorrow", "in 1 hour"). Blank fields keep
the defaults, and each template has a Preview link that renders it with sample data. The
follow-up after a meeting is set per event type; proposals and payment requests have their own
templates on the same page.
