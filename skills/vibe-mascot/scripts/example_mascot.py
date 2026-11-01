"""Example: Miso, an original 32x32 mascot built with pixelkit: a ginger tabby
cat in headphones, sitting, with a curled tail.

    python example_mascot.py out.svg

Copy this file to start a new mascot of any kind. It shows the techniques that
carry over to every type: back-to-front parts, polygons for angular shapes,
edge shading, per-mood faces, secondary motion on appendages (here ears and
tail; on a person it would be hair, on an object antennae or a cable),
effects, per-part outlines and layered step animation. Nothing here is
specific to cats except the shapes.
"""
import os
import sys

from pixel_overrides import apply_overrides
from pixelkit import Sprite, ellipse, line, path, plus, polygon, rect

N = 32
s = Sprite(N)

# Parts, back to front. Each animates as a unit and carries its own outline.
# `ears` is drawn inside the head group (below), so it rides along with every
# head move and can still flop on its own: nest an appendage in what it is
# attached to.
for name in ("tail", "body", "ears", "head"):
    s.part(name)

# --- tail: an appendage behind the body, its base hidden, so it can wag.
tail = [(21, 28), (25, 27), (28, 24), (29, 20), (28, 16), (26, 14)]
s.paint("tail", path(tail, thick=2), "fur")
s.paint("tail", path(tail[-2:], thick=2), "belly")                         # light tip
s.paint("tail", {(26, 26), (28, 22), (29, 18)}, "fur-dark", only={"fur"})  # tabby rings

# --- body: sitting, cropped by the frame, cream belly and front paws.
s.paint("body", ellipse(16, 27.5, 8.5, 6), "fur")
s.paint("body", ellipse(16, 28.5, 4.5, 4.5), "belly")
s.paint("body", rect(11, 29, 13, N + 1) | rect(19, 29, 21, N + 1), "belly")
s.paint("body", {(12, 31), (20, 31)}, "fur-dark")                         # toe gaps

# --- ears: polygons, pink inside.
s.paint("ears", polygon([(4, 11), (6, 0), (15, 7)]) | polygon([(17, 7), (26, 0), (28, 11)]), "fur")
s.paint("ears", polygon([(6, 8), (7, 2.5), (12, 6.5)]) | polygon([(20, 6.5), (25, 2.5), (26, 8)]), "ear-inner")

# --- head: big and round (the face is what reads at 128 px).
s.paint("head", ellipse(16, 14.5, 11, 9.5), "fur")
s.paint("head", ellipse(16, 18.5, 6.5, 4.5), "belly")                      # muzzle
for x0, y0, y1 in ((14, 7, 9), (16, 6, 9), (18, 7, 9)):                    # forehead stripes
    s.paint("head", line(x0, y0, x0, y1), "fur-dark", only={"fur"})
s.paint("head", {(5, 14), (6, 15), (26, 15), (27, 14)}, "fur-dark", only={"fur"})  # cheek stripes
s.paint("head", line(7, 19, 9, 19) | line(7, 21, 9, 20) | line(22, 19, 24, 19) | line(22, 20, 24, 21), "whisker", only={"fur", "belly"})
# Headphones: band over the crown in the vibe color, cups on the sides.
s.paint("head", line(6, 11, 9, 5) | line(9, 5, 23, 5) | line(23, 5, 26, 11), "band")
s.paint("head", rect(3, 11, 6, 17) | rect(26, 11, 29, 17), "cup")
s.paint("head", rect(3, 11, 3, 17) | rect(29, 11, 29, 17), "cup-dark")
# Soft shading on the lower edge of the head, against the body.
s.shade_edges("head", "fur", "fur-dark", against={None}, sides=((0, 1),))

s.outline()

# --- faces, one group per mood, toggled by opacity.
NOSE = {(15, 18): "nose", (16, 18): "nose"}
EYES = [(10, 13), (19, 13)]  # top-left of each 4x5 eye


def round_eye(ex, ey, lid=0):
    """Round cat eye with a big shine; `lid` rows covered by a heavy lid."""
    rows = [
        [None, "pupil", "pupil", None],
        ["shine", "shine", "pupil", "pupil"],
        ["shine", "iris", "pupil", "pupil"],
        ["iris", "iris", "iris", "pupil"],
        [None, "iris", "iris", None],
    ]
    cells = {}
    for dy, row in enumerate(rows):
        for dx, cls in enumerate(row):
            if cls and dy >= lid:
                cells[(ex + dx, ey + dy)] = cls
    if lid:
        cells.update({(ex + dx, ey + lid - 1): "lid" for dx in range(4)})
    return cells


def arc_eye(ex, ey, up):
    """^ when up (happy), u when down (asleep)."""
    if up:
        return {(ex, ey + 3): "lash", (ex + 1, ey + 2): "lash", (ex + 2, ey + 2): "lash", (ex + 3, ey + 3): "lash"}
    return {(ex, ey + 2): "lash", (ex + 1, ey + 3): "lash", (ex + 2, ey + 3): "lash", (ex + 3, ey + 2): "lash"}


def merge(*maps):
    out = {}
    for m in maps:
        out.update(m)
    return out


W_MOUTH = {c: "mouth" for c in {(13, 19), (14, 20), (15, 19), (16, 19), (17, 20), (18, 19)}}
faces = {
    "f-open": merge(*(round_eye(*e) for e in EYES), NOSE, W_MOUTH),
    "f-happy": merge(*(arc_eye(*e, up=True) for e in EYES), NOSE,
                     {c: "mouth" for c in rect(14, 19, 17, 20)}, {(15, 20): "tongue", (16, 20): "tongue"},
                     {c: "blush" for c in {(8, 18), (9, 18), (22, 18), (23, 18)}}),
    "f-cool": merge(*(round_eye(*e, lid=2) for e in EYES), NOSE,
                    {c: "mouth" for c in {(14, 19), (15, 20), (16, 20), (17, 19)}}),
    "f-sleep": merge(*(arc_eye(*e, up=False) for e in EYES), NOSE, {(15, 20): "mouth", (16, 20): "mouth"}),
}

