# Contacts and the meeting lifecycle

Bookly keeps a **contact** for every person who books, joins a waitlist or fills a routing form: one row per email per workspace, with a name, company, phone, tags, free-form notes, a follow-up date and a **stage** (`lead → active → won → lost`). Everything that happens with that person lands on the contact's **timeline**: bookings and their answers, confirmations, cancellations and reschedules, completed meetings and no-shows, every email Bookly sent, form answers, notes and stage changes.

`Admin → Contacts` lists everyone (search, filter by stage), and each contact page shows the timeline, upcoming meetings and the editable details. Booking rows link to the attendee's contact. A first completed meeting moves a lead to _active_ automatically; the other stages are yours to set.

This is the foundation for briefings before meetings, capture after them and the meeting inbox (see the roadmap in the repository).
