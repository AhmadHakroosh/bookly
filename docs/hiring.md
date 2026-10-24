# Hiring: opportunities

Run a selection round in Bookly: a fellowship, a cohort, an internship, a program or an
admissions round. Each **opportunity** has its own stages, application form, reviewers, team and
messages, so every applicant hears from you at each step and every outcome is decided by a person.

Hiring is in beta behind the `hiring` flag (it builds on `pipelines`). Workspaces in the beta get
a **Clients | Hiring** switch in the sidebar; Hiring has **Overview** and **Opportunities**, with
candidates, interviews and reviews arriving in the next beta releases.

## Create an opportunity

**Hiring → Opportunities → Create opportunity** opens the setup wizard: **Start · Basics · Stages
· Team · Privacy · Publish**. A draft is saved from the first step; leave and come back with
**Continue setup**. Owners, admins and members can create opportunities; collaborators cannot.

### Start: a template or a copy

| Template                  | Stages                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Cohort or fellowship**  | Applied → In review → Interview → Decision → Admitted · Waitlist · Not selected                |
| **Internship**            | Applied → Screen → Interview → Decision → Accepted · Waitlist · Not selected                   |
| **Program**               | Applied → Review → Interview → Decision → Onboarded · Waitlist · Not selected                  |
| **Admissions**            | Applied → Review → Interview → Decision → Enrolled · Waitlist · Not selected                    |
| **Start blank**           | Applied → Accepted · Not selected                                                              |

Templates fill in the application form, scorecards, reviews, rules and every message; change
anything afterwards. The internship and admissions forms ask applicants to confirm they are 16 or
older, and every application page says so. Forms never compute a score from answers.

**Copy a previous opportunity** (or **⋯ → Copy for a new cycle** on an opportunity) starts a
draft with the same stages, modules, rules, forms, scorecards and messages. Applications,
reviews, decisions and files are never copied; the dates are cleared and the link is new. Tick
**Also copy the team** to bring the team along (outside reviewers are invited again when you
publish).

### Basics

Title, cohort (optional), type, when applications open (now, or a date) and close, the
**decisions by** date applicants are promised, seats (optional; applicants don't see it), the
time zone, and the application link (`/apply/<link>` on your workspace's address).

### Stages

The core of setup. On the left, the stages in order; outcomes (won, lost and hold stages) sit
under their own divider, because an application reaches one only when someone on your team
decides. Reorder by dragging, with the keyboard (Space to lift, the arrow keys, Space to drop) or
with **Move up / Move down** in a stage's menu; the first stage receives applications and stays
first.

Select a stage to change its name, its **category** (Open, Hold, Won, Lost: reports use the
category, so name stages however you like), and **what applicants see** ("Under review" instead
of an internal stage name). A hold stage can be the **Waitlist**.

Each stage switches **modules** on and configures them: Forms, Reviews (scorecard, reviewers per
application, assignment, due date), Scheduling (the event type applicants book), Video and
capture, Messages, Tasks, Files (required documents), Payments (a fee or a deposit), Routing
(set a track or flag an application for a person) and Decisions (one by one or in a batch).

**Rules** read as sentences: "When an application enters this stage, if it has the track
engineering, do: assign reviewers." They only offer what the stage's modules can do. **Rules
never decide**: they can't move anyone to an outcome, and Routing can flag an application
("Doesn't meet: Enrolled at a university") but never reject it. People decide outcomes.

The preview on the right shows the application page or the status page an applicant sees at the
selected stage, with every email it sends, on a phone or a desktop. **Journey** lists every
touchpoint across all stages and warns when:

- applicants who reach an outcome would hear nothing (this blocks publishing);
- applicants may wait in a stage for more than a week without an update;
- review and interview due dates run past the decisions-by date.

Messages on outcomes are **sent when you release decisions**, never the moment someone is moved.

### Team and access

Add coordinators, reviewers, interviewers and viewers from the workspace, or invite people from
outside by email (owners and admins). Outside people join as **collaborators**: they review,
interview or view, but don't host bookings or own pipelines, and they can't coordinate. Their
invitations go out when you publish. Coordinators see every application and make decisions;
reviewers see only the applications assigned to them and never accommodations requests; viewers
see the pipeline without documents or reviews.

### Privacy and applicant experience

The privacy notice is pre-filled (it states the 16+ rule; **Reset to template** restores it). Choose
how long applications of people not admitted are kept after the round's last decision: 6 months
by default, 12 for internships (US employers must keep applications for a year); 30 days to
24 months. Ask about accommodations (on by default; only coordinators see requests), and set the
sender name and reply-to address of applicant emails.

### Publish

The checklist must be all green: the pipeline is valid, the form asks for name and email, every
outcome has a message, a privacy notice is set, the dates are set and there is a coordinator.
Each red item links to where you fix it. Publishing is all or nothing: the opportunity opens (or
is **Scheduled** when its window starts later), the team is told, invitations go out and the
`opportunity.published` webhook fires. On the hosted Free plan one opportunity can be open at a
time.

The application page itself arrives in the next hiring beta release.

## After publishing

The opportunity's page shows its status, cohort and dates, and **Pipeline · Interviews · Review
plan · Team**. **Edit setup** opens the same wizard; every saved change is recorded in the
activity log. With applications in a stage, removing it asks where they go (an open stage), and it
can only become an outcome once it is empty. **⋯ → Close applications** closes the window now;
**Archive** waits until every applicant has heard their final decision.
