# v2 information architecture

Derived from the concepts in `planning/v2/concepts/`. **The binding, screen-by-screen version is
`planning/v2/ux/concept-fidelity.md`** (founder, 2026-10-25); where this summary and that file
differ, that file wins. In short: the client-work sidebar is exactly `app ui.png` (primary items,
a divider, the scheduling items, Settings and Team at the bottom, no group headings); hiring has
its own sidebar as `hiring.png`; a workspace running both switches between them (Clients |
Hiring). The group names in the table below are for this document only and are never shown.

## Global frame

- Left sidebar: logo; workspace switcher (`components/workspace-switcher.tsx`); primary nav;
  secondary nav; account at the bottom (avatar, name, email).
- Top bar: breadcrumb ("Workspace / Home"), search-or-jump (⌘K), notifications bell, Help,
  account menu.
- Page header: title, subtitle (date, context), at most two actions on the right: one outline
  ("View booking page", "View application page") and one primary ("Create ▾", "Add candidate").

## Navigation

| Group      | Item           | Solution    | Today's equivalent                                                          |
| ---------- | -------------- | ----------- | --------------------------------------------------------------------------- |
| Work       | Home           | both        | `/admin` Home                                                               |
|            | Bookings       | client work | `/admin/bookings`                                                           |
|            | Contacts       | client work | `/admin/contacts`                                                           |
|            | Messages       | both        | `/admin/messages` (flag `messages`)                                         |
|            | Tasks          | both        | `/admin/tasks`                                                              |
|            | Files          | both        | `/admin/files`                                                              |
| Hiring     | Overview       | hiring      | to build                                                                    |
|            | Opportunities  | hiring      | to build                                                                    |
|            | Candidates     | hiring      | to build (a lens on contacts)                                               |
|            | Interviews     | hiring      | to build (bookings linked to applications)                                  |
|            | Reviews        | hiring      | to build                                                                    |
| Scheduling | Booking page   | client work | profile + public page                                                       |
|            | Event types    | both        | `/admin/event-types`                                                        |
|            | Availability   | both        | `/admin/availability`                                                       |
|            | Routing        | client work | `/admin/routing`                                                            |
| Workspace  | Settings, Team | both        | `/admin/settings`, `/admin/team`, billing, domains, calendars, conferencing |

Counts on nav items: Messages (unread), Tasks (due), Reviews (owed). Counts that need action use
the warning tone, not brand.

## Screen inventory (concept → v2 screen)

Client work (`app ui.png`, `ui mocks.png`, `mocks.png`):

1. **Home**: greeting + date + "what needs your attention"; today strip (meetings, follow-ups
   due, open tasks); agenda timeline with the next meeting expanded ("Pick up where you left
   off": last decisions, open items) and Join / Open briefing; Your next steps; Recent
   conversations; Keep things moving (stalled proposals, overdue payments, draft follow-up);
   Recap ready card.
2. **Bookings** list (Upcoming, Past, Requests) + detail pane (join, briefing, notes, recap).
3. **Contact workspace**: header, tabs (Overview, Bookings, Messages, Tasks, Files), timeline,
   next actions (create proposal, payment request, follow-up), linked tasks, recent files.
4. **Messages**: list (All, Clients, Team), thread with Email / Internal note composer, client
   context pane.
5. **Tasks**: Mine / All / Completed, list + detail pane with comments and attachments.
6. **Files**: table + preview pane with details and activity.
7. **Public booking**, **Event types**, **Availability & routing**, **Live meeting & recap**,
   **Calendars & conferencing**, **Brand & communications**, **Team & billing**,
   **Workspace settings** (integrations, API, privacy, data retention, danger zone).

Hiring (`hiring.png`):

1. **Opportunity** page: title, status chip (Open/Closed/Draft), cohort + close date; tabs
   Pipeline, Interviews, Review plan, Team; summary counts (applications, interviews this week,
   reviews pending).
2. **Pipeline**: kanban by stage (Applied, In review, Interview, Decision, …) with cards showing
   person, applied date and the next thing (review assigned, 2 of 3 reviews submitted, interview
   time, feedback missing, decision meeting).
3. **Candidate pane**: header with stage selector; tabs Overview, Interviews, Feedback; About;
   Documents; Next interview (Open briefing); Structured review progress (Complete your review);
   Decision status; access notice.
4. **Needs attention** strip: feedback due today, candidates awaiting scheduling.
5. To design (not in concepts): opportunity setup wizard (type → template pipeline → application
   form → review plan → team → publish), public **application page**, candidate **status page**,
   reviewer **scorecard**, **decision meeting** view with batch decisions for cohorts, cohort
   roster after admission.

Website (`marketing ui*.png`): Home, Product, Solutions (Consultants, Coaches, Agencies, Teams;
add Hiring and Programs), Pricing, Trust & ownership, Resources (docs, API, self-hosting,
changelog).
