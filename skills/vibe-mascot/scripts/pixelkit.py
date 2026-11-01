"""pixelkit: build animated pixel-art mascots for B-side as SVG.

A mascot is drawn on an N x N grid of cells. Cells are painted into named
*parts* (groups that animate as one: back hair, body, head, a prop), each cell
holding a *color class*. The SVG gets one <rect> per horizontal run of a
class, grouped by class, so a 32x32 character stays around 20-35 KB.

Import it from a builder script next to it:

    from pixelkit import Sprite, rect, ellipse, line, plus
    s = Sprite(32)
    s.paint("head", ellipse(16, 12, 10, 10), "hair")
    ...
    s.outline()               # every part gets its own full outline
    svg = s.svg(style=STYLE, title="My mascot", size=128, layers=[...])

Coordinates are (x, y) cells, x to the right, y down, 0-based.
"""

SIDES = ((1, 0), (-1, 0), (0, 1), (0, -1))

# Rows painted below the frame. A part lifted by an animation (hop, flick)
# then shows these instead of an empty strip at the bottom edge.
OVERHANG = 2


# --- shapes: each returns a set of (x, y) cells -----------------------------

def rect(x0, y0, x1, y1):
    """Every cell from (x0, y0) to (x1, y1), inclusive."""
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


def ellipse(cx, cy, rx, ry, n=64):
    """Cells whose centers fall inside the ellipse. Use .5 centers for even widths."""
    return {
        (x, y)
        for y in range(-OVERHANG, n + OVERHANG)
        for x in range(-OVERHANG, n + OVERHANG)
        if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
    }


def line(x0, y0, x1, y1):
    """A one-cell line, rounded to the grid."""
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    return {(round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps)) for i in range(steps + 1)}


def polygon(points, n=64):
    """Cells whose centers fall inside the polygon: ears, fins, horns, spikes."""
    def inside(px, py):
        hit = False
        for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
            if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
        return hit

    return {(x, y) for y in range(-OVERHANG, n + OVERHANG) for x in range(-OVERHANG, n + OVERHANG) if inside(x + 0.5, y + 0.5)}


def path(points, thick=1):
    """A polyline through `points`, `thick` cells wide to the right: tails, cables, stems."""
    cells = set()
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        for x, y in line(x0, y0, x1, y1):
            cells |= {(x + t, y) for t in range(thick)}
    return cells


def plus(cx, cy):
    """A 5-cell sparkle."""
    return {(cx, cy), (cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)}


def zigzag_bottom(x_from, x_to, tips, floor):
    """Bangs profile: for each column, how far down the hair reaches.

    `tips` is a list of (x, y) points where strands end in a V; between tips
    the edge rises two rows per column, never above `floor`. Returns {x: y}.
    """
    return {x: max([floor] + [round(ty - abs(x - tx) * 2) for tx, ty in tips]) for x in range(x_from, x_to + 1)}


# --- the sprite --------------------------------------------------------------

class Sprite:
    def __init__(self, n):
        self.n = n
        self.parts = {}  # part name -> {cell: color class}, in drawing order

    def part(self, name):
        return self.parts.setdefault(name, {})

    def inside(self, cells):
        return {c for c in cells if 0 <= c[0] < self.n and 0 <= c[1] < self.n + OVERHANG}

    def paint(self, part, cells, cls, only=None):
        """Paint `cells` in `part` with color class `cls`.

        `only` limits painting to cells that already hold one of these classes,
        for details drawn onto existing shapes (strand gaps on hair, shine).
        """
        layer = self.part(part)
        for c in self.inside(cells):
            if only is None or layer.get(c) in only:
                layer[c] = cls

    def shade_edges(self, part, cls, shade, against, sides=SIDES):
        """Recolor `cls` cells to `shade` where a neighbor is in `against`.

        `against` is a set of classes, with None meaning empty. Reads a snapshot,
        so a recolored cell never cascades into its neighbors.
        """
        layer = self.part(part)
        snap = dict(layer)
        everything = self.composite()
        for (x, y), c in snap.items():
            if c == cls and any(everything.get((x + dx, y + dy)) in against for dx, dy in sides):
                layer[(x, y)] = shade

    def composite(self):
        out = {}
        for layer in self.parts.values():
            out.update(layer)
        return out

    def outline(self, cls="outline", parts=None):
        """Give each part its own full outline, carried when the part moves.

        Do this last. Outlining the composite instead leaves seams: when one
        part moves, or a prop is hidden, the shared outline no longer fits.
        """
        for name in parts or list(self.parts):
            layer = self.parts[name]
            for (x, y) in list(layer):
                for dx, dy in SIDES:
                    c = (x + dx, y + dy)
                    if c not in layer and 0 <= c[0] < self.n and 0 <= c[1] < self.n + OVERHANG:
                        layer[c] = cls

    # --- SVG output ---

    def runs(self, cells):
        out = []
        for x, y in sorted(cells, key=lambda c: (c[1], c[0])):
            if out and out[-1][1] == y and out[-1][0] + out[-1][2] == x:
                out[-1][2] += 1
            else:
                out.append([x, y, 1])
        return "".join(f'<rect x="{x}" y="{y}" width="{w}" height="1"/>' for x, y, w in out)

    def by_class(self, cells_to_cls, skip=frozenset()):
        by = {}
        for c, cls in cells_to_cls.items():
            if c not in skip and 0 <= c[0] < self.n and 0 <= c[1] < self.n + OVERHANG:
                by.setdefault(cls, set()).add(c)
        return "".join(f'<g class="{cls}">{self.runs(cells)}</g>' for cls, cells in sorted(by.items()))

    def group(self, name, cells_to_cls=None, skip=frozenset(), inner=""):
        """<g class="name"> holding a part (by default the part of that name)."""
        cells = self.parts.get(name, {}) if cells_to_cls is None else cells_to_cls
        return f'<g class="{name}">{self.by_class(cells, skip)}{inner}</g>'

    def fx(self, name, cls, frames):
        """An effect group: each entry of `frames` becomes a sub-group s1, s2, ...

        Animate the sub-groups out of step (`.m-bounce .s2{animation-delay:...}`)
        for twinkles and flashes.
        """
        inner = "".join(f'<g class="{cls} s{i + 1}">{self.runs(self.inside(cells))}</g>' for i, cells in enumerate(frames))
        return f'<g class="{name}">{inner}</g>'

    def svg(self, body, style, title, size):
        """The finished SVG. `size` should be a whole multiple of the grid (n x 4)."""
        return (
            f'<svg viewBox="0 0 {self.n} {self.n}" width="{size}" height="{size}" '
            'xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">'
            f"<title>{title}</title><style>{style}</style>{body}</svg>\n"
        )
