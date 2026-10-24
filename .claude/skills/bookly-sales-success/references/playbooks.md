# Sales and success playbooks

## Qualification (first call, 20 minutes)

1. Which work: selling time to clients, or selecting people (jobs, cohort, fellowship, program,
   grant, admissions, volunteers)? Both?
2. How many people host meetings or review applications?
3. What do you use today (Calendly/Cal.com + notetaker + CRM; or an ATS / Submittable /
   spreadsheets + forms)? What does it cost?
4. Where does it break: before the call (prep), during (notes), after (follow-up, decision,
   payment)?
5. Who decides and who pays? Any security, privacy or procurement steps?
6. When do you need it working (cohort deadline, hiring push, season)?
7. Cloud or self-host? (Self-host means the AGPL core is free; Enterprise adds modules.)

Good fit: 1–50 hosts/reviewers, meetings or applications are the core of their work, pain after
the call. Poor fit (today): high-volume enterprise recruiting needing job-board syndication and
deep ATS migration, regulated health data (no HIPAA), programs for minors (until legal decides).

## Demo script

Client work (15 minutes): booking page on a custom domain → booking with intake questions →
Home the next morning (agenda, briefing) → Bookly video with capture and consent notice → recap
with decisions and action items, one click to tasks → drafted follow-up with proposal → payment
request paid. Close with self-host and pricing.

Hiring (15 minutes, once the flag is on): opportunity from the cohort template → application
page → pipeline board → assign reviewers, independent review → self-scheduling interview link →
interview captured with consent → decision meeting and batch decisions → candidate messages.
State the fairness guardrails out loud: AI summarises, people decide.

## Design-partner program

- 5–10 per solution, diverse: solo consultant, agency, coaching practice; startup hiring,
  fellowship/cohort program, nonprofit volunteer program.
- In Console → Flags: create cohort, add workspaces, open beta flags to the cohort.
- Agreement (light, drafted by `bookly-legal-privacy`): beta terms, feedback, price lock for
  12 months, case-study permission optional.
- Cadence: kickoff, biweekly 30-minute call (captured with consent, recap in Bookly), shared
  channel, exit interview at GA.

## Onboarding sequence (drafts in `planning/sales/`, send via `packages/email`)

Day 0 welcome with one next step (connect calendar / create first opportunity) · Day 1 the
booking or application page link to share · Day 3 if no booking yet: help offer · Day 7 first
recap or first review tips · Day 14 team invite · Day 25 (trial/plan) value summary. Every email
has the postal address and unsubscribe, like other outreach.

## Churn signals (weekly check)

- No booking or application in 14 days on a paid plan.
- Calendar or conferencing integration disconnected and not reconnected.
- Capture budget unused for a month on Pro/Team (paying for something unused).
- Seats removed, downgrade preview opened, billing portal visits without change.
- Support tickets unresolved more than 3 days.
- Hiring: opportunity closed with no new one opened (seasonal; plan a check-in before next
  cycle rather than treating it as churn).

## Procurement answer bank (seed; confirm each with legal/security)

- Hosting and sub-processors: see `/dpa` (all US today).
- DPA: click-through, part of the terms; signed copy on request.
- Encryption, auth, video security, transcripts: see `/security`.
- Certifications: none today (no SOC 2, ISO 27001, HIPAA BAA). Say so; offer the security page,
  the open code and a call.
- SSO/SCIM: Enterprise module (planned); log the ask.
- Data export and deletion: Admin → Settings → Data (workspace export as JSON).
- Self-hosting: yes, Docker Compose, AGPL core.
