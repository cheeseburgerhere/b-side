"""Render a pixel mascot SVG to a PNG sheet: one still frame per mood.

    python preview.py mascot.svg sheet.png [--scale 8]

Left to right: m-bounce, m-sway, m-bang, m-sleep. Pure standard library, no
installs. It understands what pixelkit mascots use:
  - <rect> cells inside nested <g class="..."> groups,
  - fills from one-class CSS rules, `.a,.b{fill:#hex}` or `{fill:var(--vibe,#hex)}`
    (the fallback hex stands in for the vibe color),
  - visibility from opacity rules: `.x{opacity:0}` hides x in every mood,
    `.m-bang .x{opacity:1}` shows it in one mood, later rules win.
It draws the resting pose only: animations (transforms, blinks) are ignored, so
check motion live in the pane. Read the PNG to look at the sprite closely.
"""
import re
import struct
import sys
import zlib

MOODS = ["m-bounce", "m-sway", "m-bang", "m-sleep"]


def visibility_rules(style):
    """[(mood or None, class, visible)] in source order."""
    rules = []
    for selectors, value in re.findall(r"([^{}]+)\{opacity:([01])\}", style):
        for sel in selectors.split(","):
            words = sel.strip().split()
            if len(words) == 1 and words[0].startswith("."):
                rules.append((None, words[0][1:], value == "1"))
            elif len(words) == 2 and words[0].startswith(".m-"):
                rules.append((words[0][1:], words[1][1:], value == "1"))
    return rules


def is_visible(classes, mood, rules):
    for cls in classes:
        shown = True
        for rule_mood, rule_cls, value in rules:
            if rule_cls == cls and rule_mood in (None, mood):
                shown = value
        if not shown:
            return False
    return True


def main():
    args = sys.argv[1:]
    scale = 8
    if "--scale" in args:
        i = args.index("--scale")
        scale = int(args[i + 1])
        del args[i : i + 2]
    src_path, out_path = args
    src = open(src_path, encoding="utf-8").read()
    style = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
    fills = {}
    for sel, col in re.findall(r"([.\w,-]+)\{fill:(?:var\(--vibe,)?(#[0-9A-Fa-f]{6})", style):
        for cls in sel.split(","):
            fills[cls.strip(".")] = col
    rules = visibility_rules(style)
    n = int(re.search(r'viewBox="0 0 (\d+)', src).group(1))
    side, gap = n * scale, 2 * scale
    width = len(MOODS) * (side + gap) - gap
    page, bg = (30, 30, 29), (42, 41, 40)
    img = [[page] * width for _ in range(side)]

    for m, mood in enumerate(MOODS):
        ox = m * (side + gap)
        for y in range(side):
            for x in range(side):
                img[y][ox + x] = bg
        stack = []
        for tok in re.finditer(r'<g class="([^"]+)">|</g>|<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/>', src):
            if tok.group(1):
                stack.append(tok.group(1).split())
                continue
            if tok.group(0) == "</g>":
                stack.pop()
                continue
            if not is_visible([c for g in stack for c in g], mood, rules):
                continue
            col = next((fills[c] for g in reversed(stack) for c in g if c in fills), None)
            if not col:
                continue
            rgb = tuple(int(col[i : i + 2], 16) for i in (1, 3, 5))
            x, y, w, h = map(int, tok.group(2, 3, 4, 5))
            for yy in range(max(0, y * scale), min((y + h) * scale, side)):
                for xx in range(max(0, x * scale), min((x + w) * scale, side)):
                    img[yy][ox + xx] = rgb

    raw = b"".join(b"\0" + bytes(c for px in row for c in px) for row in img)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, side, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    open(out_path, "wb").write(png)
    print(f"wrote {out_path}: {', '.join(MOODS)}")


if __name__ == "__main__":
    main()
