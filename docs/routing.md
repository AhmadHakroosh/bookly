# Routing forms

A routing form (`Admin → Availability → Routing`, the Routing tab of Availability & routing) asks visitors a few questions and sends each of them to the right place. It lives at `/r/<slug>` on your booking host and is a good front door when you offer several services or have several hosts.

- **Questions** use the same builder as event-type questions (short text, long text, email, phone, choice). With the `forms_v2` flag they are a full form instead: more question types, questions shown only for some answers, consent and file uploads; rules can use every question that is not a file. See [Forms](forms.md). Name and email are always asked and are handed over to the booking page so the visitor does not type them twice.
- **Rules** are checked top to bottom. A rule holds when _all_ (or _any_) of its conditions are true: a question _is_ / _is not_ / _contains_ a value, or _is answered_. The first matching rule decides the destination.
- **Destinations**: book an event type (the visitor lands on its booking page), open a link (an external URL, say a partner's form), or show a message ("We don't serve that region yet").
- **Otherwise** is the fallback when no rule matches. Without one, the visitor sees a polite error.

Forms can be switched off without deleting them. Embed the form's URL wherever you would have linked a booking page.
