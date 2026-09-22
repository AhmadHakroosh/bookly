# Contacts and the meeting lifecycle

Bookly keeps a **contact** for every person who books, joins a waitlist or fills a routing form: one row per email per workspace, with a name, company, phone, tags, free-form notes, a follow-up date and a **stage** (`lead → active → won → lost`). Everything that happens with that person lands on the contact's **timeline**: bookings and their answers, confirmations, cancellations and reschedules, completed meetings and no-shows, every email Bookly sent, form answers, notes and stage changes.

`Admin → Contacts` lists everyone (search, filter by stage), and each contact page shows the timeline, upcoming meetings and the editable details. Booking rows link to the attendee's contact. A first completed meeting moves a lead to _active_ automatically; the other stages are yours to set.

## The inbox

`Admin` opens on the **Inbox**: today's meetings with their briefings and join links, booking requests to accept (or answer by email instead, which withdraws the request), contacts to follow up (a due follow-up date, or a lead that has been quiet for a week; snooze pushes it out a week), your open tasks with overdue ones flagged, and a note when people are waiting on a waitlist. Members see their own bookings; owners and admins see the workspace.

## Executing the outcome

- **Proposal / Payment request** buttons on a contact page send a templated email (edit the templates under `Admin → Settings`; placeholders `{name} {company} {host} {amount} {payLink}`). A payment request with Stripe configured includes a Checkout link for the amount. Both set a follow-up date so the inbox nudges you if there is no answer.
- **CRM sync** (`Admin → Settings → CRM sync`): with a HubSpot private-app token or a Pipedrive API token, contacts and stage changes are mirrored to the CRM and meeting summaries and sent proposals become notes on the CRM contact. Sync is best-effort and never blocks a booking.
- **Webhooks and API**: `contact.created`, `contact.stage_changed`, `meeting.captured` and `task.created` events, plus `GET/POST /api/v1/contacts` and `GET /api/v1/tasks`, let any other tool react to what happens in Bookly.

## Pre-meeting briefing

Every upcoming booking has a **briefing** for the host: who the person is, what happened before (last meeting, open threads, no-shows), what they asked for in the booking questions, and what to prepare. Open it from `Admin → Bookings → Brief` or from the contact page; it is also included in the host's reminder email closest to the meeting.

With `ANTHROPIC_API_KEY` set (model via `ASSISTANT_MODEL`, default `claude-sonnet-5`) the briefing is written by the assistant from the contact's timeline. Without a key it is a plain, deterministic summary of the same facts, so nothing depends on the model. Briefs are cached for a day and can be regenerated.

## Auto-capture (Bookly video)

Event types on Bookly video can transcribe the call: set **Auto-capture** to _Ask the attendee when booking_ (a checkbox on the booking form) or _Always_ (stated in the confirmation email). Both sides see a notice in the call. Transcription starts by itself once you and the attendee are both in the room, Daily transcribes with speaker labels (the meeting page also streams the live lines to Bookly so speakers are named), and when the call ends you get a "Transcript ready" email. When the assistant is configured, the transcript becomes a **recap** on the booking page: summary, whether the call covered what the client asked for when booking, decisions and action items for both sides with the transcript moment they came from, open questions, objections and risks, a next step, a stage suggestion and a follow-up draft. Every item is one click: create the selected tasks, move the stage, send the follow-up. New recaps show under "Recaps to review" in the inbox and arrive by email with the highlights. Open action items carry over into the next session's briefing. A **recap for the attendee** (neutral summary, decisions, who does what by when) can be edited and sent from the same page; untick action items you would rather keep internal. Attendees see on their manage page that the call is transcribed and can delete the transcript themselves. Without the assistant, the transcript can still be read, deleted, or used as the source for manual capture.

In cloud mode auto-capture is a Pro feature with a monthly budget of transcribed minutes (Pro 300 per workspace; Team 300 per member, pooled across the workspace); the budget shows under Billing, and transcription simply does not start once it is used up. Transcripts are deleted after the retention period (90 days by default; `settings.capture.retentionDays`), summaries and tasks stay. Needs a paid Daily plan; transcription is billed by Daily per participant minute.

## After the meeting: capture

On a booking's page (`Admin → Bookings → Notes`), paste your notes or a transcript and press **Capture**. With the assistant configured it extracts a summary, decisions, action items with due dates (yours and theirs), a next step, a stage suggestion and a follow-up email draft; without it, your notes become the summary and every line starting with `- ` becomes a task. Tasks live on the booking and the contact, can be completed or removed, and an overdue task is nudged once by email (and text, if enabled). A clear outcome moves the contact's stage (won / lost / active). The follow-up draft can be edited and sent from Bookly with your address as reply-to; it lands on the timeline like every other email.

## Proposals and payment requests

From a contact's page, **Proposal** and **Payment request** open a form prefilled from the
workspace templates (Settings → Proposal and payment emails) with the placeholders filled in.
Edit freely, then **Preview email** shows the exact branded message the contact will receive,
with the recipient and subject; nothing is sent until you confirm. A payment request creates a
Stripe Checkout link for the amount when you send, and the email carries a Pay button. Every
send lands on the contact's timeline and sets a follow-up date.
