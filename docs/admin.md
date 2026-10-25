# The admin

Everything a host does in Bookly happens under `/admin` on the workspace's address. This page
explains how it is laid out and how to move around it quickly.

## The sidebar

The sidebar on the left starts with your workspace. On the hosted service it is a menu that
switches between your workspaces and opens the workspace chooser; a self-hosted install has one
workspace and shows its name and logo. Below it:

- **Home, Bookings, Contacts**, and **Messages**, **Tasks** and **Files** where they are switched
  on. Messages shows how many conversations are unread.
- After a line, your scheduling: **Booking page, Event types, Availability**. Availability is
  **Availability & routing**: Weekly hours (a switch per day), Date overrides, Priority rules
  (the weekly budget and hours kept for priority contacts) and Routing (your routing forms, with a
  preview beside your weekly hours of who each answer goes to).
- At the bottom, for owners and admins: **Settings** and **Team**.
- At the very bottom, you: your picture, name and email, which open your menu.

Workspaces in the hiring beta (the `hiring` flag) get a **Clients | Hiring** switch under the
workspace. Hiring has its own items: **Overview**, **Opportunities**, **Candidates**, **Interviews** and
**Reviews** (with how many you owe; see [Hiring](hiring.md)). Messages, Files, Settings and Team
are the same on both sides.

Collaborators (outside reviewers and interviewers, see [Teams](teams.md)) see only their own
profile, availability, calendars and conferencing, and notifications.

Your own connections live in **Calendars & conferencing** (your menu, or ⌘K): the calendars you
connected and which of them block your hours, calendar feeds, the video tools that are ready, and
the **default conferencing tool** new event types start with.

**Settings** has two halves. **Workspace settings**: General, Integrations (HubSpot, Pipedrive,
Stripe, each with its state and Connect or Manage), API (keys and webhooks), Privacy (transcript
retention, export, the activity log and the Danger zone). **Brand & communications**: Branding,
Domains and Emails. A button at the top of each half leads to the other.

On a phone or a narrow window the sidebar folds away: the menu button at the top left opens it,
and choosing a page closes it again.

## Bookings

**List** or **Calendar** (Day, Week, Month), remembered per browser. The list has **Upcoming**,
**Past** and **Requests** (with how many wait for you), grouped by day: the time and length, the
person and the event type, a chip when it is a request, cancelled or a no-show, and ⋯ to confirm,
mark a no-show or cancel with a reason they are told. A group session is one row with its seats,
everyone in it and its waitlist. Choosing a booking opens it beside the list: the person, the
event type and status, **Join meeting** and **More actions**, when, where (copy the link) and who,
then **Briefing · Notes · Recap**.

## The top bar

- **Breadcrumb**: where you are, for example _Workspace › Settings › Branding_ or _Hiring ›
  Overview_. Each step back is a link.
- **Search or jump** (<kbd>⌘</kbd> <kbd>K</kbd> on a Mac, <kbd>Ctrl</kbd> <kbd>K</kbd>
  elsewhere): type part of a page or setting name to go there, or a contact's name, email or
  company to open them. Arrow keys move, <kbd>Enter</kbd> opens, <kbd>Esc</kbd> closes. On a
  phone it is the magnifier button.
- **Notifications**: the bell, where notifications are switched on (see
  [Notifications](notifications.md)).
- **Help**: the documentation, support (an email to the operator on the hosted service, the
  issue tracker when self-hosted), the source code, and the keyboard shortcuts.
- **Your menu** (your picture or initials, also at the foot of the sidebar): your account and
  sign-in methods, notifications, calendars, conferencing, your public booking page, and sign
  out. Domains and billing are one search away (⌘K).

Bookly has one, light theme; it does not follow a dark system setting.

## Keyboard shortcuts

| Keys                                                     | What it does                   |
| -------------------------------------------------------- | ------------------------------ |
| <kbd>⌘</kbd> <kbd>K</kbd> / <kbd>Ctrl</kbd> <kbd>K</kbd> | Search or jump to a page       |
| <kbd>J</kbd> / <kbd>K</kbd>                              | Next / previous item in a pane |
| <kbd>Esc</kbd>                                           | Close the pane, menu or dialog |

The bookings calendar has its own keys (← → to step, T for today, D W M to switch view), listed
in [Scheduling](scheduling.md).
