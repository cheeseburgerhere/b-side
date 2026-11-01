"""Hand-painted pixel edits, applied to a finished pixelkit mascot SVG.

The studio (studio/server.py) writes them; a builder applies them last:

    svg = apply_overrides(svg, os.path.join(os.path.dirname(os.path.abspath(__file__)), "<name>_overrides.json"))

so every rebuild keeps them. NO_PIXEL_OVERRIDES=1 builds without them (the
studio paints on that). The edits file maps a group key to cell edits:

    {"bangs": {"12,5": "hair-dark", "13,5": null}, "fx-spark|s1": {"2,4": "spark"}}

A key names the part group that owns the pixels (the <g> holding the color
groups), plus any frame classes such as `s1` on effect frames. A color class
paints that cell in the part; null erases it from the part. Edits ride inside
their part, so they move with it. Keys that a build doesn't have are skipped.
"""
import json
import os
import re
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
G, RECT, STYLE = f"{{{SVG_NS}}}g", f"{{{SVG_NS}}}rect", f"{{{SVG_NS}}}style"
ET.register_namespace("", SVG_NS)


def color_classes(style):
    out = set()
    for sel in re.findall(r"([.\w,-]+)\{fill:", style):
        out |= {c.strip(".") for c in sel.split(",")}
    return out


def containers(root, colors):
    """(key, owner, container, color) for every <g> that holds rects directly."""
    parent = {child: g for g in root.iter() for child in g}
    for g in root.iter(G):
        if g.find(RECT) is None:
            continue
        classes = g.get("class", "").split()
        color = next((c for c in classes if c in colors), None)
        frame = " ".join(sorted(c for c in classes if c not in colors))
        owner = parent[g]
        key = owner.get("class", "") + (f"|{frame}" if frame else "")
        yield key, owner, g, color, frame


def runs(cells):
    out = []
    for x, y in sorted(cells, key=lambda c: (c[1], c[0])):
        if out and out[-1][1] == y and out[-1][0] + out[-1][2] == x:
            out[-1][2] += 1
        else:
            out.append([x, y, 1])
    return out


def apply_overrides(svg, path):
    if os.environ.get("NO_PIXEL_OVERRIDES") or not os.path.exists(path):
        return svg
    edits = json.load(open(path, encoding="utf-8"))
    if not edits:
        return svg
    root = ET.fromstring(svg)
    colors = color_classes(root.find(STYLE).text or "")
    by_key = {}
    for key, owner, g, color, frame in containers(root, colors):
        by_key.setdefault(key, []).append((owner, g, color, frame))
    for key, cells in edits.items():
        entries = by_key.get(key)
        if not entries:
            continue
        owner, frame = entries[0][0], entries[0][3]
        grid = {}
        for _, g, color, _ in entries:
            for r in g.findall(RECT):
                x, y, w = int(r.get("x")), int(r.get("y")), int(r.get("width"))
                for i in range(w):
                    grid[(x + i, y)] = color
        for xy, cls in cells.items():
            x, y = map(int, xy.split(","))
            if cls is None:
                grid.pop((x, y), None)
            elif cls in colors:
                grid[(x, y)] = cls
        at = list(owner).index(entries[0][1])
        for _, g, _, _ in entries:
            owner.remove(g)
        by_color = {}
        for c, cls in grid.items():
            by_color.setdefault(cls, set()).add(c)
        for i, (cls, cs) in enumerate(sorted(by_color.items())):
            g = ET.Element(G, {"class": f"{cls} {frame}".strip()})
            for x, y, w in runs(cs):
                ET.SubElement(g, RECT, {"x": str(x), "y": str(y), "width": str(w), "height": "1"})
            owner.insert(at + i, g)
    return ET.tostring(root, encoding="unicode").replace(" />", "/>") + "\n"
