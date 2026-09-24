# Zoom

Connect your Zoom account and every booking made through your Bookly page gets its own Zoom
meeting. This guide covers adding the Bookly app to Zoom, what it does, and how to remove it.

## Adding Bookly to your Zoom account

1. Sign in to your Bookly workspace and open **Admin → Conferencing**.
2. Next to **Zoom**, click **Connect**. You are sent to Zoom to sign in and approve the app.
3. Zoom shows what Bookly asks for: creating, viewing and deleting meetings, and reading your
   user profile. Click **Allow**. You are returned to Bookly with Zoom marked **Ready** and the
   connected account's email shown.

Only the person who connects can use the connection; each member of a team workspace connects
their own Zoom account. On the Free plan a member can connect one account (Google, Microsoft or
Zoom); Pro and Team lift that limit.

## Using it

1. Open **Admin → Event types**, edit an event type, and under **Where to meet** add **Zoom**.
   With several locations, the attendee picks one when booking.
2. When someone books, Bookly creates a Zoom meeting on your account for that slot. The join link
   appears in the attendee's confirmation email, in the calendar invitation, on their booking page
   and on the booking in your admin, and in your **Inbox** for the day.
3. Rescheduling a booking updates the Zoom meeting; cancelling it deletes the meeting.

Bookly stores only the meeting id and join link with the booking. Your Zoom tokens are stored
encrypted and are never shown to attendees.

If Zoom ever refuses a request, for example after you change your Zoom password, the Conferencing
page shows the connection as broken with a **Reconnect** button, and new bookings on that event
type fall back to the next location or a note in the email until you reconnect.

## Removing it

Either of these disconnects Bookly from your Zoom account and deletes the stored tokens:

- In Bookly: **Admin → Conferencing → Zoom → Disconnect**.
- In Zoom: go to the [Zoom App Marketplace](https://marketplace.zoom.us/), open **Manage → Added
  Apps**, find Bookly and click **Remove**. Zoom notifies Bookly, which deletes the connection at
  once.

Existing bookings keep their Zoom links; meetings already created in your Zoom account are not
deleted by disconnecting. Future bookings on event types that listed Zoom use their next location,
or a note in the email if Zoom was the only one.

## Support

Email [support@bookly-app.io](mailto:support@bookly-app.io) or use the
[contact page](https://bookly-app.io/contact). Bookly is open source; the integration's code is in
the public repository.
