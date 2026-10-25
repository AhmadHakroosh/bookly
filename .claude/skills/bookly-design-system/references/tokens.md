# v2 token sheet (02 mark, concept palette)

Colours sampled from the UI and marketing concepts in `planning/v2/concepts/` (dominant pixel
colours of buttons, nav, cards and backgrounds). OKLCH computed from the hex with the standard
sRGB → OKLab transform. Contrast is WCAG 2.x relative luminance.

## Brand colours

| Name          | Hex       | OKLCH                     | Sampled from                             | Use                                     |
| ------------- | --------- | ------------------------- | ---------------------------------------- | --------------------------------------- |
| Bookly Orange | `#E85D2C` | `oklch(0.651 0.183 38.6)` | "Complete your review", badges, progress | `--brand`, `--primary`, every orange    |
| Orange hover  | `#D2501F` | `oklch(0.599 0.175 39.0)` | Derived (one solid step darker)          | `--primary-hover`                       |
| Peach         | `#FCEAE1` | `oklch(0.949 0.023 48.5)` | Active nav, selected card, stage chip    | `--accent`, selected rows               |
| Apricot       | `#FCDCC2` | `oklch(0.914 0.050 61.2)` | "In 15 min" chip                         | Time chips, soft highlights (Ink text)  |
| Reply         | `#F5B6A0` | `oklch(0.829 0.080 40.1)` | Bookly Orange 55% toward white           | Second bubble of the mark, illustration |
| Ink           | `#1C1C1C` | `oklch(0.226 0.000 89.9)` | "Create", "Join meeting", headings       | `--foreground`, ink button              |
| Paper         | `#FAF8F4` | `oklch(0.980 0.006 84.6)` | Page background (app and site)           | `--background`                          |
| Sand          | `#F4F2EE` | `oklch(0.962 0.006 84.6)` | Sidebar                                  | `--sidebar`, secondary surfaces         |

Sampled again on 2026-10-25 (the dominant solid orange of each mock): `hiring.png` `#E86028`
(its "Complete your review" button `#E85D27`), `app ui.png` `#E66436`; the marketing mocks run
hotter and vary among themselves (`#F25E28`, `#FC5214`, `#FE4E00`). Bookly Orange `#E85D2C` is
the app mocks' orange within rendering noise, so the mark and the UI share that one hex.

Dark mode was **retired** on 2026-10-25 (light only, as the concepts) and its tokens were removed
from `globals.css` (Phase 2.5). These values are a record only; a dark brand surface (logo on
dark, CTA bands) uses `--ink`:

| Name          | Hex       | OKLCH                     | Use                                    |
| ------------- | --------- | ------------------------- | -------------------------------------- |
| Night         | `#121110` | `oklch(0.178 0.003 67.7)` | `.dark --background`                   |
| Char          | `#1D1B19` | `oklch(0.224 0.005 67.6)` | `.dark --card`, `--popover`, sidebar   |
| Orange lifted | `#F0794A` | `oklch(0.705 0.159 41.4)` | `.dark --brand`, `--primary`, `--ring` |

## Contrast checks (computed)

| Pair                            | Ratio | Verdict                                  |
| ------------------------------- | ----- | ---------------------------------------- |
| White on Bookly Orange          | 3.48  | Under AA text (4.5): accepted, buttons   |
| Bookly Orange on Paper          | 3.29  | Under AA text: accepted, links           |
| Bookly Orange on Peach          | 2.96  | Under AA text: accepted, active nav item |
| Bookly Orange on white          | 3.48  | Passes 3:1 for UI parts and large text   |
| Ink on Paper                    | 16.07 | AAA                                      |
| Ink on Peach                    | 14.46 | AAA                                      |
| Orange lifted on Night          | 6.77  | AA text (dark mode links, nav)           |
| Ink/Night text on Orange lifted | 6.77  | AA text (dark mode filled buttons)       |

**One orange (founder, 2026-10-25).** The UI matches the mocks exactly: buttons, links, active
nav text and warnings are all Bookly Orange `#E85D2C`, as drawn. This replaced the earlier
two-orange rule (a deeper Ember, `#B93E10`, for anything carrying small text), which kept WCAG
AA text contrast but did not look like the concepts. The trade-off is deliberate and recorded:
white labels on orange measure 3.48:1 and orange text on Peach 2.96:1, so the e2e axe scans
disable `color-contrast`; every other axe rule still runs. Revisit before any customer contract
that requires WCAG AA (public sector, EAA), where a deeper step (`#CC4B1A`, 4.58:1 with white)
is the closest orange that passes.