effects = (
    s.fx("fx-spark", "spark", [plus(2, 4), plus(2, 24), plus(29, 2)])
    + s.fx("fx-zz", "zz", [rect(26, 0, 29, 0) | {(28, 1), (27, 2)} | rect(26, 3, 29, 3), rect(29, 5, 31, 5) | {(30, 6)} | rect(29, 7, 31, 7)])
    + s.fx("note", "note", [rect(2, 0, 2, 4) | {(3, 0), (3, 1), (4, 1), (4, 2)} | rect(0, 4, 1, 5) | {(2, 5)}])
)
speed = s.fx("fx-speed", "speed", [line(0, 6, 2, 11) | line(29, 6, 31, 11), line(1, 3, 3, 8) | line(28, 3, 30, 8)])

# Colors live in CSS classes (var() only works in CSS). Motion is steps(1) and
# whole cells. Appendages lag a quarter cycle at most: half a cycle reads as a trail.
STYLE = """
.band,.note,.spark,.speed,.zz{fill:var(--vibe,#7F77DD)}
.outline{fill:#412402}
.fur{fill:#EF9F27}.fur-dark{fill:#BA7517}.belly{fill:#FAEEDA}.ear-inner{fill:#F4C0D1}.whisker{fill:#FFFFFF}
.cup{fill:#444441}.cup-dark{fill:#2C2C2A}
.pupil{fill:#173404}.iris{fill:#639922}.shine{fill:#FFFFFF}.lid{fill:#BA7517}.lash{fill:#412402}
.nose{fill:#D4537E}.mouth{fill:#712B13}.tongue{fill:#ED93B1}.blush{fill:#F4C0D1}
.f-happy,.f-cool,.f-sleep,.fx-spark,.fx-speed,.fx-zz,.note{opacity:0}
.m-bounce .f-open,.m-bang .f-open,.m-sleep .f-open{opacity:0}
.m-bounce .f-happy,.m-bounce .fx-spark,.m-sway .note,.m-bang .f-cool,.m-bang .fx-speed,.m-sleep .f-sleep,.m-sleep .fx-zz{opacity:1}
.m-bounce .rig{animation:hop var(--beat,.5s) steps(1) infinite}
.m-bounce .ears{animation:hop var(--beat,.5s) steps(1) calc(var(--beat,.5s)*-.25) infinite}
.m-bounce .tail{animation:wag var(--beat,.5s) steps(1) infinite}
.m-bounce .s1{animation:blink var(--beat,.5s) steps(1) infinite}
.m-bounce .s2{animation:blink var(--beat,.5s) steps(1) calc(var(--beat,.5s)*-.5) infinite}
.m-bounce .s3{animation:blink calc(var(--beat,.5s)*2) steps(1) infinite}
.m-sway .rig{animation:wag calc(var(--beat,.75s)*2) steps(1) infinite}
.m-sway .head{animation:wag calc(var(--beat,.75s)*2) steps(1) calc(var(--beat,.75s)*-.5) infinite}
.m-sway .tail{animation:wag calc(var(--beat,.75s)*2) steps(1) calc(var(--beat,.75s)*-.5) infinite}
.m-sway .note{animation:float calc(var(--beat,.75s)*2) steps(1) infinite}
.m-bang .rig{animation:hop var(--beat,.35s) steps(1) infinite}
.m-bang .head{animation:nod calc(var(--beat,.35s)/2) steps(1) infinite}
.m-bang .ears{animation:flick calc(var(--beat,.35s)/2) steps(1) calc(var(--beat,.35s)*-.12) infinite}
.m-bang .tail{animation:wag calc(var(--beat,.35s)/2) steps(1) infinite}
.m-bang .s1{animation:blink calc(var(--beat,.35s)/2) steps(1) infinite}
.m-bang .s2{animation:blink calc(var(--beat,.35s)/2) steps(1) calc(var(--beat,.35s)*-.25) infinite}
.m-sleep .rig{animation:hop 3.6s steps(1) infinite}
.m-sleep .s1,.m-sleep .s2{animation:float 2.4s steps(1) infinite}
.m-sleep .s2{animation-delay:-1.2s}
@keyframes hop{50%{transform:translateY(-1px)}}
@keyframes wag{0%{transform:translateX(-1px)}50%{transform:translateX(1px)}}
@keyframes nod{50%{transform:translateY(2px)}}
@keyframes flick{50%{transform:translateY(-1px)}}
@keyframes float{50%{transform:translateY(-1px)}}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){svg:not(.motion-always) *{animation:none!important}}
""".strip()

head = (
    '<g class="head">'
    + s.group("ears")
    + s.by_class(s.parts["head"])
    + "".join(s.group(name, cells) for name, cells in faces.items())
    + "</g>"
)
body = speed + '<g class="rig">' + s.group("tail") + s.group("body") + head + "</g>" + effects
svg = s.svg(body, STYLE, title="Miso, the example mascot", size=128)
# Hand edits from the studio's pixel editor (studio/server.py) go on last, so
# rebuilding never loses them. Name the file after the mascot's SVG.
svg = apply_overrides(svg, os.path.join(os.path.dirname(os.path.abspath(__file__)), "miso_overrides.json"))
open(sys.argv[1], "w", encoding="utf-8").write(svg)
print(f"wrote {sys.argv[1]}: {len(svg)} characters")
