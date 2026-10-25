# Host notifications and text reminders

Attendees always get email: confirmation with calendar invite, 24-hour and 1-hour reminders,
cancellation. Hosts choose how they hear about things under **Notifications** in your menu at the top right (or ⌘K).

## In Bookly, on the desktop, by email (beta)

Behind the `notifications` feature flag (Console → Flags; a **Beta** badge shows while it is in
beta). Every member gets a bell in the admin header with an unread count and a panel of their
notifications, newest first: click one to open what it is about, **Mark all read**, **Show
earlier** for older ones. Home gains a Notifications card. Notifications are kept 90 days.

What creates one, and the defaults:

| Kind                  | In Bookly | Desktop | Email                         |
| --------------------- | --------- | ------- | ----------------------------- |
| New booking           | on        | on      | on (carries the invite)       |
| Booking request       | on        | on      | on                            |
| Cancellation          | on        | on      | on (carries the cancel .ics)  |
| Guest joined the call | on        | on      | on                            |
| Starting soon (1 h)   | off       | on      | on (the reminder, with brief) |
| Recap ready           | on        | on      | on                            |
| Payment received      | on        | on      | off                           |
| Guest replied         | on        | on      | on (forwards the reply)       |
| Task assigned to you  | on        | on      | off                           |
| Mentioned in a task   | on        | on      | off                           |
| Task overdue          | on        | off     | off                           |
| Team message          | on        | on      | off                           |
| Mentioned in Messages | on        | on      | on                            |
| Hiring team           | on        | on      | on                            |
| Hiring applications   | on        | on      | off                           |

Each member changes these under **Notifications → What you hear about** (your menu at the top right);
the email column also governs the host copies Bookly always sent (booking, cancellation,
reminder, recap). Texts and Slack keep following the switches below it. Desktop, email, texts
and Slack are used only when you are not in Bookly (below).

**Realtime first.** While you have Bookly open (any tab, any device, even in the background),
notifications reach you there and nothing else is sent: no email, no desktop push, no text or
Slack ping. The other channels you chose are the fallback:

- **No Bookly tab open anywhere:** they go out right away, as before.
- **A tab is open:** they wait a short grace period (1 minute for _Guest joined the call_ and
  _Starting soon_, 2 for _Booking request_, 5 for the rest) and go out only if no tab showed
  the notification by then. "Showed" means it arrived while a Bookly tab was on screen, the tab
  came back on screen while it waited, or a background tab raised it as a desktop notification
  (with permission). Reading it or **Mark all read** also cancels them. A tab left open on an
  unattended computer therefore delays the email by the grace period, never longer.
- **Records still go by email:** the host copy of a booking, request or cancellation carries
  the calendar invite or cancellation (`.ics`) for your calendar, so it is sent whenever its
  email switch is on. The same goes for sign-in links, invitations and receipts, and for the
  day-ahead reminder with its briefing (only the hour-before one has a bell notification).

Each notification records which channels it actually used (socket, push, email, text), and
held-back channels survive restarts: a job sends them at the end of the grace period, and the
five-minute housekeeping tick catches any it missed.

