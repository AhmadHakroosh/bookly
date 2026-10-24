"""Builds the Bookly mark (logo exploration 02), the wordmark and every lockup as SVG.

Usage: python build.py <Geist variable font, .ttf or .woff2>
Needs fontTools (and brotli for .woff2). Writes the SVGs to brand/ and marks.json next to this
file, then prints the path strings for apps/web/src/components/brand/logo.tsx. Run render.mjs
afterwards for the PNGs, favicons and the press kit. See brand/README.md.
"""

import json
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

ORANGE = "#E85D2C"
REPLY = "#F5B6A0"
INK = "#1C1C1C"
PAPER = "#FAF8F4"
WHITE = "#FFFFFF"

# The mark on a grid where the b is 66 wide and the bowl sits on y = 81 (the baseline).
# Stem: x 0..28, rounded top (r 6). Bowl: y 28..81 to x 66, right corners r 23.
# Tail: the stem runs on below the bowl to a point at the lower left.
B = (
    "M6 0H22A6 6 0 0 1 28 6V28H43A23 23 0 0 1 66 51V58A23 23 0 0 1 43 81H22"
    "L2.4 98.2Q0 100.2 0 96.8V6A6 6 0 0 1 6 0Z"
)
# The reply: a rounded bubble behind and to the right, tail pointing down-right.
REPLY_BODY = (
    "M55 40H75A22 22 0 0 1 97 62V65A22 22 0 0 1 75 87H55A22 22 0 0 1 33 65V62"
    "A22 22 0 0 1 55 40Z"
)
REPLY_TAIL = "M72 85L88.6 99.4Q90.8 101 90.4 98.3L88 79Z"
GAP = 5  # stroke width of the knockout between the b and the reply (2.5 each side)
MARK_BOX = (-3.5, -1.5, 104, 104)  # square, content centred


def mark_group(b_fill, reply_fill, mask_id, reply_opacity=None):
    # Opacity on the group, not the paths, so the body and tail don't double up where they meet.
    op = f' opacity="{reply_opacity}"' if reply_opacity else ""
    return (
        f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="130" height="130">'
        f'<rect x="-10" y="-10" width="130" height="130" fill="#fff"/>'
        f'<path d="{B}" fill="#000" stroke="#000" stroke-width="{GAP}" stroke-linejoin="round"/>'
        f"</mask>"
        f'<g mask="url(#{mask_id})" fill="{reply_fill}"{op}>'
        f'<path d="{REPLY_BODY}"/><path d="{REPLY_TAIL}"/></g>'
        f'<path d="{B}" fill="{b_fill}"/>'
    )


# Wordmark: "bookly" in Geist at weight 800, tracking -2%, drawn as one path.
font = instancer.instantiateVariableFont(TTFont(FONT), {"wght": 800})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
# Height of the ascender ("l" top) and the descender ("y" bottom) in font units.

bp = BoundsPen(gs)
gs[cmap[ord("l")]].draw(bp)
l_top = bp.bounds[3]
bp = BoundsPen(gs)
gs[cmap[ord("y")]].draw(bp)
y_bottom = bp.bounds[1]

# Scale so the wordmark's ascender equals the mark's height above the baseline (81).
scale = 81 / l_top
track = -0.02 * upm
pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
x = 0.0
for ch in "bookly":
    name = cmap[ord(ch)]
    # SVG y grows downwards: flip, and put the baseline at y = 81.
    tp = TransformPen(pen, (scale, 0, 0, -scale, x * scale, 81))
    gs[name].draw(tp)
    x += gs[name].width + track
word = pen.getCommands()
word_width = (x - track) * scale
word_bottom = 81 - y_bottom * scale


def svg(viewbox, body, title="Bookly"):
    vb = " ".join(f"{v:g}" for v in viewbox)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


files = {}
files["bookly-mark.svg"] = svg(MARK_BOX, mark_group(ORANGE, REPLY, "g"))
files["bookly-mark-reversed.svg"] = svg(MARK_BOX, mark_group(WHITE, WHITE, "g", 0.55))
files["bookly-mark-mono.svg"] = svg(MARK_BOX, mark_group(INK, INK, "g", 0.35))

# Horizontal lockup: mark, gap of 0.4 mark widths, wordmark on the same baseline.
gap = 26
wx = 97 + gap
lock_w = wx + word_width
lock_h = max(101, word_bottom)
pad = 8
lock_box = (-pad, -pad, lock_w + 2 * pad, lock_h + 2 * pad)


def lockup(b, r, w, op=None, bg=None):
    rect = (
        f'<rect x="{lock_box[0]}" y="{lock_box[1]}" width="{lock_box[2]:.2f}" height="{lock_box[3]:.2f}" fill="{bg}"/>'
        if bg
        else ""
    )
    return rect + mark_group(b, r, "g", op) + f'<path transform="translate({wx} 0)" d="{word}" fill="{w}"/>'


files["bookly-logo.svg"] = svg(lock_box, lockup(ORANGE, REPLY, INK))
files["bookly-logo-reversed.svg"] = svg(lock_box, lockup(WHITE, WHITE, WHITE, 0.55))
files["bookly-logo-on-ink.svg"] = svg(lock_box, lockup(ORANGE, REPLY, WHITE, None, INK))

# Stacked lockup: mark centred above the wordmark.
s_w = max(word_width, 97)
mark_x = (s_w - 97) / 2
word_y = 101 + 24
stack_h = word_y + word_bottom
stack_box = (-pad, -pad, s_w + 2 * pad, stack_h + 2 * pad)
files["bookly-logo-stacked.svg"] = svg(
    stack_box,
    f'<g transform="translate({mark_x:.2f} 0)">{mark_group(ORANGE, REPLY, "g")}</g>'
    f'<path transform="translate({(s_w - word_width) / 2:.2f} {word_y})" d="{word}" fill="{INK}"/>',
)

# App icon: Bookly Orange rounded square, white b, translucent reply. 120 grid, mark at 60%.
tile = 120
k = 0.6 * tile / 104
ox = (tile - 104 * k) / 2 - MARK_BOX[0] * k
oy = (tile - 104 * k) / 2 - MARK_BOX[1] * k
icon_body = (
    f'<rect width="{tile}" height="{tile}" rx="27" fill="{ORANGE}"/>'
    f'<g transform="translate({ox:.2f} {oy:.2f}) scale({k:.4f})">{mark_group(WHITE, WHITE, "g", 0.55)}</g>'
)
files["bookly-icon.svg"] = svg((0, 0, tile, tile), icon_body)
# Full-bleed square (maskable / apple-touch): no rounded corners, platform rounds them.
files["bookly-icon-square.svg"] = svg(
    (0, 0, tile, tile),
    icon_body.replace(f'rx="27" ', ""),
)

for name, body in files.items():
    with open(f"{OUT}/{name}", "w") as fh:
        fh.write(body)

with open(f"{HERE}/marks.json", "w") as fh:
    json.dump(
        {
            "b": B,
            "replyBody": REPLY_BODY,
            "replyTail": REPLY_TAIL,
            "gap": GAP,
            "markBox": MARK_BOX,
            "word": word,
            "wordWidth": round(word_width, 2),
            "wordBottom": round(word_bottom, 2),
            "lockGap": gap,
        },
        fh,
        indent=1,
    )
print(f"wrote {len(files)} SVGs to {OUT}")
print(f'MARK.b = "{B}"')
print(f'MARK.replyBody = "{REPLY_BODY}"')
print(f'MARK.replyTail = "{REPLY_TAIL}"')
print(f"WORDMARK width {word_width:.2f}, bottom {word_bottom:.2f}, path in marks.json")
