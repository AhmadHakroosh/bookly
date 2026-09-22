# Calendar & conferencing integrations

Bookly hosts connect their own accounts from **Admin → Calendars** and **Admin → Conferencing**.
The server admin registers the OAuth apps once and puts the keys in the environment; a provider
without keys shows as "Not set up on this server".

| Provider  | Gives you                                                              | Env                                                                                    |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Google    | Calendar conflicts, bookings in Google Calendar, **Google Meet** links | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                             |
| Microsoft | Outlook conflicts, bookings in Outlook, **Teams** links                | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`                   |
| Zoom      | Zoom meetings                                                          | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`                                                 |
| Daily.co  | **Bookly video** rooms, no account needed by hosts or attendees        | `DAILY_API_KEY`, `DAILY_DOMAIN`, optional `MEET_URL`                                   |
| Recall.ai | **Notetaker**: auto-capture on Google Meet, Teams and Zoom calls       | `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET`, optional `RECALL_BOT_NAME` |

Redirect URI for every OAuth provider: `<APP_URL>/api/integrations/<provider>/callback`.

## How bookings use them

1. When a booking is **confirmed** (immediately, or when the host approves a pending one) Bookly
   creates the meeting for the event type's location: Zoom meeting, Daily room, or a Google /
   Outlook calendar event with a Meet / Teams link.
2. The booking is then added to every other connected calendar (the "Add new bookings to" calendar).
3. Cancelling or rescheduling deletes the meeting and the calendar events.
4. Availability subtracts busy time from the calendars ticked under "Check for conflicts in".
   Results are cached for one minute.

Everything is best-effort. If a provider fails, the booking still goes through: Bookly tries
Bookly video next, then leaves the location as the event type's text. A permanently broken
connection (revoked token) is marked in the admin and the host gets one email asking to reconnect.

Tokens are stored encrypted (AES-256-GCM, key derived from `AUTH_SECRET`). Changing `AUTH_SECRET`
invalidates all connections.

## Google

1. Google Cloud Console → APIs & Services → **Enable** "Google Calendar API".
2. OAuth consent screen: External, add scopes `calendar.readonly`, `calendar.events`, `email`,
   `openid`. While the app is in "Testing", add your Google account as a test user (tokens then
   expire after 7 days; publish the app to remove that limit).
3. Credentials → Create OAuth client ID → Web application. Authorized redirect URI:
   `https://<your-host>/api/integrations/google/callback` (and the localhost one for dev).
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Meet links are created through the Calendar API (`conferenceData`), so Google Meet works for any
Google account that can create Meet calls from Calendar. Google also emails the attendee a
normal calendar invitation (`sendUpdates=all`), in addition to Bookly's confirmation email.

## Microsoft (Outlook + Teams)

1. Entra admin center → App registrations → New registration. Supported account types: "Accounts
   in any organizational directory and personal Microsoft accounts" (matches `MICROSOFT_TENANT=common`).
2. Redirect URI (Web): `https://<your-host>/api/integrations/microsoft/callback`.
3. Certificates & secrets → new client secret → `MICROSOFT_CLIENT_SECRET`. Application (client) ID
   → `MICROSOFT_CLIENT_ID`.
4. API permissions (delegated): `Calendars.ReadWrite`, `OnlineMeetings.ReadWrite`, `User.Read`,
   `offline_access`, `openid`, `email`.

Teams links come from creating the Outlook event with `isOnlineMeeting`; personal Microsoft
accounts get Skype/Teams-for-personal links.

## Push notifications (instant conflict updates)

Busy time from connected calendars is cached for 60 seconds. When `APP_URL` is a public HTTPS address, Bookly also subscribes to changes on every conflict calendar (Google watch channels, Microsoft Graph subscriptions) so an event added or removed in the calendar drops the cache immediately. Channels are opened when a calendar is connected or its conflict calendars change, renewed by the `calendar.sync` job (every 6 hours; the cron tick does the same on serverless) and closed on disconnect. The endpoints are `/api/webhooks/calendar/google` and `/api/webhooks/calendar/microsoft`; each notification carries a per-channel secret that is checked before anything happens. Local `http://` servers skip this and rely on the 60-second cache.

## Zoom

1. Zoom App Marketplace → Develop → Build App → **OAuth** (user-managed).
2. Redirect URL and allow list: `https://<your-host>/api/integrations/zoom/callback`.
3. Scopes: `meeting:write`, `meeting:read`, `user:read` (granular: `meeting:write:meeting`,
   `meeting:delete:meeting`, `user:read:user`).
4. Set `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`.

## Daily.co (Bookly video)

1. Create a Daily account; note your domain (`something.daily.co`) and create an API key.
2. Set `DAILY_API_KEY` and `DAILY_DOMAIN=something.daily.co`.
3. Optional: serve meeting pages from their own host, e.g. `MEET_URL=https://meet.example.com`.
   Point that host at the same deployment (add it as a domain in Vercel / your reverse proxy);
   the proxy rewrites `meet.example.com/<room>` to `/meet/<room>`.

Rooms are public, named after the booking, can be opened any time and expire two hours after
the end. The `/meet/<room>` page shows the meeting title and embeds Daily Prebuilt with chat, emoji
reactions, hand raising, picture-in-picture, background effects and noise cancellation enabled.
Background effects need a browser with insertable-streams support (Chrome, Edge, recent Safari).

## Notetaker (Recall.ai): capture on Meet, Teams and Zoom

Bookly is not inside a Google Meet, Teams or Zoom call, so auto-capture on those providers uses a
notetaker bot. When a booking on such a call has capture on (event type set to _Always_, or _Ask_
and the attendee agreed), Bookly books a Recall.ai bot for the meeting link one minute before the
start. The bot joins as a participant named `RECALL_BOT_NAME` ("Bookly Notetaker"), streams every
finished utterance to `/api/webhooks/recall/transcript` while the call runs, and when it leaves,
Bookly downloads the full transcript, merges it with the live lines and runs the same recap as
Bookly video. The confirmation email says a notetaker joins; hosts admit it from the waiting room
or Teams lobby when their meeting has one (Zoom without a waiting room lets it straight in).

1. Create a Recall.ai account in the region you want data to stay in (`RECALL_REGION`:
   `us-west-2`, `us-east-1`, `eu-central-1` or `ap-northeast-1`) and copy the API key into
   `RECALL_API_KEY`.
2. Dashboard → Webhooks → add `https://<your-host>/api/webhooks/recall`, and put its signing
   secret (`whsec_…`) in `RECALL_WEBHOOK_SECRET`. Bot status events drive the capture: recording
   opens the transcript, `done` triggers the download and recap, `fatal` or a denied recording
   marks the capture failed.
3. Nothing to do in Zoom, Google or Microsoft: the bot joins like any guest.

Budget and plan rules are the same as Bookly video: the bot is not booked when the workspace's
minutes are used up, is sent away if they run out before it starts recording, and its recording
is capped at the remaining minutes. Cancelling or rescheduling a booking cancels the bot. Without
`RECALL_API_KEY` the auto-capture setting is only offered on Bookly video event types.

## Local development

Use `APP_URL=http://localhost:3002` and register the localhost redirect URIs in each provider.
Google and Microsoft accept `http://localhost` redirects; Zoom requires HTTPS, so use a tunnel
(e.g. `cloudflared tunnel --url http://localhost:3002`) and set `APP_URL` to the tunnel URL.
