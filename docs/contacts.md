# Contacts and the meeting lifecycle

Bookly keeps a **contact** for every person who books, joins a waitlist or fills a routing form: one row per email per workspace, with a name, company, phone, tags, free-form notes, a follow-up date and a **stage** (`lead → active → won → lost`). Everything that happens with that person lands on the contact's **timeline**: bookings and their answers, confirmations, cancellations and reschedules, completed meetings and no-shows, every email Bookly sent, form answers, notes and stage changes.

`Admin → Contacts` lists everyone (search, filter by stage), and each contact page shows the timeline, upcoming meetings and the editable details. Booking rows link to the attendee's contact. A first completed meeting moves a lead to _active_ automatically; the other stages are yours to set.

## Home

At the top of Home a row of cards sums up the day, each a link to the page that owns it:
**This week** (meetings still to come this week and the next three), **Since your last visit**
(new bookings and cancellations since you last opened Home; reloading within half an hour keeps
the same starting point), **Needs attention** (requests to accept, recaps to review, people to
follow up), **Your tasks** (open, overdue, due today; owners and admins also see the team's
count), **Contacts** (added this week, follow-ups due) and, for owners and admins, **Payments
this month** (paid bookings summed per currency, or a prompt to connect Stripe). Members see
their own meetings; owners and admins see everyone's. Every card loads on its own. The cards
roll out behind the `home_dashboard` flag (a "Beta" badge shows while it is in beta).

`Admin` opens on **Home**: today's meetings with their briefings and join links, booking requests to accept (or answer by email instead, which withdraws the request), contacts to follow up (a due follow-up date, or a lead that has been quiet for a week; snooze pushes it out a week), your open tasks with overdue ones flagged, and a note when people are waiting on a waitlist. Members see their own bookings; owners and admins see the workspace.

## Executing the outcome

- **Proposal / Payment request / Follow-up** buttons on a contact page send a templated email (edit the templates under `Admin → Settings → Emails`; placeholders `{name} {company} {host} {amount} {payLink} {bookingUrl}`). A payment request with Stripe configured includes a Checkout link for the amount. All three set the next follow-up date so Home nudges you again; Home's "Follow up" link opens the contact with the follow-up composer ready.
- **CRM sync** (`Admin → Settings → Integrations → CRM sync`): with a HubSpot private-app token or a Pipedrive API token, contacts and stage changes are mirrored to the CRM and meeting summaries and sent proposals become notes on the CRM contact. Sync is best-effort and never blocks a booking.
- **Webhooks and API**: `contact.created`, `contact.stage_changed`, `meeting.captured` and `task.created` events, plus `GET/POST /api/v1/contacts` and `GET /api/v1/tasks`, let any other tool react to what happens in Bookly.

## Pre-meeting briefing

Every upcoming booking has a **briefing** for the host: who the person is, what happened before (last meeting, open threads, no-shows), what they asked for in the booking questions, and what to prepare. Open it from `Admin → Bookings → Brief` or from the contact page; it is also included in the host's reminder email closest to the meeting.

With `ANTHROPIC_API_KEY` set (model via `ASSISTANT_MODEL`, default `claude-sonnet-5`) the briefing is written by the assistant from the contact's timeline. Without a key it is a plain, deterministic summary of the same facts, so nothing depends on the model. Briefs are cached for a day and can be regenerated.

## Auto-capture

Event types on Bookly video (except end-to-end encrypted ones, which are peer-to-peer and never transcribed), and on Google Meet, Teams and Zoom when the notetaker is configured (`docs/integrations.md`), can transcribe the call: set **Auto-capture** to _Ask the attendee when booking_ (a checkbox on the booking form) or _Always_ (a notice on the booking form, in the confirmation email and in the calendar invitation; booking is the agreement). Either way the booking stores the consent and when it was given (`capture_consent`, `capture_consent_at`), the notetaker posts a notice in the meeting chat when it joins and to each person who joins later, and everything the assistant writes from the transcript is labelled AI-generated in the admin. Consent law differs by place (all-party consent in several US states and most of Europe); the terms make the host responsible for it. On Bookly video both sides see a notice in the call, transcription starts by itself once you and the attendee are both in the room, and Daily transcribes with speaker labels (the meeting page also streams the live lines to Bookly so speakers are named). Calls are transcribed multilingually by default (Deepgram Nova-3 with `language: "multi"`): people can switch between languages mid-call, every line is tagged with the language it was spoken in, the languages spoken are shown on the booking page, and the recap is written in the language the host spoke most. Deepgram's multilingual mode covers English, Spanish, French, German, Portuguese, Italian, Dutch, Russian, Hindi and Japanese; for a single other language set `settings.capture.language` to its code (e.g. `he`), which transcribes with Nova-2 in that language only. On Meet, Teams and Zoom a notetaker bot joins the call instead, announced in the confirmation email, and streams the transcript to Bookly as people speak. Either way, when the call ends you get a "Transcript ready" email. When the assistant is configured, the transcript becomes a **recap** on the booking page: summary, whether the call covered what the client asked for when booking, decisions and action items for both sides with the transcript moment they came from, open questions, objections and risks, a next step, a stage suggestion and a follow-up draft. Every item is one click: create the selected tasks, move the stage, send the follow-up. New recaps show under "Recaps to review" on Home and arrive by email with the highlights. Open action items carry over into the next session's briefing. A **recap for the attendee** (neutral summary, decisions, who does what by when) can be edited and sent from the same page; untick action items you would rather keep internal. Attendees see on their manage page that the call is transcribed and can delete the transcript themselves. Without the assistant, the transcript can still be read, deleted, or used as the source for manual capture.

