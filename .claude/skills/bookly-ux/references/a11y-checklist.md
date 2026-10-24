# Accessibility checklist (WCAG 2.2 AA)

Bookly sells into the EU (European Accessibility Act, in force since June 2025) and US public
and education customers (ADA, Section 508). Hiring makes it stricter: an inaccessible
application page excludes candidates.

- Every page passes axe in `apps/web/tests/e2e/a11y.spec.ts` (add new pages there).
- Keyboard: every action reachable with Tab/Shift-Tab, Enter/Space; visible focus ring
  (`--ring`); Esc closes panes and dialogs and returns focus to the trigger; no keyboard traps in
  the kanban (provide "Move to stage" menu as the non-drag alternative).
- Drag and drop always has a button alternative (WCAG 2.5.7).
- Targets at least 24×24 px (2.5.8); `sm` buttons (32 px) are fine, `xs` (28 px) only for chips.
- Contrast: text 4.5:1, large text and UI parts 3:1, in both themes (see
  `bookly-design-system/references/tokens.md`).
- Status is never colour alone: text or icon with it ("Feedback missing", not just red).
- Forms: visible labels, errors tied with `aria-describedby`, error summary on submit, no
  placeholder-as-label, autocomplete attributes on personal fields, no time limits on
  application forms (or a way to extend).
- Live regions: toasts (`sonner`) and `BusyOverlay` use `role="status"`; unread counts include
  screen-reader text (as `admin-nav.tsx` does: "N unread").
- Media: live captions in Bookly video where transcription is on; recaps are text.
- Motion: honour `prefers-reduced-motion`.
- Language: `lang` on `<html>`; `dir="rtl"` support when Arabic ships; logical CSS properties.
- Candidate accommodations: application pages offer a way to request one, routed to a restricted
  field reviewers cannot see.
