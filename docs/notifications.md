# Host notifications and text reminders

Attendees always get email: confirmation with calendar invite, 24-hour and 1-hour reminders,
cancellation. Hosts choose how they hear about things under **Admin → Notifications**.

## Host pings

Events: someone books, an attendee cancels, an attendee joins the Bookly video room, a call
starts in one hour. Channels: email (always available), WhatsApp or SMS via Meta, Sent.dm or Twilio, and a Slack
incoming webhook. Each host sets their own phone, channel and toggles.

Texts go only to a verified number: after saving a phone and a channel, the host presses
**Send code**, a six-digit code arrives over that channel (valid 10 minutes, 5 wrong guesses,
3 codes per 10 minutes), and **Confirm** marks the number verified. Changing the number resets
that. **Send a test message** posts a line to the saved Slack webhook and reports Slack's answer.

## Attendee joined (Bookly video)

On by default; owners can mute it for the workspace under Admin → Notifications
(`settings.daily.joinPings`). The first attendee to enter a booking's room triggers one ping. The
host is recognised because the meeting page gives signed-in workspace members a Daily owner
token (`owner: true` on the `participant.joined` event); a host who opens the raw room link
elsewhere is still matched by display name as a fallback. The Daily webhook itself is registered
once for the whole install (`docs/integrations.md` → Daily.co), not per workspace.

## Text messages (Meta, Sent.dm or Twilio)

Texts go through one of three providers. `TEXT_PROVIDER` (`meta` | `sentdm` | `twilio`) forces
one for every channel; unset, Bookly picks per channel: WhatsApp through Meta when its keys are
present, otherwise Sent.dm, otherwise Twilio; SMS through Sent.dm, otherwise Twilio (Meta cannot
send SMS). The admin shows which channels are available, and the operator health page names the
providers in use.

- **Meta (WhatsApp Cloud API)** (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`): WhatsApp
  from a number you registered in WhatsApp Manager, under your own verified business name. The
  token is a permanent system-user token with `whatsapp_business_messaging` and
  `whatsapp_business_management`; the phone number ID is the one WhatsApp Manager shows next to
  the number. WhatsApp only lets a business open a conversation with an approved template, so
  every text Bookly sends carries a structured message beside its plain body and the Meta driver
  picks the template from it. Create these templates (category Utility unless noted, language
  matching `WHATSAPP_TEMPLATE_LANGUAGE`, default `en`), each with one "Visit website" button
  whose dynamic URL is on the platform host:

  | Template               | Body parameters                                                       | Button URL                       |
  | ---------------------- | --------------------------------------------------------------------- | -------------------------------- |
  | `booking_confirmation` | `{{1}}` attendee, `{{2}}` event type, `{{3}}` host, `{{4}}` date/time | `https://<APP_URL host>/b/{{1}}` |
  | `booking_reminder`     | same four                                                             | `https://<APP_URL host>/b/{{1}}` |
  | `booking_cancelled`    | same four                                                             | `https://<APP_URL host>/b/{{1}}` |
  | `host_ping`            | `{{1}}` the ping text                                                 | `https://<APP_URL host>/h/{{1}}` |
  | `phone_verification`   | Meta's Authentication template with the copy-code button              | (built in)                       |

  `/b/<manage token>` redirects a guest to their booking page on the workspace's host and
  `/h/<booking id>` sends a host to the booking in their admin (`/h/admin` opens the admin
  alone), so one template serves every workspace and custom domain. Delivery receipts arrive
  at `/api/webhooks/whatsapp` when the Meta app's webhook points there with
  `WHATSAPP_VERIFY_TOKEN` as the verify token and `WHATSAPP_APP_SECRET` for the signature;
  failed deliveries are logged. Meta charges per conversation; utility templates are the cheap
  kind.

- **Sent.dm** (`SENTDM_API_KEY`): one key for SMS and WhatsApp. Sent.dm owns the sender
  identities and does the US A2P registration and WhatsApp onboarding on its side, so there is
  nothing to verify in Bookly's name. `SENTDM_SANDBOX=true` dry-runs every request (validated,
  nothing delivered), useful on staging. Requests go to `https://api.sent.dm/v3/messages` with
  the channel as an ordered list; Bookly sends one channel per call so its own fallback order
  (SMS, then WhatsApp for attendee texts) stays in charge.
- **Twilio** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_SMS` as an E.164 number
  you own, `TWILIO_FROM_WHATSAPP` as the sandbox number `+14155238886` or your approved sender).
  Either sender may be omitted. WhatsApp business messaging needs an approved sender and, outside
  a 24-hour conversation window, an approved message template; the sandbox is enough to test,
  production needs Twilio's WhatsApp onboarding and a business profile in the operator's name.

In every case:

- **Hosts** receive texts on the channel they pick, after verifying their number with a code.
- **Attendees** receive a confirmation, reminders and a cancellation notice by text only for
  event types with "Text reminders" enabled and only when they typed a phone number. Bookly
  tries SMS first and falls back to WhatsApp.

Self-hosters can use any of the three; the cloud runs Meta for WhatsApp and Sent.dm for SMS.
Adding another provider means one object in `apps/web/src/server/texting.ts`.

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
