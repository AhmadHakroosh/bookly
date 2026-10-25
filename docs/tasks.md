# Tasks and the task board

Tasks are the follow-ups from your meetings (a recap's action items, the lines of your notes)
and anything you add by hand. They live on their booking and contact, on Home, and on their
own page, **Admin → Tasks**, behind the `task_board` feature flag (Console → Flags; a **Beta**
badge shows while it is in beta).

## Board and list

- **Board**: one column per status, cards ordered by hand. Drag a card within a column or to
  another one with the mouse, with a finger (press and hold), or with the keyboard: focus a
  card, **Space** picks it up, the arrow keys move it (← → change column, ↑ ↓ change place),
  **Space** drops it, **Escape** cancels. **Enter** opens it. Each column loads 50 cards and
  **Show more** for the rest; a quick **Add task** sits at the bottom of every open column.
- **List** (the default): a table of the task, its assignee, due date (today and overdue in
  orange) and contact, soonest due first, tasks without a date last, open tasks unless **Show
  done** is on; 50 at a time with **Show more**. The circle marks a task done or reopens it.

The icons at the right switch between list and board. Clicking a card or row opens the task in a
side pane (`?task=<id>`): the done circle and title, then its properties (title, assignee, due
date, the contact and meeting it came from, status), the description, files, comments and
**Delete task**.

## Statuses

Each workspace defines its own flow. Bookly starts every workspace with **To do → In progress →
Done**; owners and admins change it from **Statuses** on the Tasks page: add, rename, colour,
reorder, set a **WIP limit** (the column header warns when it holds more), mark one or more as
**Counts as done**, choose the **default** for new tasks, and archive a status (its tasks move to
the status you pick). A board always keeps at least one open and one done status, and exactly
one default, which is an open status. Moving a task into a done status marks it done everywhere
(Home, briefings, the overdue nudge); moving it out reopens it. "Mark done" elsewhere moves the
task to the first done status.

## Views and filters

**Mine · All · Completed** sit at the top with their counts (All on Team). **Mine** is the default
for members, **All** for owners and admins on Team. **Filters** holds the assignee, due date
(overdue, today, this week, none), status, contact and event type; every filter is part of the
URL, so a view can be bookmarked or shared. **Save view** keeps the current filters and layout
under a name, for you or (Team) the whole workspace, and **Saved views** brings it back. The page
remembers your last view and layout.

## Teammates

On Team, a task can be given to any member (from the pane or **New task**); they are notified
("Task assigned to you"). In comments, type **@** to mention a teammate; they are notified
("Mentioned in a task"). Notification channels per kind are under your menu → Notifications.

## Plans

| Plan        | Tasks                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Free        | List view with the default statuses, your own tasks                    |
| Pro         | The board with drag and drop, your own statuses, saved views           |
| Team        | Assign tasks to teammates, @-mentions, views shared with the workspace |
| Self-hosted | Everything                                                             |

Plan gates are `taskBoard` and `taskAssignment` in `packages/cloud`, checked on the server.

## Activity log and API

Every change is in Settings → Data → Activity: `task.created`, `task.moved` (with the status it
left and entered), `task.updated`, `task.completed` / `task.reopened`, `task.deleted`,
`task.commented`, `task_status.created` / `updated` / `reordered` / `archived`,
`task_view.created` / `deleted`. `GET /api/v1/tasks` includes each task's `statusId`. The
workspace export includes statuses, comments and saved views.