**Live updates.** Each admin tab keeps one live connection: a websocket at `/realtime` on the
same address as the admin (Bookly's own socket server, `docs/self-hosting.md`), or, where there
is none or it cannot connect three times in a row, the Server-Sent Events stream
`/admin/notifications/stream`, retrying the socket every five minutes. Both count you as
present, and both carry new notifications, the unread count (marking read in one tab updates
the others) and Messages' counts. A tab catches up from the server whenever it reconnects; if
neither transport gets through, the bell polls the count every minute.

**Desktop notifications.** **Turn on for this browser** asks for permission and, when the install
has Web Push keys, subscribes the browser so notifications arrive with every Bookly tab closed
(the service worker is `/sw.js`, scoped to `/admin`; it caches nothing). While a tab is open,
even hidden, that tab shows them itself and no push is sent. Each browser is listed with a **Remove** button. The admin is
installable as an app (`/admin.webmanifest`, start URL `/admin`); on iPhone and iPad, Web Push
needs Bookly added to the Home Screen first. Notifications carry Bookly's logo as their picture (and a white
silhouette in Android's status bar); the larger "app" icon is chosen by the operating system:
it is the browser's for a website, and Bookly's once Bookly is installed as an app (Chrome or
Edge: the install icon in the address bar, or the menu → Install Bookly).

Web Push keys, once per install (self-hosting): `npx web-push generate-vapid-keys`, then set
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` you). Changing the keys
invalidates every subscription; members turn desktop notifications on again.

Activity log entries: `notifications.kinds_updated`, `notifications.device_added`,
`notifications.device_removed` (reading and marking read are personal state, not logged).

## Host pings

Events: someone books, an attendee cancels, an attendee joins the Bookly video room, a call
starts in one hour. With the `notifications` flag on, texts and Slack pings follow the same
realtime-first rule as email: only when you have no Bookly tab open, or after the grace period
if no tab showed it. Channels: email (always available), WhatsApp or SMS via Meta, Sent.dm or Twilio, and a Slack
incoming webhook. Each host sets their own phone, channel and toggles.

Texts go only to a verified number: after saving a phone and a channel, the host presses
**Send code**, a six-digit code arrives over that channel (valid 10 minutes, 5 wrong guesses,
3 codes per 10 minutes), and **Confirm** marks the number verified. Changing the number resets
that. **Send a test message** posts a line to the saved Slack webhook and reports Slack's answer.

## Attendee joined (Bookly video)

On by default; owners can mute it for the workspace under Admin → Settings → General
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

- **Sent.dm** (`SENTDM_API_KEY`): one key for SMS and WhatsApp. Sent.dm connects your own
  WhatsApp Business Account (Channels → WhatsApp) or supplies senders, and does the carrier
  registration on its side. It blocks free text on both channels, so each message kind needs a
  Sent.dm template whose id goes in `SENTDM_TEMPLATE_CONFIRMATION`, `_REMINDER`, `_CANCELLED`,
  `_HOST_PING` and `_VERIFY`. Bookly reads each template's declared variables once and fills
  them by name: `attendee`, `event`, `host`, `when` and `text` take the body values, `link`
  (or `url`) takes the whole short link, `token` takes just its suffix for a dynamic URL
  button, and `code` the verification code; any other name is filled positionally. That fits
  a Meta template imported as is (Templates → Import from Meta) and the recommended
  hand-made shape: a per-channel body, SMS with an inline `link` variable and WhatsApp with a
  "View booking" URL button on `https://<platform host>/b/{{token}}` (`/h/{{token}}` for the
  host ping), both under one id. The code template must be an Authentication template with
  Sent.dm's OTP copy-code button; its second, unnamed variable is filled with the code too. A
  kind without an id is sent as plain text. `SENTDM_SANDBOX=true` dry-runs every request
  (validated, nothing delivered), useful on staging. Requests go to
  `https://api.sent.dm/v3/messages` with the channel as an ordered list; Bookly sends one
  channel per call so its own fallback order (SMS, then WhatsApp for attendee texts) stays in
  charge.
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
header (Admin → Settings → Branding: an uploaded logo or a logo URL, and the accent colour, on Pro, Team and self-hosted installs; the Free plan keeps the Bookly mark), your accent colour on
buttons, the booking details in a card, and a plain-text alternative generated from the same
template. "Powered by Bookly" appears in the footer unless the plan removes branding. The same logo, colour and footer rule applies to the booking pages themselves.

Under Admin → Settings → Emails you can replace the opening words of the confirmation,
reminder and cancellation emails; the details block, buttons and branding are always added.
Placeholders: `{name}` `{host}` `{event}` `{when}` `{where}` `{duration}` `{bookingUrl}`
`{workspace}`, plus `{relative}` in reminders ("tomorrow", "in 1 hour"). Blank fields keep
the defaults, and each template has a Preview link that renders it with sample data. The
follow-up after a meeting is set per event type; proposals and payment requests have their own
templates on the same page.

The live stream also carries Messages' unread count and newest activity (`event: messages`),
so the sidebar count and an open Messages page update without a reload (`docs/messages.md`).