In cloud mode auto-capture is a Pro feature with a monthly budget of transcribed minutes (Pro 300 per workspace, 5 hours; Team 480 per member, 8 hours, pooled across the workspace), shown as hours in the UI; the budget shows under Billing. Past it, transcription continues at $3 an hour, billed by the minute, on the next invoice unless the host switches overage off, in which case it does not start once the budget is used up (`docs/cloud.md`). Transcripts are deleted after the retention period (90 days by default; `settings.capture.retentionDays`), summaries and tasks stay. Bookly video needs a paid Daily plan (transcription billed by Daily per participant minute); external calls need a Recall.ai account (billed per bot hour).

## After the meeting: capture

On a booking's page (`Admin → Bookings → Notes`), paste your notes or a transcript and press **Capture**. With the assistant configured it extracts a summary, decisions, action items with due dates (yours and theirs), a next step, a stage suggestion and a follow-up email draft; without it, your notes become the summary and every line starting with `- ` becomes a task. Tasks live on the booking and the contact, can be completed or removed, and an overdue task is nudged once by email (and text, if enabled). With the task board on, they also land on Admin → Tasks ([tasks.md](tasks.md)). A clear outcome moves the contact's stage (won / lost / active). The follow-up draft can be edited and sent from Bookly with your address as reply-to; it lands on the timeline like every other email.

## Proposals, payment requests and follow-ups

From a contact's page, **Proposal**, **Payment request** and **Follow-up** open a form prefilled
from the workspace templates (Settings → Proposal, payment and follow-up emails) with the
placeholders filled in; `{bookingUrl}` in a follow-up becomes a link to your booking page.
Edit freely, then **Preview email** shows the exact branded message the contact will receive,
with the recipient and subject; nothing is sent until you confirm. A payment request creates a
Stripe Checkout link for the amount when you send, and the email carries a Pay button. Every
send lands on the contact's timeline and sets a follow-up date.

These are commercial emails from the host, so each one carries the workspace's **postal address**
(Settings → Postal address; set it before sending, CAN-SPAM requires it) and an **unsubscribe**
link, plus `List-Unsubscribe` / `List-Unsubscribe-Post` headers so Gmail and the like show their
own unsubscribe button. A contact who unsubscribes (`contacts.email_opt_out`) is marked on their
page and on Home, the composer refuses to send, and a timeline note records it; a host can
opt them back in on request, or opt someone out who asked in person. Booking confirmations and
reminders are unaffected, the attendee asked for those by booking.

## Timeline v2 and guest replies

Behind the `timeline_v2` feature flag (Console → Flags; **Beta** while it is in beta), a
contact's timeline is grouped by day under date dividers, newest first: bookings, emails sent,
guests' replies, notes, tasks, recaps, payments and stage changes. Meetings link to their
booking, recap and transcript; sent emails show their content in an accordion; a guest's reply
sits under the email it answers, with the host's answers in the same thread. Clicking an entry
opens it in a side pane (`?entry=<id>`): a meeting shows the whole booking, an email its thread
with the quoted text available. The page loads the latest window (about 30 entries, never
splitting a day) and **Show earlier** loads the next; after the first click the following
windows load as you scroll. Pages are keyset-paginated on `(created_at, id)` over the index
`contact_events (contact_id, created_at, id)`, so a contact with years of history costs the same
per page as a new one.

**Guest replies (Pro and up; self-hosted when configured).** Every email Bookly sends a contact
(confirmations, reminders, follow-ups, recaps, proposals, payment requests, timeline replies)
carries a signed Reply-To on the inbound domain, `r-<entry>-<signature>@<INBOUND_EMAIL_DOMAIN>`.
The guest replies as usual; Resend receives it and calls `POST /api/webhooks/resend`
(`email.received`, Svix-signed with `RESEND_WEBHOOK_SECRET`); Bookly fetches the message, cuts
the quoted history ("On … wrote:", `>` lines, Outlook's header block), files it under the email
it answers, clears the contact's follow-up date (they answered), logs `contact.reply_received`,
and notifies whoever sent the email ("Guest replied"). Its email channel forwards the reply with
the guest as Reply-To, so the host still has it in their inbox and can answer from there or from
the timeline (**Reply**, logged as `contact.email_replied`; the email threads in the guest's mail
client). Auto-replies are ignored, a repeated delivery is a no-op, and a forged address fails its
signature. Attachments are kept in the contact's folder (`docs/files.md`). On Free, or when the inbound domain is not set up, replies go to the host's own
address as before. **Settings → Emails → Guest replies** shows where replies go and lets owners
and admins switch it off (`settings.guest_replies.disabled`): new emails then carry the
sender's own address, while replies to emails sent while it was on still reach the timeline
(and are forwarded), so nothing is lost when the setting or the plan changes. Every email on
the timeline is also the contact's conversation in Messages, where the team writes to them and
leaves internal notes (`docs/messages.md`); **Open in Messages** on the contact's page opens it.

Setup (self-hosting): in Resend, add receiving on a subdomain (e.g. `reply.example.com`) and put
its MX record in your DNS (the subdomain keeps your main mail where it is); create a webhook for
`email.received` pointing at `https://<your host>/api/webhooks/resend`; then set
`INBOUND_EMAIL_DOMAIN` and `RESEND_WEBHOOK_SECRET` (and `RESEND_API_KEY`, used to fetch the
message).
