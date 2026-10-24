# Messaging, site map and launches

## Positioning

**For** people and teams whose work moves through conversations — selling their time to clients,
or selecting people for jobs, cohorts and programs — **Bookly is** a connected workspace for
people, conversations and progress **that** runs the before, during and after of every meeting:
booking or application, briefing, the call with consent-based notes, recap, follow-up, decision
and payment. **Unlike** scheduling tools that stop at the invite, or applicant trackers built
around forms, Bookly keeps the person, the conversation and the next step in one place, with an
open-source core you can run yourself.

## Message house

Roof: **People. Conversations. Progress.**

| Pillar                                | Client work proof                                                            | Hiring proof                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Arrive prepared**                   | Briefing before each call: who, last time, what they asked when booking      | Candidate pane: application, documents, prior reviews (after you submit yours)    |
| **The call ends. The context stays.** | Capture with consent, recap with decisions and action items, quote-backed    | Interview notes and recap attached to the application; structured review          |
| **Keep things moving**                | Follow-up drafted, proposal and payment request, Home shows who waits on you | Review reminders, decision meetings, batch decisions, candidate messages          |
| **Yours to own**                      | Export, retention, custom domain, your branding; open-source core, self-host | Candidate notices, retention per opportunity, access limited to the assigned team |
| **Fair by design** (hiring)           | —                                                                            | Independent reviews, AI summarises and people decide, candidate transparency      |

## Taglines and headlines (from canon and the concepts)

- Brand: "People. Conversations. Progress."
- Descriptor: "A connected workspace for people, conversations and progress."
- Client work hero: "A booking starts it. Bookly keeps it moving."
- Product page: "One client. Every step connected."
- Solutions: "Built around the way you work."
- Capture: "The call ends. The context stays."
- Pricing: "Start free. Grow with your work."
- Trust: "Your relationships. Your data. Your choice."
- Resources: "Make Bookly your own."
- Closing CTA: "Your next booking could be the start of something."
- Hiring hero (decided 2026-10-24): **"Every applicant heard. Every decision clear."** Typeset
  like the client-work hero: first sentence Ink, second in Bookly Orange. Proof it must stay
  true to: every application gets a reply and a status page (heard), independent reviews and a
  named decision-maker with a reason on record (clear). Supporting lines to test under it:
  "Select people, not paperwork." / "From application to cohort, in one place."
- The current `SITE.tagline` "The meeting is booked. Bookly handles the rest." retires with v2.

## Site map v2 (from `marketing ui.png`)

1. Home — hero, five-step journey strip (Booked, Prepared, Met, Followed up, Paid), interactive
   demo with sample data, "Works with your tools" (Google Calendar, Outlook, Zoom, Stripe,
   HubSpot), three proof cards, closing CTA. Add a solution switch: Client work | Hiring.
2. Product — feature list per moment with live-looking UI.
3. Solutions — Consultants, Coaches, Agencies, Teams; **Hiring**: Jobs, Cohorts & fellowships,
   Programs & admissions, Volunteers & grants.
4. Pricing — Free, Pro, Team (+ Enterprise row, + self-host free core).
5. Trust & ownership — consent, retention, export, optional AI, hosted or self-hosted; for
   hiring add fairness and candidate rights.
6. Resources — docs, getting started, API reference, self-hosting, changelog.
7. Open core page (new) — what is AGPL, what is commercial and why, link to source.

## Open-core wording (agree with `bookly-legal-licensing`)

- Say: "Open-source core under AGPL-3.0. Run it yourself, or let us run it for you."
- Say: "Enterprise modules are source-available: every line that runs is published."
- Don't say: "Bookly is open source" (unqualified), "every feature is open source", "free
  forever with every feature" for v2 commercial modules.

## Launch checklist

- [ ] Feature is GA (flag on for everyone) and in `CHANGELOG.md` under a released version.
- [ ] Docs page live (`/docs/<slug>`), screenshots in 02 identity.
- [ ] Landing/solution page section updated; OG image for the announcement.
- [ ] Announcement post, email to users (lifecycle segment), social thread, changelog link.
- [ ] Community: GitHub release notes; for major launches, Show HN (lead with the self-host
      and open-core story and technical depth, answer every comment) and Product Hunt (launch
      Tuesday–Thursday, maker comment, demo video under 90 seconds).
- [ ] Sales enablement: one-pager and demo script updated (`bookly-sales-success`).
- [ ] Claims reviewed: licensing, privacy, AI, hiring fairness.
