---
name: vibe-mascot
description: "Make, edit or fix an animated pixel-art mascot for the B-side /soundtrack pane (an SVG in ~/.claude/vibe/mascots/ that dances in four moods). Any kind of mascot, whether a character, an animal, an object or a creature. Use when someone asks for a new mascot, wants an existing one to look or move differently, wants to hand-edit a mascot's pixels or watch it dance in a browser, or reports a mascot that is frozen, stale, misdrawn or leaves trails."
---

# Making a B-side mascot

A mascot is one SVG file. The pane draws it at the top of `/soundtrack pane`
and tells it, on its root element, which **mood** to show and how fast and in
what color to dance. Build mascots with code, never by hand-editing hundreds
of `<rect>`s: this skill's `scripts/` folder holds a small kit and two worked
examples.

Where things go. The plugin's own folder is replaced on every update, so
nothing the user makes goes there:

| What | Where |
| --- | --- |
| The mascot SVG the pane loads | `~/.claude/vibe/mascots/<name>.svg` (`%USERPROFILE%\.claude\vibe\mascots\`) |
| Its builder and hand edits | `~/.claude/vibe/mascot-src/make_<name>.py`, `<name>_overrides.json` |
| The kit (`<kit>` below) | this skill's `scripts/` folder, inside the installed plugin |

`<name>` is lowercase letters, digits and hyphens. Builders import the kit, so
run them with `PYTHONPATH=<kit>`; the studio does that itself.

Read `LESSONS.md` beside this file before drawing anything. It lists, with
the symptom, the cause and the fix, everything that went wrong while the
first mascots were made, and most of it will go wrong again if skipped.

## The contract (what the pane does, what the SVG must do)

The pane replaces the first `<svg` of the file with
`<svg class="<mood>[ motion-always]" style="--beat:<s>s;--vibe:<hex>"`.

| On the root      | Values                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| mood class       | `m-bounce` (most music), `m-sway` (calm), `m-bang` (aggressive), `m-sleep` (silence) |
| `motion-always`  | present when the user set the plugin option `motion` to `always`        |
| `--beat`         | seconds per beat: bounce 0.5, sway 0.75, bang 0.35 (BPM is not known)  |
| `--vibe`         | the current vibe's color as hex                                        |

So the SVG must:

1. Leave the root's `class` and `style` empty.
2. Put every color in a CSS class inside its own `<style>`. `var(--vibe)` works
   only in CSS; `fill="var(--vibe)"` as an attribute is ignored.
3. Style each mood with `.m-<mood> .part{...}` selectors.
4. Scope reduced motion so the user's opt-out works:
   `@media (prefers-reduced-motion:reduce){svg:not(.motion-always) *{animation:none!important}}`
5. Have a `<title>` (used as alt text) and no `<script>`, no `on…=`, no
   external images, fonts or links. It runs in a script-less sandboxed frame.
6. Stay under 131,072 characters (the pane's hard limit). 20-35 KB is normal.
7. Set its own drawn size with `width`/`height` on the root, a whole multiple
   of the grid: 20 cells at 80 px, 32 cells at 128 px (4 px per cell).
8. Stay inside what the terminal pane can read (MASCOTS.md, "In the
   terminal"): it redraws the SVG as half-block cells itself, so motion is
   `steps(1)` translates in whole px and opacity blinks; rotation, scaling
   and easing show only as the resting pose there. The kit's builders
   already write that subset. Over 20 pixels tall, the terminal draws the
   mascot at half size.

The mood comes from how the track feels, which Haiku judges once per track
whatever its genre: aggressive (angry, loud, distorted, shouted; grunge can
be, a metal ballad isn't) → `m-bang`; calm → `m-sway`; any other music →
`m-bounce`; nothing playing → `m-sleep`. `m-bang` means intense, not
"headbang": a custom mascot may show whatever it likes per mood (one
character mascot shows a gloomy face in silence instead of sleeping).

## The workflow

1. **Pin down what the mascot is, and its 3-5 identity features.** Ask what
   makes it recognizable at 128 px, exaggerate exactly those, and drop
   everything else. A mascot can be anything that can have a face or a
   pose; the user's idea decides, not the examples here. If the user shares
   other artists' art, use it for direction only (proportions, outline
   style, how a feature is drawn): never copy their pixels, and never put a
   copyrighted character into a build that is shared or published.

2. **Find its type in this table.** It says which parts to split (each part
   animates on its own) and what can carry secondary motion, which is what
   makes a mascot feel alive rather than a sticker that bounces.

   | Type | Typical identity features | Parts, back to front | Secondary motion |
   | --- | --- | --- | --- |
   | Humanoid / anime character | hair shape and color, eyes, one accessory, outfit, a held item | `hair-back`, `body`, `head` (face, bangs, front locks), `prop` | head bob/nod, hair follow-through, prop strum |
   | Animal | ears, markings, tail, muzzle, eye color | `tail`, `body`, `ears` (nested in head), `head` | ears flop, tail wag, head tilt |
   | Object (cassette, speaker, vinyl, headphones, plant) | silhouette, one signature detail (reels, cone, label, grooves) | `back` (cable, stand), `body`, `face` (a face drawn on it), `moving bits` | reels/disc steps, cone pulse, antenna/leaf wiggle |
   | Creature / blob / robot | silhouette, one odd feature (horn, antenna, visor, glow) | `back`, `body`, `head`, `appendage` | squash and stretch, antenna wobble, glow blink |

   Mascots without a face still need four readable moods: change the pose,
   the effects and the speed instead of the expression.

3. **Choose the canvas.**
   - 20×20 for a simple shape with few features (Bop): use
     `scripts/example_charmap.py`, one letter per cell.
   - 32×32 for anything with several features or a face that must emote:
     use `scripts/pixelkit.py`, with `scripts/example_mascot.py` (Miso, a
     cat) as the template. Crop at the chest or seat for characters: the
     face and the identity features need the room more than legs do.
   Draw at 4 px per cell: 80 px for 20 cells, 128 px for 32.

4. **Copy the template** to a builder for the new mascot,
   `~/.claude/vibe/mascot-src/make_<name>.py`, and replace the shapes. Keep the
   builder: every later tweak is an edit and a re-run; the SVG is a build
   output. Keep the template's last step, `apply_overrides(svg,
   "<name>_overrides.json")`: it applies the user's hand edits from the
   studio (step 10), so rebuilding never loses them.

5. **Draw back to front**, one part per thing that moves on its own. Nest an
   appendage inside what it is attached to (ears inside the head), so it
   follows that part's motion and can still move on its own. Kit tools:
   `rect`, `ellipse`, `polygon` (ears, fins, horns), `path` (tails, cables,
   stems), `line`, `zigzag_bottom` (hair or fringe edges), `paint(...,
   only=...)` to draw details onto existing shapes, `shade_edges` for shadows
   and edges. Call `s.outline()` once at the end, so every part carries its
   own outline. For characters with hair, follow "Characters with hair" in
   LESSONS.md: hair is where most attempts went wrong.

6. **One face (or pose) per mood**, as groups toggled with opacity rules:
   `f-open` by default, plus whatever fits the character for bounce, bang and
   sleep. Reactions read best when they differ in shape, not just in color:
   closed `^ ^` eyes, half-lidded eyes, an open mouth, a shadow band, blank
   eyes. Faces drawn on a character with bangs use `skip=` the hair cells.
   - Fit the mood to the character, not the other way round. When the
     default doesn't suit them (a reserved character headbanging), ask, and
     offer moments from their own story: a signature scene, a gesture, a
     running gag. Big silhouette changes read at 128 px; small details (a
     2-pixel gem, a mouth that opens and shuts) don't.
   - A mood may swap whole parts, not just faces: an accessory on or off, a
     hat pulled down for sleep, windswept hair for bang. Make each swappable
     piece its own part and hide or show it with `.m-<mood> .part{opacity:…}`.
     Scope every such rule to a mood, so the other moods keep their parts.
   - When the user is unsure about a mood, build alternatives instead of
     arguing for one: let the builder take a variant name as a second
     argument (`make_<name>.py out.svg salute`), build each to its own file,
     and show them side by side. Keep the variant the user liked before: "the
     old one was better" happens often, and a revert should be one argument.

7. **Effects** with `s.fx(name, cls, frames)`: sparkles, notes, speed lines,
   Z's, wobble marks, sweat drops. Frames become `s1`, `s2`… to animate out of
   step. Give effects the vibe color.

8. **Motion**: `steps(1)` keyframes and whole-cell moves (pixel art should
   step, not glide). The whole figure sits in a `.rig` group that hops or
   sways on the beat; on top of that:
   - the head bobs, tilts or nods on its own (up to 2 cells for a headbang);
   - appendages (hair, ears, tail, antenna) follow at most a quarter cycle
     late; half a cycle puts them on the opposite side and reads as a trail;
   - props and moving bits run slightly off-beat.

9. **Build and look at it** before showing anyone:
   ```bash
   cd ~/.claude/vibe/mascot-src
   PYTHONPATH=<kit> python make_<name>.py ../mascots/<name>.svg
   python <kit>/preview.py ../mascots/<name>.svg sheet.png
   ```
   then read `sheet.png` (bounce, sway, bang, sleep left to right). For a
   close-up of one mood, import it and set `preview.MOODS = ["m-bang"]`
   before `preview.main()`. On machines where a shim blocks bare `python`,
   run `uv run python`. The preview shows resting poses only: to see the
   motion, run the studio and open its all-moods page in the browser pane:
   ```bash
   python <kit>/studio/server.py --svg ../mascots/<name>.svg --build make_<name>.py
   ```
   It shows each mood animating in its own frame, with vibe-color buttons.
   Users review from screenshots and often mark problems in red: map the
   marks to cells by lining them up with features you know (the eye row,
   the mouth), then redraw along them.
   After a refactor that should change nothing visible, build the old and
   the new version and compare them with `cmp`: it proves the other moods
   are untouched.

10. **Hand edits.** When the user wants to fix pixels themselves, send them to
    the studio's `/editor.html`: paint, erase and pick colors per mood, undo,
    then save, which writes `<name>_overrides.json` and rebuilds. Each pixel
    belongs to a part and moves with it; the editor says which part and which
    moods show it. A mascot without a builder works too (omit `--build`): the
    studio keeps an untouched copy and the edits in
    `~/.claude/vibe/studio/<name>/` and writes the result into the SVG. After
    the user edits, read their overrides file and the rebuilt preview before
    changing anything else, and say if an edit looks accidental (a lone pixel
    far from the rest).

11. **Install it** for the user: the file is already in
   `~/.claude/vibe/mascots/` (the pane looks there first, then in the
   plugin's own `mascots/`, then falls back to Bop), and the plugin option
   `mascot` names it (without `.svg`). In the Desktop app,
   where `/config` is unavailable, that is `~/.claude/settings.json`:
   ```json
   "pluginConfigs": { "b-side@<marketplace>": { "options": { "mascot": "<name>" } } }
   ```
   with the key as it appears under `enabledPlugins` in the same file
   (`b-side@b-side` for an install from GitHub).
   Ask before editing the user's settings. After changing the option, the
   user runs `/reload-plugins`. After editing only the SVG, reopening
   `/soundtrack pane` is enough: the pane re-reads the file on every open.

12. **Check it live**: ask the user to open the pane while music plays and
    confirm the motion, in the desktop app and, if they use one, a terminal
    session. If nothing moves at all, see "Frozen mascot" in LESSONS.md
    before touching the art.

## Files in this skill

| File                          | What it is                                                     |
| ----------------------------- | -------------------------------------------------------------- |
| `LESSONS.md`                  | What worked and what didn't, with causes and fixes. Read first. |
| `scripts/pixelkit.py`         | Shapes (rect, ellipse, polygon, path, line), parts, shading, per-part outlines, SVG output. |
| `scripts/example_mascot.py`   | Miso: an original 32×32 cat in headphones; the template to copy. |
| `scripts/example_charmap.py`  | Bop: the built-in 20×20 mascot from character maps.            |
| `scripts/preview.py`          | PNG sheet of all four moods, standard library only.           |
| `scripts/pixel_overrides.py`  | Applies hand edits to a finished SVG; builders call it last.   |
| `scripts/studio/`             | `server.py` + `site/`: all moods animating, and a pixel editor, for any mascot. Local only. |

`MASCOTS.md` at the plugin's root is the user-facing version of the contract, for people
drawing a mascot by hand.
