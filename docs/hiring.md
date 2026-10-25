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

| Template                 | Stages                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- |
| **Cohort or fellowship** | Applied → In review → Interview → Decision → Admitted · Waitlist · Not selected |
| **Internship**           | Applied → Screen → Interview → Decision → Accepted · Waitlist · Not selected    |
| **Program**              | Applied → Review → Interview → Decision → Onboarded · Waitlist · Not selected   |
| **Admissions**           | Applied → Review → Interview → Decision → Enrolled · Waitlist · Not selected    |
| **Start blank**          | Applied → Accepted · Not selected                                               |

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

**Open full preview** (in the preview panel, and on a draft's page) opens the real application
page with a "Preview — not live" banner; nothing submitted there is kept.

## The application page

Applicants apply at `/apply/<link>` on your workspace's address. No account: the page reads well
on a phone before any script loads, and the form opens below it.

- **The top** shows the title and cohort, when applications close (in the applicant's own time
  zone, with yours when they differ), about how long it takes, the decisions-by date, **What
  happens next** (built from your stages and dates), who sees an application, the 16+ rule and
  your privacy notice.
- **The form** goes one section at a time. Once an email is filled in, every change is saved;
  **Save and finish later** emails a link that reopens the draft on any device until
  applications close. Drafts never reach your team: the opportunity page shows only how many
  were started and not sent.
- **Adjustments and access** comes before the end (never first). A request is kept apart,
  encrypted, and only coordinators see it.
- **Review and submit** lists the answers with Edit links, the privacy notice, the required
  consent and an optional "keep my details for future opportunities". Problems are listed at
  the top, each linking to its answer.
- **After applications close**, a draft started before the deadline can still be sent for the
  grace period (2 hours by default).

Applying again with the same email to the same round sends the applicant their status link
instead and says nothing more on screen. Each application starts at the first stage, with the
first stage's routing applied (a track, or a flag for a coordinator; never a rejection), the
first stage's email (the template's "We've received your application"), a notification for the
coordinators and the `application.submitted` webhook (ids only).

## The status page

Every email to an applicant carries their status link, `/applications/<token>`. It shows:

- the status in plain words ("Submitted", "Under review"): never an internal stage name, a hold
  or a decision that hasn't been released;
- what to do, the timeline and their answers. **Edit my application** works while the
  application is still in the first stage and nobody has submitted a review; each edit keeps the
  earlier answers as a previous version;
- their adjustments request, which they can change;
- **Download my data** and **Delete my application**, and **Withdraw**.

Links work for 30 days after the last email that carried one. An expired or lost link offers a
new one by email, with the same answer whether or not an application exists.

## Withdrawals and deletion requests

Withdrawing stops the review, cancels interviews still to come and tells the coordinators.
Asking for deletion withdraws at once and emails a receipt with the latest deletion date: 30 days
later. Coordinators find requests under **Edit setup → Privacy → Data requests**: **Delete now**,
or **Record a legal hold** with the reason (the applicant is told it, in your words). Coordinators
are reminded at day 7 and day 21, and Bookly deletes the application itself at day 30 unless a
hold is recorded. Deleting removes the answers (every version), documents, the adjustments
request, reviews, interviews and the person, when this application was all you had of them; a
record that the request was honoured stays, with only the email.

## The pipeline

The opportunity's **Pipeline** tab shows a column for each stage with the people in it. Each card
has the person's name, when they applied, and the one thing that matters next: a requirement they
don't meet ("Doesn't meet: Eligible to work in the EU"), their next interview, feedback that is
overdue, how many reviews are in, or that they're waiting for an interview time. **Board · List**
switches to a table with filters (Flagged, Feedback missing, Awaiting scheduling, Waiting long), a
stage picker and a search by name.

**Moving people.** Coordinators drag a card to another stage, or use a card's **⋯ → Move to**
(the way to move with a keyboard or a screen reader). Tick cards (or a whole column with its
**⋯ → Select all**) and use **Move to…** in the bar that appears to move several at once. Every
move is in the activity log, runs the stages' rules, and sends `application.stage_changed`.
Outcomes (Admitted, Waitlist, Not selected and the like) are never reached by moving a card:
people get there when someone records a decision.

**Unfinished work is advice, not a wall.** When a stage has something unfinished, such as
"1 of 3 reviews missing", moving on from it asks first ("1 of 3 reviews missing. Move anyway?").
**Move anyway** moves them and records the check you overrode in the activity log.

**Needs attention** under the board lists what is waiting on the team: overdue feedback, people
waiting for an interview time, applications flagged for a requirement, and anyone in a stage
longer than its "needs attention" setting. **View candidates** opens the list filtered to them.

**The candidate pane.** Clicking a card opens the person beside the board (the address carries
`?application=`, so you can share it with your team): their stage, with a menu to move them;
**Overview** with the requirement flags, their answers and documents, the next interview, review
progress and the decision status; **Interviews**; and **Feedback**. A requirement flag never
rejects anyone: a coordinator looks, decides, and can **Clear** the flag (recorded). If the person
asked for adjustments, coordinators see that they did, and **Show** reveals the request; each
time it is read is in the activity log.

### Who sees what

| Role        | Board and list                     | Answers and documents | Review progress | Moves |
| ----------- | ---------------------------------- | --------------------- | --------------- | ----- |
| Coordinator | Every application                  | Yes                   | Yes             | Yes   |
| Reviewer    | Applications assigned to them      | Yes                   | Their own only  | No    |
| Viewer      | Every application, names and stage | No (no email either)  | No              | No    |

Workspace owners and admins coordinate every opportunity. Adjustments requests are for
coordinators only.

**Stage rules for applications.** A stage's rules run when people enter or leave it: an email
to the candidate (with a link to their status page), a note to the coordinators or the assigned
reviewers, a tag, routing to a track or a requirement flag, and a move to another open stage.
A rule never moves anyone to an outcome and outcome messages wait until decisions are released,
even if a stage became an outcome after the rule was saved. Actions whose part of hiring isn't
here yet (assigning reviewers, booking links, follow-up forms, payments) are skipped and say so
in the run's results.

## After publishing

The opportunity's page shows its status, cohort and dates, and **Pipeline · Interviews · Review
plan · Team**. **Edit setup** opens the same wizard; every saved change is recorded in the
activity log. With applications in a stage, removing it asks where they go (an open stage), and it
can only become an outcome once it is empty. **⋯ → Close applications** closes the window now;
**Archive** waits until every applicant has heard their final decision.
