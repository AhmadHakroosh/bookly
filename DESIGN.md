# Design notes

The few rules every screen follows, so new work reads like the rest of Bookly. The components
live in `apps/web/src/components/ui` (shadcn/ui v4 on Base UI); this file records the decisions
behind them.

## Colour: one orange for show, one for text

Every colour is a token in `globals.css`; components never carry raw hex.
The palette comes from the v1.0 product concepts; values and contrast checks live in
`.claude/skills/bookly-design-system/references/tokens.md`.

| Token                                       | Light         | Use                                                         |
| ------------------------------------------- | ------------- | ----------------------------------------------------------- |
| `brand`                                     | Bookly Orange | The mark, fills, icons, progress, timeline dots, large type |
| `primary`                                   | Ember         | Primary buttons (white label), orange text and links        |
| `accent`, `sidebar-accent`                  | Peach         | Active nav item, selected rows and cards (Ember text)       |
| `ink`                                       | Ink           | The dark button and reversed surfaces                       |
| `background` / `card`                       | Paper / white | Page / cards and popovers                                   |
| `sidebar`, `muted`, `secondary`             | Sand          | Sidebar, quiet surfaces                                     |
| `success`, `warning`, `info`, `destructive` | semantic      | Status only, with `-muted` fills for chips                  |

Hover states are solid tokens, never a see-through fill: `primary-hover` darkens Ember and
`ink-hover` lifts Ink a step, so a label keeps its contrast while the pointer is on it. Bookly is
light only (founder, 2026-10-25): there is no dark theme, no `.dark` tokens, no `dark:`
utilities and no theme toggle, and pages declare `color-scheme: light`. A dark surface is a
brand use (the logo tiles on `/press`, a CTA band) drawn with `ink`, never a theme. Video tiles
stay dark because video is.

Bookly Orange never carries small text: white on it is 3.48:1. Status is never Bookly Orange:
"Due today", "Feedback missing" and overdue dates are `warning`, which is Ember, as the concepts
draw them (on its own tint for chips, 4.92:1); failures and deletions are `destructive`. A workspace's
own colour replaces `primary` and `ring` on its public pages (`accentVars` in
`server/brand.ts`), so public UI uses `primary`, not `brand`, for anything interactive.

## Buttons: one scale

Every button is the `Button` component. There are no hand-rolled `<button className="h-8 …">`
elements; a link that looks like a button is `<Button nativeButton={false} render={<Link />}>`.

| Size      | Height | Use                                                                 |
| --------- | ------ | ------------------------------------------------------------------- |
| `lg`      | 44 px  | The one primary call to action on a page: Sign up, Book, Save form. |
| `default` | 40 px  | Forms, toolbars, dialogs, cards. Matches `Input` and `Select`.      |
| `sm`      | 32 px  | Inside tables, lists and chips, where a row sets the rhythm.        |
| `xs`      | 28 px  | Tag-sized actions (remove a chip, clear a filter).                  |
| `icon-*`  | same   | Square versions of the above for icon-only buttons.                 |

Text is `font-semibold`. Icons inside a button carry `data-icon="inline-start"` or
`"inline-end"` so the padding on that side tightens; the icon is 16 px (20 px on `lg`).
Variants: `default` (primary, Ember), `ink` (the dark button: "Join meeting", "Create"),
`outline` (secondary), `ghost` (tertiary, in rows and menus), `destructive`, `secondary`, `link`.
Still one primary per page: `default` or `ink`, not both. Badges add `success`, `warning` and
`info` for status chips.

Form controls share the 40 px default height: `Input`, `Select`, `DatePicker`, `NumberField`,
`ColorPicker`, `HandleField`, and, through a base rule in `globals.css`, every native text
`<input>` and single `<select>`. A text field and the button beside it line up without classes;
add `h-8` (and a `size="sm"` button) only inside tables and chips.

## The shell

Every admin page sits in one frame (`app/(admin)/admin/layout.tsx`, parts in
`components/shell/`), drawn as `app ui.png` and specified in
`planning/v2/ux/concept-fidelity.md` §2, which is binding:

- **Sidebar** (Sand, 240 px, `lg` and up): the Bookly lockup; the workspace switcher (a card with
  the workspace's logo or initial on Ink); the primary items (Home, Bookings, Contacts, Messages,
  Tasks, Files), a divider, the scheduling items (Booking page, Event types, Availability,
  Routing); Settings and Team pinned to the bottom for owners and admins; a divider and the
  account card (picture, name, email). **No group headings**: the dividers are the only
  grouping. The active item is Peach with Ember text and `aria-current="page"`; Messages carries
  its unread count. Collaborators keep their own short list (ADR 0005).
- **Clients | Hiring**: where the `hiring` flag is on, a two-way switch under the workspace
  swaps in Hiring's own items (`hiring.png`, decision D1). Messages, Files, Settings and Team
  are shared and keep the side you came from.
- **Top bar** (56 px, sticky): breadcrumb ("Workspace / Home", "Hiring / Overview"; stops before
  an id), the search-or-jump field (⌘K) in the middle, then the bell, Help (icon and word) and
  the avatar. No theme toggle. Personal pages (Account, Notifications, Calendars, Conferencing,
  the public booking page) live in the account menu; Domains and Billing are reached from ⌘K
  until Settings is regrouped (§4.11).
- **Phone and narrow windows**: the sidebar becomes a sheet behind a menu button; the logo mark,
  a search button, the bell, Help and the avatar stay in the bar.
