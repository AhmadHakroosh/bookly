# Hiring use cases

"Hiring" in Bookly means any team selecting people through applications, reviews and
conversations. One model (Opportunity → Application → Stages → Reviews → Interviews → Decision)
covers all of these; each type is a **template** that pre-fills the pipeline, form, review plan
and copy. Templates are data, not code paths.

**Decided 2026-10-24: cohorts first.** The first hiring release is scoped and tested on cohort
selection (the Cohort, Fellowship, Program, Internship and Admissions rows below); jobs follow on
the same model. Two requirements from the founder shape every spec:

1. **Customers define the stages.** Add, rename, reorder and remove stages per opportunity; each
   stage keeps a category (open, hold, won, lost) so reporting survives any naming.
2. **Customers choose how each stage uses Bookly's modules** (Forms, Reviews, Scheduling, Video +
   capture, Messages, Tasks, Files, Payments, Routing, Decisions) and the rules that fire on
   entering or leaving a stage. The module table is in the canon
   (`bookly-team/references/company.md`). A spec that needs a stage behaviour no module offers
   adds a module option, never a use-case-specific code path.

| Type                | Example                                                              | Pipeline template                                             | Distinctive needs                                                                                                             |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Job**             | "Senior engineer, Berlin"                                            | Applied → Screen → Interview → Panel → Decision → Offer       | Rolling intake, hiring manager + recruiter roles, offer stage, salary range (pay transparency), job boards / careers page     |
| **Cohort**          | "2027 Horizon Fellowship — Spring cohort" (the `hiring.png` concept) | Applied → In review → Interview → Decision (batch) → Admitted | Fixed open/close dates, capacity (seats), independent multi-reviewer scoring, decision meeting, batch notifications, waitlist |
| **Fellowship**      | Research or design fellowship                                        | Applied → Review → Interview → Decision                       | Project proposal documents, external reviewers, conflict-of-interest declarations                                             |
| **Internship**      | Summer internship program                                            | Applied → Screen → Interview → Decision                       | High volume, students, school/graduation fields, possibly minors (needs legal decision)                                       |
| **Program**         | Accelerator, bootcamp, mentorship program                            | Applied → Review → Interview → Decision → Onboarded           | Teams as applicants (one application, several people), cohort start, onboarding tasks                                         |
| **Gig / freelance** | Agency hiring a contractor                                           | Applied → Portfolio review → Call → Decision                  | Portfolio links, rate, availability; fast cycle; repeat engagements with the same person                                      |
| **Admissions**      | Course, school or community admissions                               | Applied → Review → Interview → Decision → Enrolled            | Deadlines, references/recommenders, fee or deposit (existing payments)                                                        |
| **Volunteer**       | Nonprofit volunteer intake                                           | Applied → Orientation booking → Approved                      | Light review, group orientation sessions (existing group bookings), shifts                                                    |
| **Grant**           | Small grants program                                                 | Applied → Eligibility → Review panel → Decision               | Long forms, budget attachments, scoring rubric, conflict-of-interest, public announcement                                     |
| **Custom**          | Anything else                                                        | User-defined                                                  | Start from a blank pipeline                                                                                                   |

## What every type reuses from the core

- **Application page** = a public page like a booking page (`(public)/[username]/[event]`),
  on the workspace's domain, with the workspace's branding, built on routing-form style
  questions (`routingForms`) plus documents (the drive).
- **Interview** = a booking: event types, collective availability, round-robin, panel,
  self-scheduling link sent at a stage, reminders, Bookly video, capture with consent.
- **Candidate** = a person/contact with a timeline (applications, bookings, messages, notes).
- **Messages** = one conversation per candidate; templates per stage (invite to interview,
  decision, waitlist).
- **Tasks** = "complete your review", "send decision", with due dates and nudges.
- **Notifications, audit log, API v1, webhooks** extend with hiring events
  (`application.created`, `application.stage_changed`, `review.submitted`, `decision.made`).

## Hiring MVP scope (proposal for the plan)

1. Opportunity with type templates: job, cohort, custom.
2. Public application page with form + document upload, candidate notice, confirmation email.
3. Pipeline board (kanban by stage) and candidate side pane, as in `hiring.png`.
4. Review plan with assigned reviewers, structured criteria, independent until submitted.
5. Interview scheduling from a stage (self-scheduling link) on the existing engine.
6. Decisions (single and batch for cohorts) with templated messages.
7. Access limited to the opportunity team; audit everything.
8. Retention setting per opportunity; candidate export/delete.

Out of MVP: offers with e-signature, job board syndication, ATS/HRIS connectors (commercial),
adverse-impact reporting (commercial), any AI scoring (never by default).
