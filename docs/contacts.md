# Contacts and the meeting lifecycle

Bookly keeps a **contact** for every person who books, joins a waitlist or fills a routing form: one row per email per workspace, with a name, company, phone, tags, free-form notes, a follow-up date and a **stage** (`lead → active → won → lost`). Everything that happens with that person lands on the contact's **timeline**: bookings and their answers, confirmations, cancellations and reschedules, completed meetings and no-shows, every email Bookly sent, form answers, notes and stage changes.

`Admin → Contacts` lists everyone (search, filter by stage), and each contact page shows the timeline, upcoming meetings and the editable details. Booking rows link to the attendee's contact. A first completed meeting moves a lead to _active_ automatically; the other stages are yours to set.

## Pre-meeting briefing

Every upcoming booking has a **briefing** for the host: who the person is, what happened before (last meeting, open threads, no-shows), what they asked for in the booking questions, and what to prepare. Open it from `Admin → Bookings → Brief` or from the contact page; it is also included in the host's reminder email closest to the meeting.

With `ANTHROPIC_API_KEY` set (model via `ASSISTANT_MODEL`, default `claude-sonnet-5`) the briefing is written by the assistant from the contact's timeline. Without a key it is a plain, deterministic summary of the same facts, so nothing depends on the model. Briefs are cached for a day and can be regenerated.

## After the meeting: capture

On a booking's page (`Admin → Bookings → Notes`), paste your notes or a transcript and press **Capture**. With the assistant configured it extracts a summary, decisions, action items with due dates (yours and theirs), a next step, a stage suggestion and a follow-up email draft; without it, your notes become the summary and every line starting with `- ` becomes a task. Tasks live on the booking and the contact, can be completed or removed, and an overdue task is nudged once by email (and text, if enabled). A clear outcome moves the contact's stage (won / lost / active). The follow-up draft can be edited and sent from Bookly with your address as reply-to; it lands on the timeline like every other email.
