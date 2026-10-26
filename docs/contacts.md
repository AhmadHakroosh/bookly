# Contacts and the meeting lifecycle

Bookly keeps a **contact** for every person who books, joins a waitlist or fills a routing form: one row per email per workspace, with a name, company, phone, tags, free-form notes, a follow-up date and a **stage** (`lead → active → won → lost`). Everything that happens with that person lands on the contact's **timeline**: bookings and their answers, confirmations, cancellations and reschedules, completed meetings and no-shows, every email Bookly sent, form answers, notes and stage changes.

`Admin → Contacts` lists everyone (search, filter by stage). Each contact page opens with the person (name, company, email, phone) and their stage as a chip you can change in place, then the **client journey**: Booked → Prepared → Met → Followed up → Paid, done steps ticked and the current one highlighted, each linking to the booking, briefing or composer behind it. **Overview · Bookings · Tasks · Files** follow; Overview has the timeline with notes, and on the right **Next actions** (the one the journey points at first), linked tasks, recent files and the editable client details. ⋮ has opting out of emails and the folder. Booking rows link to the attendee's contact. A first completed meeting moves a lead to _active_ automatically; the other stages are yours to set.

### Your own stages

Behind the `pipelines` flag, `Admin → Settings → Pipeline` edits the stages contacts move through. Rename them, change their color, reorder them, add your own (for example _Proposal sent_), choose which stage new contacts start in, and turn on **Priority scheduling** for the stages whose people count as priority contacts (they may book focus blocks and past the weekly budget, see [Scheduling](scheduling.md#priority-aware-availability)). Each stage has a **category**: _open_, _on hold_, _won_ or _lost_. Reports, automations and the classic `stage` value read the category, so renaming or adding stages never breaks them. A stage's key (shown under it, e.g. `proposal-sent`) is fixed when it is created and stays the same across renames; the API and webhooks use it. Archiving a stage that still has people asks where to move them; the entry stage cannot be archived. The contacts list gets a tab per stage, and stage changes on the timeline name the stages (`Stage: Proposal sent → Active`). Without the flag the four classic stages show exactly as before.

### Automations

Behind the `stage_rules` flag, every stage on `Admin → Settings → Pipeline` has **Automations**: _when someone enters (or leaves) this stage_, optionally after a wait of up to 7 days and only for contacts with a given tag, do these things in order:

- **Send an email**, from the automation's author in the contact's conversation, so replies land in Messages. Placeholders: `{name}`, `{company}`, `{stage}`, `{host}`. People who unsubscribed are skipped, unless you mark the email as status, scheduling or payment news.
- **Create tasks** from the stage's checklist (one task per line, with an optional due date), on the contact and assigned to the automation's author.
- **Send a booking link** for one of your event types, with their name and email filled in.
- **Ask to fill in a form** (one of your routing forms).
- **Request a payment** with a Stripe Checkout link (needs payments set up).
- **Move to another stage**, **add a tag**, or **tell owners and admins** in the app.

Automations run in the background right after the move (through the job queue, with a sweep every 5 minutes as the safety net), once per move: moving someone out and back in runs them again, running the sweep twice does not. A delayed automation does nothing if the person has left the stage by then. Each run shows on the contact's timeline ("Automation _Onboard new clients_ ran") and in the activity log as the automation. A failed action is retried after 1, 5, 30, 120 and 720 minutes, then owners and admins are notified; the list on each stage shows how often an automation ran and how many runs failed. An automation that moves people can't move them into its own stage, and a chain of automations moving someone back and forth is stopped after five moves. Free includes 3 active automations on the client pipeline; Pro and Team are unlimited.

## Home

Home greets you and shows what needs your attention, as one page:

- **The day's counts**: meetings today, follow-ups due and open tasks, each a link to its list.
- **Today**: the day as a timeline, each meeting with who it is with, how it happens, how long it
  takes and how many people come, **Join meeting** while it is ahead and **Open briefing** (or
  **Open notes** once it is over). The meeting on now or next is highlighted, with **Pick up where
  you left off** from its briefing. ‹ and › move to other days.
- **Requests** to accept (or answer by email instead, which withdraws the request), the first
  three with a link to the rest.
- **Keep things moving**: contacts to follow up (a due follow-up date, or a lead quiet for a
  week) with **Draft follow-up** and, under ⋯, a snooze for a week.
- On the right, **Your next steps** (your open tasks: tick one off, or add one), **Recent
  conversations** from Messages, and the **Recap ready** card for the latest recap to review.

Members see their own bookings; owners and admins see the workspace. A note says when people are waiting on a waitlist.

## Executing the outcome

- **Create proposal / Send payment request / Add follow-up** under Next actions on a contact page send a templated email (edit the templates under `Admin → Settings → Emails`; placeholders `{name} {company} {host} {amount} {payLink} {bookingUrl}`). A payment request with Stripe configured includes a Checkout link for the amount. All three set the next follow-up date so Home nudges you again; Home's **Draft follow-up** opens the contact with the follow-up composer ready.
- **CRM sync** (`Admin → Settings → Integrations`, Connect on the HubSpot or Pipedrive row): with a HubSpot private-app token or a Pipedrive API token, contacts and stage changes are mirrored to the CRM and meeting summaries and sent proposals become notes on the CRM contact. Sync is best-effort and never blocks a booking.
- **Webhooks and API**: `contact.created`, `contact.stage_changed`, `meeting.captured` and `task.created` events, plus `GET/POST /api/v1/contacts` and `GET /api/v1/tasks`, let any other tool react to what happens in Bookly.

## Pre-meeting briefing

Every upcoming booking has a **briefing** for the host: who the person is, what happened before (last meeting, open threads, no-shows), what they asked for in the booking questions, and what to prepare. Open it from a booking in `Admin → Bookings` (its **Briefing** tab) or from the contact page; it is also included in the host's reminder email closest to the meeting.

With `ANTHROPIC_API_KEY` set (model via `ASSISTANT_MODEL`, default `claude-sonnet-5`) the briefing is written by the assistant from the contact's timeline. Without a key it is a plain, deterministic summary of the same facts, so nothing depends on the model. Briefs are cached for a day and can be regenerated.

## Auto-capture

Event types on Bookly video (except end-to-end encrypted ones, which are peer-to-peer and never transcribed), and on Google Meet, Teams and Zoom when the notetaker is configured (`docs/integrations.md`), can transcribe the call: set **Auto-capture** to _Ask the attendee when booking_ (a checkbox on the booking form) or _Always_ (a notice on the booking form, in the confirmation email and in the calendar invitation; booking is the agreement). Either way the booking stores the consent and when it was given (`capture_consent`, `capture_consent_at`), the notetaker posts a notice in the meeting chat when it joins and to each person who joins later, and everything the assistant writes from the transcript is labeled AI-generated in the admin. Consent law differs by place (all-party consent in several US states and most of Europe); the terms make the host responsible for it. On Bookly video both sides see a notice in the call, transcription starts by itself once you and the attendee are both in the room, and Daily transcribes with speaker labels (the meeting page also streams the live lines to Bookly so speakers are named). Calls are transcribed multilingually by default (Deepgram Nova-3 with `language: "multi"`): people can switch between languages mid-call, every line is tagged with the language it was spoken in, the languages spoken are shown on the booking page, and the recap is written in the language the host spoke most. Deepgram's multilingual mode covers English, Spanish, French, German, Portuguese, Italian, Dutch, Russian, Hindi and Japanese; for a single other language set `settings.capture.language` to its code (e.g. `he`), which transcribes with Nova-2 in that language only. On Meet, Teams and Zoom a notetaker bot joins the call instead, announced in the confirmation email, and streams the transcript to Bookly as people speak. Either way, when the call ends you get a "Transcript ready" email. When the assistant is configured, the transcript becomes a **recap** on the booking page: summary, whether the call covered what the client asked for when booking, decisions and action items for both sides with the transcript moment they came from, open questions, objections and risks, a next step, a stage suggestion and a follow-up draft. Every item is one click: create the selected tasks, move the stage, send the follow-up. New recaps show under "Recaps to review" on Home and arrive by email with the highlights. Open action items carry over into the next session's briefing. A **recap for the attendee** (neutral summary, decisions, who does what by when) can be edited and sent from the same page; untick action items you would rather keep internal. Attendees see on their manage page that the call is transcribed and can delete the transcript themselves. Without the assistant, the transcript can still be read, deleted, or used as the source for manual capture.

In cloud mode auto-capture is a Pro feature with a monthly budget of transcribed minutes (Pro 300 per workspace, 5 hours; Team 480 per member, 8 hours, pooled across the workspace), shown as hours in the UI; the budget shows under Billing. Past it, transcription continues at $3 an hour, billed by the minute, on the next invoice unless the host switches overage off, in which case it does not start once the budget is used up (`docs/cloud.md`). Transcripts are deleted after the retention period (90 days by default; owners and admins pick 30 days, 90 days, 6 months or a year under Settings → Privacy, for calls recorded from then on), summaries and tasks stay. Bookly video needs a paid Daily plan (transcription billed by Daily per participant minute); external calls need a Recall.ai account (billed per bot hour).

## Notes in the call

On Bookly video, a member in the call (signed in, so they join as the room's owner) gets a
**Notes** panel, behind the `meeting_notes` flag and on Pro and up (`meetingNotes`; Bookly video
starts on Pro). Notes are private to whoever wrote them and save themselves as you type. Each
note keeps the moment it was written, so the recap lines it up with what was said then. **Mark
moment** (in the panel and the call's controls, or ⌘/Ctrl+Shift+M, even while typing) drops a
flagged timestamp you can label later.

After the call:

- **The recap reads the notes with the transcript.** The assistant is told which lines are
  yours: it quotes them as your notes in the summary, treats a commitment ("send the proposal by
  Friday") or a marked moment as a strong signal for an action item, and lets your notes win
  where they disagree with the transcript. Each action item says whether it came from **your
  notes**, the **transcript** or **both**, and so does the task it becomes. A call that was not
  transcribed still gets a recap from the notes alone when the assistant is configured.
- **The notes stay on the booking** (**Your notes from the call**), where you can still edit
  them; **Regenerate** on the recap uses the edits.
- **They land on the contact's timeline** as a note, about ten minutes after the meeting ends;
  later edits update that same entry.

Saving the first note is in the activity log (`meeting.notes_started`); the autosaves after it
are not. Notes are part of the workspace export with the booking.

## After the meeting: capture

On a booking's **Notes** tab (open it from `Admin → Bookings`), paste your notes or a transcript and press **Capture**. With the assistant configured it extracts a summary, decisions, action items with due dates (yours and theirs), a next step, a stage suggestion and a follow-up email draft; without it, your notes become the summary and every line starting with `- ` becomes a task. Tasks live on the booking and the contact, can be completed or removed, and an overdue task is nudged once by email (and text, if enabled). With the task board on, they also land on Admin → Tasks ([tasks.md](tasks.md)). A clear outcome moves the contact's stage (won / lost / active). The follow-up draft can be edited and sent from Bookly with your address as reply-to; it lands on the timeline like every other email.

## Proposals, payment requests and follow-ups

From a contact's page, **Create proposal**, **Send payment request** and **Add follow-up** open a form prefilled
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
