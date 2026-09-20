# Host notifications and text reminders

Attendees always get email: confirmation with calendar invite, 24-hour and 1-hour reminders,
cancellation. Hosts choose how they hear about things under **Admin → Notifications**.

## Host pings

Events: someone books, an attendee cancels, an attendee joins the built-in video room, a call
starts in one hour. Channels: email (always available), WhatsApp or SMS via Twilio, and a Slack
incoming webhook. Each host sets their own phone, channel and toggles.

## Attendee joined (built-in video)

Turn it on under Admin → Notifications. Bookly registers a Daily.co webhook for
`participant.joined` pointing at `<APP_URL>/api/webhooks/daily` and stores the HMAC key on the
workspace. The first person to enter a booking's room triggers one ping; the host joining their own
room is ignored by display name, so set your booking-page display name to what you use in the
video room.

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
