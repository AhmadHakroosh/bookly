# v2 token sheet (02 "Open Dialogue")

Values sampled from the brand sheet; confirm against the source vector before freezing. OKLCH
computed from the hex with the standard sRGB → OKLab transform. Contrast is WCAG 2.x relative
luminance.

## Brand colours

| Name          | Hex        | OKLCH                      | Notes                                    |
| ------------- | ---------- | -------------------------- | ---------------------------------------- |
| Dialogue Blue | `#3158D5`  | `oklch(0.511 0.197 266.2)` | `--brand`, `--primary` (light), `--ring` |
| Mist          | `#EAF0FF`  | `oklch(0.955 0.021 268.4)` | `--accent` / active nav / selected rows  |
| Ink           | `#19243B`  | `oklch(0.262 0.046 264.0)` | `--foreground`, ink button, reversed bg  |
| Paper         | `#F9FAFC`  | `oklch(0.985 0.003 264.5)` | `--background` (app + site)              |
| Reply Blue    | ≈`#A9C1F5` | `oklch(0.811 0.078 265.4)` | Second bubble, illustrations only        |

Dark-mode proposals (to validate in the browser):

| Name                 | Hex       | OKLCH                      | Use                                    |
| -------------------- | --------- | -------------------------- | -------------------------------------- |
| Night                | `#0E1424` | `oklch(0.194 0.034 267.6)` | `.dark --background`                   |
| Ink (card)           | `#19243B` | `oklch(0.262 0.046 264.0)` | `.dark --card`, `--popover`            |
| Dialogue Blue lifted | `#7B98EE` | `oklch(0.694 0.131 268.7)` | `.dark --primary`, `--brand`, `--ring` |

## Contrast checks (computed)

| Pair                    | Ratio | Passes                 |
| ----------------------- | ----- | ---------------------- |
| Blue `#3158D5` on white | 6.02  | AA text                |
| Blue on Paper `#F9FAFC` | 5.77  | AA text                |
| Blue on Mist `#EAF0FF`  | 5.28  | AA text (active nav)   |
| Ink on Paper            | 14.82 | AAA                    |
| `#5B7EE8` on Night      | 4.89  | AA text, barely: avoid |
| `#7B98EE` on Night      | 6.61  | AA text: use this      |

White text on Dialogue Blue = 6.02: primary buttons pass.

## Mapping onto today's variables (`apps/web/src/app/globals.css`)

| Variable                                    | Today (light)         | v2 light                               | v2 dark                    |
| ------------------------------------------- | --------------------- | -------------------------------------- | -------------------------- |
| `--brand`                                   | `oklch(0.72 0.14 55)` | Dialogue Blue                          | Blue lifted                |
| `--background`                              | white                 | Paper                                  | Night                      |
| `--foreground`                              | `oklch(0.145 0 0)`    | Ink                                    | `oklch(0.985 0.003 264.5)` |
| `--primary`                                 | near-black            | Dialogue Blue                          | Blue lifted                |
| `--primary-foreground`                      | near-white            | white                                  | Night                      |
| `--accent`                                  | `oklch(0.97 0 0)`     | Mist                                   | `oklch(0.30 0.06 266)`     |
| `--accent-foreground`                       | near-black            | Dialogue Blue                          | Blue lifted                |
| `--ring`                                    | grey                  | Dialogue Blue                          | Blue lifted                |
| `--sidebar-primary`                         | near-black            | Dialogue Blue                          | Blue lifted                |
| `--sidebar-accent`                          | grey                  | Mist                                   | as `--accent`              |
| neutrals (`--muted`, `--border`, `--input`) | pure grey (chroma 0)  | same lightness, hue 264, chroma ≤ 0.01 | same                       |

Add semantic tokens that do not exist yet: `--success`, `--warning`, `--info` (+ `-foreground`
and soft `-muted` variants), and register them in the `@theme inline` block.

An "ink" button (black in the mocks: "Join meeting", "Add candidate", "Create") is a Button
variant to add, not a one-off class: background Ink, text white; in dark mode it inverts to
Paper with Ink text.

## How to check a new pair

Use any WCAG contrast tool, or the computation used for this sheet (relative luminance with
sRGB linearisation, ratio (L1 + 0.05) / (L2 + 0.05)). Record the pair and ratio here when a new
token pairing ships.
