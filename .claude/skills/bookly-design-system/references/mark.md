# The mark: construction, lockups, pipeline

The first vector of the 02 mark, drawn 2026-10-24 from the brand sheet (no source vector
existed). Geometry and the generator live in `brand/source/build.py`; this file explains them.

## Grid

Units are abstract; the b is 66 wide and its bowl sits on the baseline at y = 81.

| Part       | Geometry                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Stem       | x 0–28, y 0 to the tail; top corners r 6                                                                                               |
| Bowl       | y 28–81, x 0–66; right corners r 23 (nearly a semicircle, as on the sheet)                                                             |
| Tail (b)   | the stem's left edge runs on to a rounded point at (≈1, 99); its right edge meets the bowl at x 22                                     |
| Reply      | rounded bubble x 33–97, y 40–87, r 22, behind the b                                                                                    |
| Reply tail | point at (≈90, 100), leaving the bubble's lower right                                                                                  |
| Gap        | the b is knocked out of the reply with a 5-unit outline (2.5 each side), via an SVG mask, so the gap shows whatever is behind the mark |

Square artboard for the mark: `viewBox="-3.5 -1.5 104 104"` (content centred).

Proportions checked against the sheet: stem/b width 0.42, bowl top at 35% of the b height,
reply top at about half the bowl, reply right edge ≈ 1.47 × the b width.

## Wordmark

"bookly", lowercase, Geist at weight 800 with tracking −2%, converted to paths (Geist is SIL
OFL 1.1, which allows this). In lockups the wordmark's ascender ("l") equals the mark's height
above the baseline (81) and shares its baseline, so the b's tail and the "y" descender hang
together. A custom-drawn wordmark (rounder, closer to the sheet) is a possible refinement; if
it is drawn, it replaces the font outlines in `build.py` and nothing else changes.

## Lockups and files (`brand/`)

| File                       | Use                                                         |
| -------------------------- | ----------------------------------------------------------- |
| `bookly-mark.svg`          | The mark on light backgrounds                               |
| `bookly-mark-reversed.svg` | White mark (reply at 55%) on Ink or photos                  |
| `bookly-mark-mono.svg`     | One-colour Ink (reply at 35%) for print, stamps, fax        |
| `bookly-logo.svg`          | Horizontal: orange mark + Ink wordmark (default)            |
| `bookly-logo-on-ink.svg`   | Horizontal on an Ink panel (orange mark, white wordmark)    |
| `bookly-logo-reversed.svg` | Horizontal, all white, transparent background               |
| `bookly-logo-stacked.svg`  | Mark above wordmark (square-ish spaces, press, posters)     |
| `bookly-icon.svg`          | App icon: Bookly Orange tile, white b, translucent reply    |
| `bookly-icon-square.svg`   | Full-bleed icon for platforms that round corners themselves |

PNG exports of each (`brand/png/`), the favicon set in `apps/web/src/app/` and `public/`, and
the press kit zip are generated from these.

## Rules

- **Clear space**: the width of the stem (28 units) on every side.
- **Minimum size**: mark 16 px (use the app icon at 16 px and below, never the bare mark);
  horizontal logo 96 px wide on screen, 25 mm in print.
- Don't recolour outside the palette; don't put the orange mark on orange or busy photos (use
  reversed); don't separate, rotate, mirror or re-proportion the bubbles; don't add effects;
  don't typeset the wordmark.
- Workspace-branded pages may colour the mark with the workspace accent (`LogoMark accent=`);
  the reply is then that accent mixed 45% with white.

## Regenerating

```bash
python3 -m venv /tmp/brand-venv && /tmp/brand-venv/bin/pip install fonttools brotli
/tmp/brand-venv/bin/python brand/source/build.py <Geist variable font .ttf/.woff2>
node brand/source/render.mjs          # PNGs, favicons, press kit zip (uses sharp from apps/web)
```

The Geist variable font comes from github.com/vercel/geist-font (OFL); a built copy also sits
in `apps/web/.next/static/media/` after `pnpm build`. Then copy the new path strings that
`build.py` prints into `apps/web/src/components/brand/logo.tsx` (`MARK` and `WORDMARK`).
