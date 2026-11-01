# Lessons from the first B-side mascots

These come from making Bop (a 20×20 blob kid), a personal fan-art mascot of
an anime girl with long hair and a guitar (32×32, about ten rounds of user
feedback), Miso (a 32×32 cat), and a second personal fan-art character in a
uniform and peaked cap with long silver hair (32×32, about fifteen rounds,
reviewed in the browser studio), in the Claude Code Desktop app on Windows.
Each failure has what you see, why, and what fixed it.

The general sections apply to every mascot. "Characters with hair" applies
only when the mascot has hair, and that is where most attempts went wrong.

## What worked, for any mascot

- **Pixel art at 4 px per cell.** The pane's look is retro (mono text,
  colored dividers). A smooth vector mascot (a 25 KB SVG with 39 inked paths)
  clashed with it.
- **Generating the SVG from a builder script.** Shapes are painted into
  parts, runs of one color merge into one `<rect>`, and colors are CSS
  classes. A 32×32 mascot with four faces and effects comes to 20-35 KB.
  Every tweak is an edit and a re-run, never a hand edit of the SVG.
- **Exaggerating 3-5 identity features** and dropping the rest: oversized
  accessories with a darker edge so they read as 3D, big eyes, a prop in one
  solid color with a light edge on top and right only.
- **A crop that gives the face room**: chest-up for characters (the user
  asked for "no legs"), sitting with the body cropped for animals.
- **A different face per mood**, built from the character's own reactions
  (happy `^ ^` with an open mouth, a neutral stare, a half-lidded smirk, a
  gloom face with a shadow band and hollow eyes). Shapes differ per mood,
  not only colors.
- **Effects per mood** in the vibe color: twinkling sparkles, a floating
  note, speed lines, wobble marks, Z's.
- **Layered motion with a per-part outline**: the whole figure in `.rig`,
  plus a head that bobs or nods on its own, appendages (hair, ears, tail)
  following a quarter cycle late, a prop strumming off-beat. Every part
  carries its own full outline, and parts are painted two rows below the
  frame, so nothing opens a seam or a gap when it moves.
- **Nesting an appendage in what it's attached to** (ears inside the head
  group): it follows every head move and can still flop on its own.
- **`steps(1)` and whole-cell moves.** Smooth easing on pixel art looks
  blurry and floaty; stepped motion looks like sprite animation.
- **Previewing as a PNG** with `scripts/preview.py` (standard library only),
  then reading the image. It caught a cascade bug, a prop over the mouth, a
  missing fill and thin ears before the user saw them.
- **Re-reading the mascot when the pane opens**, so editing an SVG needs a
  pane reopen, not a plugin reload.
- **Reviewing motion in the studio** (`scripts/studio/server.py`) before the
  pane: all four moods animate side by side in the browser pane, so the user
  can judge motion without switching music, and can mark screenshots in red.
- **Parts swapped per mood**: a cap on for sway, off for bounce, pulled down
  over the eyes for sleep; a windswept hair set only in bang. Each piece is
  its own part with `.m-<mood>` opacity rules, so a mood can change the
  silhouette, not just the face.
- **Alternatives from one builder**: a variant name as a second argument
  built four bang poses side by side; the user picked one and the others
  stayed one argument away.
- **Proving nothing else changed**: after splitting parts or moving code,
  building the old and new version and comparing them with `cmp` (identical
  bytes, or identical preview PNGs) showed the other moods were untouched.
- **Letting the user hand-edit** in the studio's pixel editor. Edits go to
  `<name>_overrides.json` and the builder applies them last, so they survive
  every later change to the builder.

## What didn't work, for any mascot

### An example that copied the last character
- Seen: "the original mascot looks unnecessarily similar to [the fan-art character]'s design".
- Why: the first template was made by recoloring the fan-art builder: same
  face shape, bangs, pose and guitar. Every mascot made from it would have
  looked like a cousin of that character.
- Fix: the template is a different kind of mascot (Miso, a cat), and the
  workflow starts from the mascot's type (SKILL.md, step 2), not from hair.

### Too small a canvas for a character
- Seen: "it doesn't even look like her".
- Why: at 20×20, eyes are 2 cells and accessories 2 pixels. Nothing
  identifying survives.
- Fix: 32×32 for anything with several identity features. 20×20 is fine for
  a simple shape (Bop).

