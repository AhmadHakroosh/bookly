# Brand assets

The Bookly mark: a lowercase b drawn as a speech bubble (tail at the lower left) with a lighter
reply bubble behind it (tail at the lower right). Two sides in conversation; the name comes from
the Arabic بُكلة, a buckle, which fastens two sides. The shape is logo exploration 02; the
colours are the v1.0 product palette. Everything here is generated from vectors in `source/`:
don't edit the files by hand.

| File                          | Use                                                             |
| ----------------------------- | --------------------------------------------------------------- |
| `bookly-logo.svg`             | Horizontal logo, orange mark + ink wordmark. The default        |
| `bookly-logo-on-ink.svg`      | Horizontal logo on an Ink panel                                 |
| `bookly-logo-reversed.svg`    | All white, for photos and colour backgrounds                    |
| `bookly-logo-stacked.svg`     | Mark above the wordmark                                         |
| `bookly-mark.svg`             | The mark alone                                                  |
| `bookly-mark-reversed.svg`    | White mark (reply at 55%)                                       |
| `bookly-mark-mono.svg`        | One-colour Ink mark for print                                   |
| `bookly-icon.svg`             | App icon: Bookly Orange tile (also `apps/web/src/app/icon.svg`) |
| `bookly-icon-square.svg`      | Full-bleed icon for platforms that round corners (apple-icon)   |
| `png/*.png`                   | High-resolution PNG of each SVG above                           |
| `bookly-icon-light.png`       | 512×512 icon on white: Stripe Connect icon, app stores, avatars |
| `bookly-icon-dark.png`        | Same on near-black                                              |
| `bookly-logo-light.png`       | 1200×320 logo on white: Stripe Connect logo, receipts           |
| `bookly-logo-dark.png`        | Same on Ink                                                     |
| `bookly-logo-transparent.png` | 1200×320 logo, no background                                    |

The renderer also writes the app's `favicon.ico`, `apple-icon.png`, `public/logo-mark.png`
(email logo, README, JSON-LD), the notification icon and badge, and the press kit served at
`/press` (`apps/web/public/press/`).

Colours: Bookly Orange `#E85D2C` (the mark, buttons, links and highlights), Peach `#FCEAE1`, Ink `#1C1C1C`, Paper `#FAF8F4`, Reply `#F5B6A0`. The wordmark is
Geist Extra Bold (SIL OFL 1.1) converted to outlines.

## Regenerating

```bash
python3 -m venv /tmp/brand-venv && /tmp/brand-venv/bin/pip install fonttools brotli
/tmp/brand-venv/bin/python brand/source/build.py path/to/Geist-variable.woff2
node brand/source/render.mjs
```

`build.py` takes the Geist variable font (github.com/vercel/geist-font, or the copy in
`apps/web/.next/static/media/` after a build) and prints the path strings to paste into
`apps/web/src/components/brand/logo.tsx`. Geometry, clear space and minimum sizes are explained
in `.claude/skills/bookly-design-system/references/mark.md`.