- **⌘K** (`shell/command-menu.tsx`) is Base UI Autocomplete in a Dialog: every page the member
  can open, settings tabs, their own things, and contacts searched on the server as you type.

`shell/nav.ts` holds the sidebar, the breadcrumb and the ⌘K pages: add a page there and it is
navigable, named and searchable.

## Page anatomy

1. `PageHeader`: the title (the page's one `h1`, a noun), an optional badge (`BetaBadge`,
   `StatusChip`), one line of context, and at most two actions on the right: outline, then the
   primary (`default` or `ink`). Home's primary is `SplitButton` "+ Create ▾".
2. Optionally a `StatStrip` of counts right under it ("3 meetings today").
3. The content: lists, an `Agenda`, a `KanbanBoard`; an `EmptyState` when there is nothing yet.
4. Side panes (`PaneHost`) open over the page and start with a `PaneHeader`.

## Components

Built on Base UI and the tokens; all in `components/ui`. The operator console has a gallery at
`/console/design` with each one in sample use, for review in both themes.

| Component                                                 | Use                                                                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`                                              | Top of every admin page (above).                                                                                                                                     |
| `StatStrip`, `Stat`                                       | A row of counts in one card; `tone="warning"` only when a count needs action.                                                                                        |
| `StatusChip`                                              | Status beside a title or in a row: `success`, `warning`, `destructive`, `info`, `neutral`, and `accent` (Peach, emphasis that is not a status, such as "In 15 min"). |
| `Agenda`, `AgendaItem`                                    | A day as a timeline: times on a rail, a card per meeting, the current or next one `active`.                                                                          |
| `KanbanBoard`, `KanbanColumn`, `KanbanList`, `KanbanCard` | Boards (tasks by status, applications by stage). Dragging stays with the caller.                                                                                     |
| `PaneHeader`                                              | The top of a side pane: picture, title, context, status, actions; leaves room for the close button.                                                                  |
| `AvatarStack`                                             | People on a meeting or a panel, "+N" past three; screen readers hear the names once.                                                                                 |
| `Progress`                                                | Bookly Orange on Sand, always labelled ("2 of 3 submitted").                                                                                                         |
| `EmptyState`                                              | An icon in the mark's speech bubble, a title that says what will be here, how it fills, and the action.                                                              |
| `SplitButton`                                             | The header's primary with a menu ("+ Create ▾"): split with `href`/`onClick`, one menu button without.                                                               |
| `SegmentedTabs`                                           | Pill tabs with counts that switch a list's view ("Upcoming (4) · Past · Requests (1)"); links, so the view is in the address.                                        |
| `JourneyStrip`                                            | Booked → Prepared → Met → Followed up → Paid on every contact (D3); done, current and to-do steps, each linking to its record.                                       |
| `Timeline`, `TimelineEntry`                               | A contact's history: coloured icon per kind, time, what happened, a View link.                                                                                       |
| `ActionList`, `ActionItem`                                | "Next actions": the suggested step in Peach, the rest as plain rows.                                                                                                 |
| `ChecklistRow`                                            | A task with its checkbox, who it is for, and the due date (Ember when today or late).                                                                                |
| `ListRow`                                                 | A person in a list: picture, name, subject, preview, time, unread dot; actions sit outside the link.                                                                 |
| `FileRow`, `FileTypeIcon`                                 | A file with its coloured type icon (PDF red, doc blue, sheet green), one line and the date.                                                                          |
| `AttentionStrip`, `AttentionItem`                         | "Needs attention": what waits on the team, and the link that deals with it.                                                                                          |
| `RecapCard`                                               | "Recap ready" in Peach with the action (Ember, not the concept's Bookly Orange fill, for contrast).                                                                  |
| `UsageBar`                                                | A plan limit and its use; Ember at the limit.                                                                                                                        |
| `VideoTile`, `CallControls`, `CallControl`                | The call: dark video tiles with names, labelled controls, a red End.                                                                                                 |
| `Kbd`                                                     | Keys and shortcuts.                                                                                                                                                  |

## Pointers

Everything clickable shows a pointer, and everything disabled shows `not-allowed`. The rule is
global (`globals.css`, `@layer base`): links, buttons, menu items, tabs, switches, labels and
summaries get it automatically. A row or card that opens something (a side pane, a drawer) is a
`<button>` or has `role="button"`; if it must stay a `<div>`, give it `cursor-pointer`.

## Loading

Anything that reaches the server shows it: `SubmitButton` inside forms, `ActionButton` for
clicks, `BusyOverlay` (blurred page, `role="status"`) for actions that leave the page such as
signing out or deleting the workspace. Pages stream behind a skeleton from
`components/skeletons/pages.tsx`.

## Long forms

Split into titled sections with a `SectionNav` jump bar (sticky under the header, highlights the
section in view) and a sticky Save bar at the bottom. Each target has an `id` and `scroll-mt-40`.

## Naming

The admin opens on **Home** (`/admin`): today's meetings, requests, overdue tasks, follow-ups,
recaps to review. "Inbox" is reserved for email. Pages are nouns (Bookings, Contacts, Settings),
actions are verbs on buttons (Save, Invite, Cancel booking).

## Betas and the activity log

A page behind a feature flag renders `<BetaBadge />` next to its title (see
`docs/cloud.md` → Feature flags and betas). Every server action that writes workspace data calls
`audit()` from `server/audit.ts` once after the write; `src/__tests__/audit-coverage.test.ts`
fails when one does not and is not marked `// audit: read-only`.
