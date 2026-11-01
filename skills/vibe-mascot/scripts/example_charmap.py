# Example: Bop, the built-in 20x20 mascot, drawn from character maps (one
# letter per cell). The simplest way to make a small mascot; see
# example_mascot.py for the layered 32x32 approach. Usage: python example_charmap.py out.svg
import sys

W = 20
BODY = [
    "....................",
    "....................",
    "....................",
    ".......HHHHHH.......",
    ".....HH......HH.....",
    "....H..BBBBBB..H....",
    "...CC.BBBBBBBB.CC...",
    "...CCBBBBBBBBBBCC...",
    "...CCBBBBBBBBBBCC...",
    "...CCBBBBBBBBBBCC...",
    "....BPBBBBBBBBPB....",
    ".....BBBBMMBBBB.....",
    "......BBBBBBBB......",
    ".....DDDDDDDDDD.....",
    "....D.DDDDDDDD.D....",
    "......DDDDDDDD......",
    "......LL....LL......",
    "......LL....LL......",
    "....................",
    "....................",
]
assert len(BODY) == 20 and all(len(r) == W for r in BODY)

# class per character; colors live in CSS so --vibe can reach them
CLASS = {"H": "band", "C": "cup", "B": "skin", "P": "blush", "M": "mouth", "D": "shirt", "L": "leg"}
HEAD_ROWS = range(3, 13)

def runs(cells):
    """Merge horizontal runs of (x, y) cells into rects."""
    out, cells = [], sorted(cells, key=lambda c: (c[1], c[0]))
    for x, y in cells:
        if out and out[-1][1] == y and out[-1][0] + out[-1][2] == x:
            out[-1][2] += 1
        else:
            out.append([x, y, 1])
    return "".join(f'<rect x="{x}" y="{y}" width="{w}" height="1"/>' for x, y, w in out)

def layer(rows, chars):
    return [(x, y) for y in rows for x in range(W) if BODY[y][x] in chars]

def group(cls, cells):
    return f'<g class="{cls}">{runs(cells)}</g>'

def by_class(rows):
    parts = []
    for ch, cls in CLASS.items():
        cells = layer(rows, ch)
        if cells:
            parts.append(group(cls, cells))
    return "".join(parts)

eyes_open = group("eye", [(8, 8), (12, 8), (7, 9), (8, 9), (11, 9), (12, 9)]) + group("shine", [(7, 8), (11, 8)])
eyes_bang = group("eye", [(7, 8), (8, 9), (7, 10), (12, 8), (11, 9), (12, 10)])
eyes_shut = group("eye", [(7, 9), (8, 9), (11, 9), (12, 9)])
note = group("note", [(3, 3), (4, 3), (2, 4), (4, 4), (2, 5), (1, 6), (2, 6)])
zz = group("zz", [(15, 1), (16, 1), (17, 1), (16, 2), (15, 3), (16, 3), (17, 3)]) + group(
    "zz small", [(18, 4), (19, 4), (18, 5), (19, 5)]
)

STYLE = """
.band,.zz{fill:var(--vibe,#7F77DD)}
.cup{fill:#534AB7}.skin{fill:#FAD7C8}.blush{fill:#ED93B1}.mouth,.eye{fill:#26215C}
.shine{fill:#FFFFFF}.shirt{fill:#AFA9EC}.leg{fill:#5F5E5A}.note{fill:var(--vibe,#7F77DD)}
.bang,.shut,.zz{opacity:0}
.m-bounce .rig{animation:hop var(--beat,.5s) steps(1) infinite}
.m-bounce .note,.m-sway .note{animation:float calc(var(--beat,.5s)*2) steps(1) infinite}
.m-sway .rig{animation:sway calc(var(--beat,.75s)*2) steps(1) infinite}
.m-bang .rig{animation:hop var(--beat,.35s) steps(1) infinite}
.m-bang .head{animation:bang calc(var(--beat,.35s)/2) steps(1) infinite}
.m-bang .open,.m-sleep .open{opacity:0}
.m-bang .bang{opacity:1}
.m-bang .note,.m-sleep .note{opacity:0}
.m-sleep .shut,.m-sleep .zz{opacity:1}
.m-sleep .rig{animation:hop 3.6s steps(1) infinite}
.m-sleep .zz{animation:float 2.4s steps(1) infinite}
@keyframes hop{50%{transform:translateY(-1px)}}
@keyframes sway{0%{transform:translateX(-1px)}50%{transform:translateX(1px)}}
@keyframes bang{50%{transform:translateY(1px)}}
@keyframes float{50%{transform:translateY(-1px)}}
@media (prefers-reduced-motion:reduce){svg:not(.motion-always) *{animation:none!important}}
""".strip()

svg = (
    '<svg viewBox="0 0 20 20" width="80" height="80" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">'
    "<title>Bop, the B-side mascot</title>"
    f"<style>{STYLE}</style>"
    '<g class="rig">'
    f'<g class="head">{by_class(HEAD_ROWS)}'
    f'<g class="open">{eyes_open}</g><g class="bang">{eyes_bang}</g><g class="shut">{eyes_shut}</g></g>'
    f"{by_class(range(13, 20))}"
    "</g>"
    f"{note}{zz}"
    "</svg>\n"
)
open(sys.argv[1], "w", encoding="utf-8").write(svg)
print(len(svg), "characters")
