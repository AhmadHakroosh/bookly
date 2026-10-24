# v2 token sheet (02 mark, concept palette)

Colours sampled from the UI and marketing concepts in `planning/v2/concepts/` (dominant pixel
colours of buttons, nav, cards and backgrounds). OKLCH computed from the hex with the standard
sRGB → OKLab transform. Contrast is WCAG 2.x relative luminance.

## Brand colours

| Name          | Hex       | OKLCH                     | Sampled from                                 | Use                                       |
| ------------- | --------- | ------------------------- | -------------------------------------------- | ----------------------------------------- |
| Bookly Orange | `#E85D2C` | `oklch(0.651 0.183 38.6)` | Logo, "Review recap", "Complete your review" | Mark, `--brand`, fills, icons, large type |
| Ember         | `#B93E10` | `oklch(0.535 0.167 37.9)` | Derived (darker step of Bookly Orange)       | `--primary`, orange text, button labels   |
| Peach         | `#FBE9DF` | `oklch(0.946 0.024 51.2)` | Active nav, selected card, recap card        | `--accent`, selected rows                 |
| Apricot       | `#FCDCC2` | `oklch(0.914 0.050 61.2)` | "In 15 min" chip                             | Time chips, soft highlights (Ink text)    |
| Reply         | `#F5B6A0` | `oklch(0.829 0.080 40.1)` | Bookly Orange 55% toward white               | Second bubble of the mark, illustration   |
| Ink           | `#1C1C1C` | `oklch(0.226 0.000 89.9)` | "Create", "Join meeting", headings           | `--foreground`, ink button                |
| Paper         | `#FAF8F4` | `oklch(0.980 0.006 84.6)` | Page background (app and site)               | `--background`                            |
| Sand          | `#F4F2EE` | `oklch(0.962 0.006 84.6)` | Sidebar                                      | `--sidebar`, secondary surfaces           |

The marketing concepts render the orange slightly hotter (`#FC5014` on "Review & send"); treat
that as rendering noise and use Bookly Orange everywhere.

Dark mode was **retired** on 2026-10-25 (light only, as the concepts) and its tokens were removed
from `globals.css` (Phase 2.5). These values are a record only; a dark brand surface (logo on
dark, CTA bands) uses `--ink`:

| Name          | Hex       | OKLCH                     | Use                                    |
| ------------- | --------- | ------------------------- | -------------------------------------- |
| Night         | `#121110` | `oklch(0.178 0.003 67.7)` | `.dark --background`                   |
| Char          | `#1D1B19` | `oklch(0.224 0.005 67.6)` | `.dark --card`, `--popover`, sidebar   |
| Orange lifted | `#F0794A` | `oklch(0.705 0.159 41.4)` | `.dark --brand`, `--primary`, `--ring` |

## Contrast checks (computed)

| Pair                            | Ratio | Verdict                                       |
| ------------------------------- | ----- | --------------------------------------------- |
| White on Bookly Orange          | 3.48  | **Fails AA text.** Large text / UI parts only |
| Bookly Orange on Paper          | 3.28  | Large display type, icons, mark only          |
| Bookly Orange on Peach          | 2.95  | Fails: never orange text on Peach             |
| White on Ember                  | 5.59  | AA text: filled orange buttons                |
| Ember on Paper                  | 5.27  | AA text: links, orange labels                 |
| Ember on Peach                  | 4.74  | AA text: active nav item                      |
| Ember on Apricot                | 4.30  | Fails AA text: use Ink on Apricot             |
| Ink on Paper                    | 16.07 | AAA                                           |
| Ink on Peach                    | 14.46 | AAA                                           |
| Orange lifted on Night          | 6.77  | AA text (dark mode links, nav)                |
| Ink/Night text on Orange lifted | 6.77  | AA text (dark mode filled buttons)            |

**The two-orange rule.** Bookly Orange is the colour people remember; Ember is the colour that
carries small text. A filled primary button is Ember with white text (the concepts' look,
one step deeper). Large hero type ("Bookly keeps it moving.") may use Bookly Orange because it
is large text (≥ 24 px regular or ≥ 18.66 px bold needs 3:1).

## Mapping onto today's variables (`apps/web/src/app/globals.css`)

| Variable                                    | Today (light)         | v2 light                                        | v2 dark                                      |
| ------------------------------------------- | --------------------- | ----------------------------------------------- | -------------------------------------------- |
| `--brand`                                   | `oklch(0.72 0.14 55)` | Bookly Orange                                   | Orange lifted                                |
| `--background`                              | white                 | Paper                                           | Night                                        |
| `--foreground`                              | `oklch(0.145 0 0)`    | Ink                                             | `oklch(0.97 0.006 84.6)`                     |
| `--card`, `--popover`                       | white                 | white                                           | Char                                         |
| `--primary`                                 | near-black            | Ember                                           | Orange lifted                                |
| `--primary-foreground`                      | near-white            | white                                           | Night                                        |
| `--primary-hover`                           | (none)                | Ember darkened, `oklch(0.48 0.155 37.9)`        | Orange lifted further, `oklch(0.77 0.14 43)` |
| `--accent`                                  | `oklch(0.97 0 0)`     | Peach                                           | `oklch(0.28 0.04 40)`                        |
| `--accent-foreground`                       | near-black            | Ember                                           | Orange lifted                                |
| `--ring`                                    | grey                  | Bookly Orange                                   | Orange lifted                                |
| `--sidebar`                                 | `oklch(0.985 0 0)`    | Sand                                            | Char                                         |
| `--sidebar-primary`                         | near-black            | Ember                                           | Orange lifted                                |
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

| Pair                                                                | Ratio        | Verdict                   |
| ------------------------------------------------------------------- | ------------ | ------------------------- |
| white on `ink-hover` `oklch(0.33 0.004 70)`                         | 12.22        | AAA (ink button, hovered) |
| Night on dark `ink-hover` `oklch(0.88 0.008 84.6)`                  | 13.15        | AAA                       |
| `muted-foreground` / Ink on the active agenda card (Peach 55%)      | 5.51 / 15.65 | AA text                   |
| dark `muted-foreground` on the active agenda card                   | 6.35         | AA text                   |
| Ember on Peach (⌘K highlighted row, `accent` chip, avatar initials) | 4.74         | AA text                   |
| white on Ember (unread count in the sidebar)                        | 5.58         | AA text                   |

## How to check a new pair

Relative luminance with sRGB linearisation, ratio (L1 + 0.05) / (L2 + 0.05). Record the pair
and its ratio in this file when a new token pairing ships.