## Mapping onto today's variables (`apps/web/src/app/globals.css`)

| Variable                                    | Today (light)         | v2 light                                        | v2 dark                                      |
| ------------------------------------------- | --------------------- | ----------------------------------------------- | -------------------------------------------- |
| `--brand`                                   | `oklch(0.72 0.14 55)` | Bookly Orange                                   | Orange lifted                                |
| `--background`                              | white                 | Paper                                           | Night                                        |
| `--foreground`                              | `oklch(0.145 0 0)`    | Ink                                             | `oklch(0.97 0.006 84.6)`                     |
| `--card`, `--popover`                       | white                 | white                                           | Char                                         |
| `--primary`                                 | near-black            | Bookly Orange                                   | Orange lifted                                |
| `--primary-foreground`                      | near-white            | white                                           | Night                                        |
| `--primary-hover`                           | (none)                | Orange hover, `oklch(0.599 0.175 39)`           | Orange lifted further, `oklch(0.77 0.14 43)` |
| `--accent`                                  | `oklch(0.97 0 0)`     | Peach                                           | `oklch(0.28 0.04 40)`                        |
| `--accent-foreground`                       | near-black            | Bookly Orange                                   | Orange lifted                                |
| `--ring`                                    | grey                  | Bookly Orange                                   | Orange lifted                                |
| `--sidebar`                                 | `oklch(0.985 0 0)`    | Sand                                            | Char                                         |
| `--sidebar-primary`                         | near-black            | Bookly Orange                                   | Orange lifted                                |
| `--sidebar-accent`                          | grey                  | Peach                                           | as `--accent`                                |
| neutrals (`--muted`, `--border`, `--input`) | pure grey (chroma 0)  | same lightness, hue ≈ 85, chroma ≤ 0.008 (warm) | same                                         |

Add tokens that do not exist yet: `--ink` (+ ink Button variant: Ink background, white text;
inverts in dark mode), `--apricot`, `--reply`, and semantic `--success`, `--warning`, `--info`
(+ `-foreground`, soft `-muted` variants), registered in the `@theme inline` block. The
concepts' success chip ("Open", "Connected") is `#E8F4E8` with green text: use it as
`--success-muted`.

## Shipped (2026-10-24, `v2-brand-tokens`)

The mapping above is live in `globals.css`, with these additional pairs computed from the
OKLCH values:

| Pair                                              | Ratio              | Verdict              |
| ------------------------------------------------- | ------------------ | -------------------- |
| `muted-foreground` `oklch(0.5 0.008 70)` on Paper | 5.67               | AA text              |
| same on Sand / Peach / white                      | 5.38 / 5.10 / 6.01 | AA text              |
| `success` `#21763C` on Paper / `success-muted`    | 5.36 / 5.03        | AA text              |
| `warning` `#8D5E00` on Paper / `warning-muted`    | 5.30 / 5.00        | AA text              |
| `info` `#1666AA` on Paper / `info-muted`          | 5.66 / 5.35        | AA text              |
| dark `muted-foreground` on Night / Char           | 7.61 / 6.91        | AA text              |
| dark Orange lifted on dark `accent`               | 5.31               | AA text (active nav) |

Neutrals use hue ≈ 70–85 with chroma ≤ 0.008. Charts: Bookly Orange, Reply, Ink, muted, Apricot.

## Shipped (2026-10-24, `v2-design-components-shell`)

`--ink-hover` joins `--primary-hover`: hovers are solid, never a see-through fill. Pairs the
components pass added:

| Pair                                                                 | Ratio        | Verdict                   |
| -------------------------------------------------------------------- | ------------ | ------------------------- |
| white on `ink-hover` `oklch(0.33 0.004 70)`                          | 12.22        | AAA (ink button, hovered) |
| Night on dark `ink-hover` `oklch(0.88 0.008 84.6)`                   | 13.15        | AAA                       |
| `muted-foreground` / Ink on the active agenda card (Peach 55%)       | 5.51 / 15.65 | AA text                   |
| dark `muted-foreground` on the active agenda card                    | 6.35         | AA text                   |
| Orange on Peach (⌘K highlighted row, `accent` chip, avatar initials) | 2.96         | Under AA: accepted        |
| white on orange (unread count in the sidebar)                        | 3.48         | Under AA: accepted        |

## How to check a new pair

Relative luminance with sRGB linearisation, ratio (L1 + 0.05) / (L2 + 0.05). Record the pair
and its ratio in this file when a new token pairing ships.