### Seams and broken edges while moving ("jagged")
- Seen: animation looked jagged; parts separated mid-dance.
- Why: the outline was computed once on the composite of all parts and drawn
  as a static layer. When the head or hair moved, its edge left the outline.
  A prop hidden in three moods was counted in the composite, so the outline
  had holes where the prop would be.
- Fix: every part gets its own full outline inside its own group
  (`Sprite.outline()`), so the outline travels with the part.

### Everything moving as one piece
- Seen: "now it just moves up and down, not really lively".
- Why: to fix the seams, the whole figure was moved as one rigid block.
- Fix: per-part outlines make separate motion safe. Bring back head motion
  and appendage follow-through.

### An appendage leaving a trail
- Seen: "it leaves traces behind it".
- Why: the back hair's animation delay was half its cycle, so it always sat
  on the opposite side of the body, 2 cells off.
- Fix: lag a quarter cycle at most, or move the appendage with the rig and
  let only the head lag.

### A frozen mascot
- Seen: the mascot is drawn and colored by the vibe but never moves.
- Why: Windows had "Animation effects" off (Settings → Accessibility → Visual
  effects). The Desktop app reports that as `prefers-reduced-motion`, and the
  mascot's reduced-motion rule stopped every animation.
- Check: `SystemParametersInfo(0x1042)` (SPI_GETCLIENTAREAANIMATION) returns
  false. In PowerShell:
  `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, ref bool c, uint d);'; $on=$false; [void][W.U]::SystemParametersInfo(0x1042,0,[ref]$on,0); $on`
- Fix: the plugin option `motion: always` adds `motion-always` to the root,
  and every mascot scopes its rule as `svg:not(.motion-always) *`. Keep the
  default (`auto`) respecting the OS setting.

### A stale mascot after editing the SVG
- Seen: "it still shows the old one" after `/reload-plugins`.
- Why: the mod read the mascot once at session start, and `/reload-plugins`
  only restarts a mod whose code changed. Only the SVG had changed.
- Fix: `/soundtrack pane` re-reads the file on every open.

### The mascot sleeping while music plays
- Seen: sleep mood with a track clearly playing, right after a reload.
- Why: B-side stops polling in idle sessions (no turn in 10 minutes). A
  reload resets the activity clock, and slash commands are not turns.
- Fix: an open pane counts as activity, and `/soundtrack` polls at once.

### `fill="var(--vibe)"`
- Seen: vibe-colored parts stayed the fallback color.
- Why: CSS variables are not resolved in SVG presentation attributes.
- Fix: a class with `{fill:var(--vibe,#hex)}` in the `<style>`.

### A class with no fill
- Seen (in the preview): a part missing; in the pane it would be black.
- Why: a color class used in the drawing but never given a fill in the CSS.
  SVG's default fill is black.
- Fix: every class a builder paints needs a CSS fill. A part missing from
  the preview sheet means a missing fill.

### An edge color that swallowed the shape
- Seen: a guitar body came out almost entirely in its light edge color.
- Why: edge detection recolored cells while iterating the same dict, so a
  recolored neighbor counted as "outside" and the color cascaded inward.
- Fix: detect edges on a snapshot (`Sprite.shade_edges` does). A full ring
  of gold also read as a "yellow donut": edge only the top and right.

### Shapes hidden behind the head
- Seen: the cat's ears were thin spikes with no pink inside.
- Why: the ear triangles were drawn behind the head, which covered most of
  them.
- Fix: size appendages for the part that stays visible, then check the
  preview.

### A prop over the face
- Seen: a guitar neck crossed the mouth.
- Why: the prop was moved in front of the head and its line ran through the
  chin.
- Fix: keep props below the chin and away from the eyes.

### Fixed pane size
- Seen: blurry, uneven pixels for a 32-cell mascot.
- Why: the pane forced 80 px, 2.5 px per cell.
- Fix: the pane uses the mascot's own `width`/`height`: a whole multiple of
  the grid.

### A side-by-side page that hid parts
- Seen: "other variants don't show her hair".
- Why: four variants were inlined into one HTML page. An inline SVG's
  `<style>` is page-global, so one variant's `.m-bang .back{opacity:0}` hid
  the hair of every other variant on the page.
- Fix: one mascot per iframe (`srcdoc`), as the pane does. The studio does
  this.

### Details too small to read
- Seen: "the crystal doesn't show" and "even I cannot understand that she
  gives commands".
- Why: a 2-pixel device on the collar and a mouth opening and shutting were
  meant to say "commanding over a radio link". At 128 px nobody can read that.
