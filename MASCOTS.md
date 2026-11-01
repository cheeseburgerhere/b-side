# Making a B-side mascot

With Claude Code, the easiest way is to ask for one ("make me a pixel mascot
of …") or run `/b-side:vibe-mascot`: the plugin ships a
[`vibe-mascot` skill](skills/vibe-mascot/SKILL.md) with a pixel-art kit, a
preview renderer, a studio with a pixel editor, two worked examples and a
list of what works and what doesn't. The [README](README.md#your-own-mascot)
says what to expect. This file is the contract for drawing one by hand.

A mascot is one animated SVG file. The mod shows it at the top of the
`/soundtrack pane` and tells it how to dance: which **mood**, how fast (the
**beat**) and in what **color** (the current vibe's). The built-in one, Bop,
is a 20×20 pixel sprite; `mascots/bop.svg` is a working example of everything
below. The terminal can't draw SVG, so it shows a kaomoji in the mascot's place.

## Where it goes

```
%USERPROFILE%\.claude\vibe\
  mascots\
    your-name.svg  ← yours: lowercase letters, digits and hyphens
```

Plugin updates leave this folder alone. The pane looks there first, then in
the plugin's own `mascots/` folder, which holds the built-in `bop.svg`.

Pick it with the plugin's `mascot` option (the file name without `.svg`), in
`/config` or in `~/.claude/settings.json`:

```json
"pluginConfigs": { "b-side@b-side": { "options": { "mascot": "your-name" } } }
```

The mascot file is read again each time you run `/soundtrack pane`, so after
editing it, reopen the pane. After changing the `mascot` option itself, run
`/reload-plugins`. An unknown or broken file falls back to the built-in mascot.

## The contract

**Canvas.** Any square `viewBox`. The root's `width` and `height` set the drawn
size: `<svg viewBox="0 0 32 32" width="128" height="128" xmlns="http://www.w3.org/2000/svg">`.
For pixel art, add `shape-rendering="crispEdges"` and keep the size a whole
multiple of the grid (Bop: 20 cells at 80 px; the Miso example: 32 cells at
128 px, 4 px per cell for both). Stay between about 64 and 160 px.

**Leave the root's `class` and `style` empty.** The mod sets them on every redraw:

| The mod sets               | Meaning                                         |
| -------------------------- | ----------------------------------------------- |
| `class="m-bounce"`         | the mood: `m-bounce`, `m-sway`, `m-bang` or `m-sleep`, plus `motion-always` when the user wants motion despite reduced motion |
| `style="--beat: 0.5s"`     | seconds per beat (0.5s = 120 BPM); a mood default when the BPM is unknown |
| `style="--vibe: #7F77DD"`  | the current vibe's color, as a hex value        |

So your CSS selects on the mood and reads the variables:

```css
.m-bounce .body { animation: bounce var(--beat) infinite; }
.m-sleep  .zz   { opacity: 1; }
.hair           { fill: var(--vibe, #7F77DD); }   /* always give a fallback */
```

`var()` only works in CSS. An attribute like `fill="var(--vibe)"` is ignored,
so give the shape a class and color it in your `<style>`.

**The four moods.** Make all four. Each needs to look different at a glance.
The mood comes from how the track feels, which Haiku judges once per track
whatever the genre (grunge can be aggressive, a metal ballad calm):

| Class      | When                                                        | Suggested motion                          |
| ---------- | ----------------------------------------------------------- | ----------------------------------------- |
| `m-bang`   | aggressive: angry, loud, distorted, shouted or relentless   | fast head snap down, slower rebound       |
| `m-sway`   | calm: soft, slow or gentle                                  | slow pendulum rock, one swing per 2 beats |
| `m-bounce` | any other music                                             | squash-and-stretch hop, once per beat     |
| `m-sleep`  | silence (nothing playing)                                   | slow breathing and floating Z's, ignores `--beat` |

`m-bang` is the intense mood, not a required headbang: show whatever
intensity suits the mascot.

## Rules

- **No scripts.** `<script>` and `on…=` attributes are stripped, and the SVG
  runs in a sandboxed frame. Animate with CSS `@keyframes` in a `<style>` inside
  the file.
- **Self-contained.** No external images, fonts, links or `@import`: draw with
  shapes and paths only.
- **At most 131,072 characters** (the pane's hard limit). Aim for under 20 KB.
- **Animate `transform` and `opacity` only**, and set `transform-box: fill-box`
  with a sensible `transform-origin` (feet for hops, neck for head turns).
- **Respect reduced motion, unless the user opted out.** On Windows, turning
  off Animation effects asks for reduced motion. The plugin's `motion` option
  set to `always` adds `motion-always` to the root's class, so scope the rule:
  ```css
  @media (prefers-reduced-motion: reduce) { svg:not(.motion-always) * { animation: none !important; } }
  ```
- **Readable in light and dark themes.** The pane background can be either, so
  outline with a mid-tone and don't rely on pure black or white.
- **Give it a `<title>`.** It becomes the alt text.
- **Art you have the rights to.** Only add drawings you made or may share.
  B-side won't bundle recognizable copyrighted characters.

## Tips for an anime look at 120 px

- Chibi proportions: the head takes about half the height; skip fingers and noses.
- Big eyes with a white highlight top-left; blush ovals at half opacity.
- Separate groups for parts that move on their own: `body`, `head`, `arm-l`,
  `arm-r`, `hair`, `ahoge`, `face`. Pivot each at its joint.
- Let hair and the ahoge lag a little behind the head
  (`animation-delay: calc(var(--beat) * -0.15)`) for cheap follow-through.
- Swap eyes per mood: open and sparkly for bounce, `^ ^` for sway, `> <` for
  bang, closed arcs for sleep.
- Small effects sell the mood: sparkles when swaying, speed lines and a sweat
  drop when headbanging, Z's when asleep.

## Starter template

```svg
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <title>My mascot</title>
  <style>
    .shirt { fill: var(--vibe, #7F77DD); }
    .rig, .head { transform-box: fill-box; transform-origin: 50% 100%; }
    .zz { opacity: 0; }
    .m-bounce .rig { animation: hop var(--beat, .5s) ease-in-out infinite; }
    .m-sway   .rig { animation: sway calc(var(--beat, .6s) * 2) ease-in-out infinite alternate; }
    .m-bang   .head { animation: bang calc(var(--beat, .4s) / 2) ease-in infinite alternate; }
    .m-sleep  .rig { animation: breathe 3.6s ease-in-out infinite; }
    .m-sleep  .zz  { opacity: 1; }
    @keyframes hop     { 0%,100% { transform: scale(1.06,.94) } 50% { transform: translateY(-8px) scale(.96,1.05) } }
    @keyframes sway    { from { transform: rotate(-6deg) } to { transform: rotate(6deg) } }
    @keyframes bang    { from { transform: rotate(-4deg) } to { transform: rotate(16deg) } }
    @keyframes breathe { 0%,100% { transform: scale(1,1) } 50% { transform: scale(1.02,.97) } }
    @media (prefers-reduced-motion: reduce) { svg:not(.motion-always) * { animation: none !important; } }
  </style>
  <g class="rig">
    <ellipse class="shirt" cx="60" cy="96" rx="22" ry="16"/>
    <g class="head">
      <circle cx="60" cy="58" r="30" fill="#F4C0D1"/>
      <circle cx="49" cy="58" r="5" fill="#26215C"/><circle cx="47.5" cy="56.5" r="1.6" fill="#fff"/>
      <circle cx="71" cy="58" r="5" fill="#26215C"/><circle cx="69.5" cy="56.5" r="1.6" fill="#fff"/>
    </g>
  </g>
  <text class="zz" x="90" y="30" font-size="14" fill="#888780">z z</text>
</svg>
```

## Checking it before you share it

The quickest check is the studio, which needs only Python. Ask Claude to open
it for your mascot, or run it from the plugin's folder (a clone of the repo,
or the installed copy under `~/.claude/plugins/cache/`):

```bash
python skills/vibe-mascot/scripts/studio/server.py --svg ~/.claude/vibe/mascots/<name>.svg
```

Open `http://127.0.0.1:8765/` to see all four moods dancing side by side, with
buttons to try vibe colors. `/editor.html` lets you fix pixels by clicking: it
keeps an untouched copy and your edits in `~/.claude/vibe/studio/<name>/` and
writes the result into your SVG when you save.

Without it, open the file in a browser and add `class="m-sway" style="--beat:.5s;--vibe:#1D9E75"`
to the root `<svg>` by hand (or in the dev tools). Try each mood and a fast and a slow
beat. Then put it in `~/.claude/vibe/mascots/`, pick it with the `mascot` option
and open `/soundtrack pane`.
