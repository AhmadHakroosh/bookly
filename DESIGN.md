# Design notes

The few rules every screen follows, so new work reads like the rest of Bookly. The components
live in `apps/web/src/components/ui` (shadcn/ui v4 on Base UI); this file records the decisions
behind them.

## Colour: one orange for show, one for text

Every colour is a token in `globals.css` (light and `.dark`); components never carry raw hex.
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

Bookly Orange never carries small text: white on it is 3.48:1. Status is never brand orange:
"Due today", "Feedback missing" and overdue counts are `warning` or `destructive`. A workspace's
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
