# Messages

Conversations with your clients and between your team, behind the `messages` feature flag
(Console → Flags; a **Beta** badge shows while it is in beta). **Admin → Messages** lists them
newest first, with the unread count in the sidebar and on Home.

## A conversation per client

Every contact has one conversation, and every member sees it. It holds what the client sees,
plus what stays inside:

- **Emails in and out**: everything on the contact's timeline that was an email: the emails
  you write from Messages, replies from the timeline, follow-ups, proposals, payment requests,
  confirmations, and the client's own replies (with guest replies on, `docs/contacts.md`).
- **What they wrote when booking**: the notes from the booking page.
- **Internal notes** (Team plan): for the team only, never sent. Type `@` to mention a
  teammate; they get a notification.

**Write to the client** sends an email from you with the same signed Reply-To as a timeline
reply, so their answer comes back into the conversation (and onto the timeline). Leave the
subject empty to answer their latest email in the same thread; give a subject to start a new
one. Files can go with it from the drive, as attachments up to 10 MB and as 7-day links after
that (`docs/files.md`). If guest replies are off, the email still goes out and their reply
reaches your own inbox instead.

A conversation starts by itself with the first email; **New message → A client** or **Open in
Messages** on a contact's page opens one for anyone. Automatic emails (confirmations,
reminders) move a conversation up the list but never make it unread; a client's email, or a
teammate's email or note, does.

## Team threads

**New message → Team thread** (Team plan) starts a thread between members: a subject, the
people in it, and optionally the contact it is about. Only the people in a thread see it; anyone
`@`-mentioned joins it, and **Add people** brings more in. Everyone in the thread is notified of
new messages (**Team message** on the Notifications page; mentions are **Mentioned in
Messages**). Files attached to a message can be opened by everyone in the thread.

## Inbox, unread and closing

- **Inbox**: open conversations and threads. **Unread**: someone else wrote since you last
  opened it. **Clients** and **Team** filter by kind. **Closed**: what was closed.
- Opening a conversation marks it read for you only.
- **Close thread** takes it out of the inbox; a client writing again reopens it.
- Search finds conversations by the contact's name or email and threads by subject.
- With notifications on, the sidebar count and an open Messages page update live (the same
  stream as the bell, `docs/notifications.md`).

## Plans

| What                                   | Free | Pro | Team | Self-hosted |
| -------------------------------------- | ---- | --- | ---- | ----------- |
| Client conversations (`guestMessages`) | –    | ✓   | ✓    | ✓           |
| Team threads and internal notes        | –    | –   | ✓    | ✓           |
| Files on messages (`attachments`)      | –    | ✓   | ✓    | ✓           |

Gates are checked on the server. Every write (opening a conversation, sending, notes, team
messages, people added, closing and reopening) is in the activity log; read marks are not.
Conversations, notes and team threads are part of the workspace export; the emails themselves
are on the contacts' timelines. WhatsApp and text messages join the conversation once texting is
reliable; the client's own view of it comes with the guest portal.
