# Calendar & conferencing integrations

Bookly hosts connect their own accounts from **Admin → Calendars** and **Admin → Conferencing**.
The server admin registers the OAuth apps once and puts the keys in the environment; a provider
without keys shows as "Not set up on this server".

| Provider  | Gives you                                                              | Env                                                                  |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Google    | Calendar conflicts, bookings in Google Calendar, **Google Meet** links | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                           |
| Microsoft | Outlook conflicts, bookings in Outlook, **Teams** links                | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT` |
| Zoom      | Zoom meetings                                                          | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`                               |
| Daily.co  | **Built-in video** rooms, no account needed by hosts or attendees      | `DAILY_API_KEY`, `DAILY_DOMAIN`, optional `MEET_URL`                 |

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
built-in video next, then leaves the location as the event type's text. A permanently broken
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

## Zoom

1. Zoom App Marketplace → Develop → Build App → **OAuth** (user-managed).
2. Redirect URL and allow list: `https://<your-host>/api/integrations/zoom/callback`.
3. Scopes: `meeting:write`, `meeting:read`, `user:read` (granular: `meeting:write:meeting`,
   `meeting:delete:meeting`, `user:read:user`).
4. Set `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`.

## Daily.co (built-in video)

1. Create a Daily account; note your domain (`something.daily.co`) and create an API key.
2. Set `DAILY_API_KEY` and `DAILY_DOMAIN=something.daily.co`.
3. Optional: serve meeting pages from their own host, e.g. `MEET_URL=https://meet.example.com`.
   Point that host at the same deployment (add it as a domain in Vercel / your reverse proxy);
   the proxy rewrites `meet.example.com/<room>` to `/meet/<room>`.

Rooms are public, named after the booking, can be opened any time and expire two hours after
the end. The `/meet/<room>` page shows the meeting title and embeds Daily Prebuilt with chat, emoji
reactions, hand raising, picture-in-picture, background effects and noise cancellation enabled.
Background effects need a browser with insertable-streams support (Chrome, Edge, recent Safari).

## Local development

Use `APP_URL=http://localhost:3002` and register the localhost redirect URIs in each provider.
Google and Microsoft accept `http://localhost` redirects; Zoom requires HTTPS, so use a tunnel
(e.g. `cloudflared tunnel --url http://localhost:3002`) and set `APP_URL` to the tunnel URL.