- Fix: carry an idea with the silhouette (a pose, an arm, hair, a hat), not
  with a few pixels.

### A mood that doesn't suit the character
- Seen: "bang doesn't fit her character", then "the salute still needs work".
- Why: headbanging suits a guitarist, not a reserved officer. A salute fit
  but was static.
- Fix: ask what fits, and offer moments from the character's own story. The
  one the user chose was a frame from the show's opening: eyes shut, hair
  streaming in the wind.

### Faces that read as the wrong emotion
- Seen: sleep "looks like she is crying"; then a peaceful doze "is boring";
  a smile lifted at one corner read as smug; open eyes were "too big".
- Fix: sleep that belongs to the character (asleep on duty, cap pulled down
  over the eyes, head nodding off). A graceful smile is a small, symmetric
  closed curve with lighter corner pixels, plus gently lowered lids, a pale
  iris and a faint lower lash. Keep eyes 3-4 cells wide and 3 rows tall on a
  32-cell head, with one clear row between the eyes and the mouth.

### Shell patches that failed to parse
- Seen: `unexpected EOF while looking for matching '` from a long patch.
- Why: Git Bash choked on a large heredoc full of quotes and backslashes.
- Fix: write the patch as a script file, then run it; or use the Edit tool.

### The terminal's invisible Svg
- Seen: the terminal pane showed an empty box instead of the kaomoji.
- Why: the terminal's element table includes an `Svg` that draws nothing.
- Fix: check `e.surface !== 'terminal'` (done in the pane's code).

## Characters with hair

### What worked
- **Strand bangs**: a zigzag bottom edge (`zigzag_bottom`) with V tips over
  the eyes, a longer tip between the eyes, dark gap lines fanning up to the
  crown, a shadow row where hair meets skin, short shine dashes near the
  crown. Faces skip hair cells, so the bangs stay in front of the eyes.
- **Straight back hair plus shorter front locks**: one straight curtain from
  the widest point of the head to the bottom edge, behind the body; separate
  shorter locks over the shoulders, ending in uneven tips.
- **Three-quarter view**: near eye 5 wide, far eye 4, mouth and chin shifted
  toward the far side, accessories on the near side.
- **Big anime eyes**: a lash row with a one-cell wing at the outer corner, a
  dark iris on top fading lighter below, a 2-3 cell white shine top-left, a
  small glint low, a dark pupil block.

- **Hair in parts that join the face**: crown and bangs as one part, front
  locks as another, each outlined only where it meets nothing it joins (no
  line between hair and face). A mood can then hide them and show a
  different set, such as windswept hair, without touching the other moods.
- **Windswept hair that still looks like the character**: the usual crown
  silhouette, a full fringe still over the forehead with tips leaning one
  way (long slope on one side, short on the other), about five evenly
  spaced strands that start low on the crown at slightly different heights
  and stop above the eyes, back strands streaming off the edge at one angle,
  and the colored lock running down the side.

### What didn't
- **Thin strands for windswept bangs.** Three 1-pixel strands over a bare
  forehead read as a slicked-back style. The fringe has to stay on the face.
- **A lifted crown.** Sweeping the top of the head into the wind lost the
  character ("the crown should stay similar to her original design").
- **Too many strands, starting too high, crossing the eyes.** Seven strands
  from the top of the crown were "too messy" and hid the face. Five, starting
  low and stopping above the eyes, worked.
- **Flat bangs.** A solid block with one-cell stubs read as a helmet ("you
  messed up the bangs"). Use the strand technique above.
- **Side hair that steps in and out.** Locks on the head that stopped at the
  chin plus a separate long-hair block of a different width below ("her
  hair doesn't fall straight"). Use one straight curtain and separate front
  locks.

## Environment notes (Windows, Desktop app)

- `/config` is not available in the Desktop app: plugin options go in
  `~/.claude/settings.json` under `pluginConfigs["b-side@<marketplace>"].options`, the key as
  `enabledPlugins` names it.
- Some machines block bare `python` with a shim: use `uv run python`.
- A local HTML file opened in the browser pane is a static snapshot and
  can't be screenshotted: render a PNG with `scripts/preview.py` instead.
- Mod render errors are not in the Desktop app's logs. If a pane goes blank,
  reproduce it with `claude plugin test` and real data before guessing.
- Desktop text cuts long lines at the end: put the important part first.
- The browser pane can't screenshot a local HTML file, but it can show the
  studio, which is served from 127.0.0.1.
