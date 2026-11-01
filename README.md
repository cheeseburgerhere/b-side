# B-side

A Claude Code mod that notes what music is playing while you code and which
files Claude edited during each track. It's a side channel only: nothing is
added to Claude's context and no prompt is changed.

It runs on Windows 10 or 11 only: it reads the Windows media session with
Windows PowerShell 5.1, which ships with Windows.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install b-side --marketplace cheeseburgerhere/b-side
```

Answer `y` to add the marketplace, then pick a scope (user is the usual one).
From a shell:

```
claude plugin install b-side --marketplace cheeseburgerhere/b-side
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `cheeseburgerhere/b-side`, then Add
plugin.

## What it does

- Every 15 s it runs `nowplaying.ps1` (Windows PowerShell 5.1), which reads the
  Windows media session (Spotify, a browser tab, anything that shows in the
  media flyout).
- The status line shows `title — artist · vibe` while something plays, `silence`
  otherwise.
- Each successful Edit or Write while music plays is logged with the track.
- The first time a track is seen, it gets a 1-3 word vibe label, stored as
  `vibe_guess` with `vibe_source` saying where it came from. Labels are cached,
  so a track is labeled once.
  - With no setup, Claude Haiku guesses it from the title and artist. Haiku
    knows older songs well and often gets very new releases wrong.
  - With Last.fm turned on (below), the top Last.fm listener tag is used, and
    Haiku is the fallback when Last.fm has no tags for the track.
- Media that isn't music (Shorts, vlogs, podcasts, tutorials) gets the label
  `not music`. Nothing is logged while it plays, and anything logged for it
  before is hidden from `/soundtrack` and the pane.
- `/soundtrack` lists this session's tracks in order with the files edited
  during each. `/soundtrack all` shows the top tracks by edit count and the
  vibes you code to most across all sessions. The output is printed as
  transcript notices, which the model never reads.
- `/soundtrack pane` opens a live timeline pane in a retro pixel look. At
  the top, Bop the pixel mascot (or [your own](#your-own-mascot)) dances to
  the current vibe beside a pixel equalizer: it headbangs to aggressive music of any genre, sways to
  calm music, bounces to the rest and sleeps through silence (Haiku judges
  how each track feels, once). Below it, the tracks are listed
  newest first, each on a node in its vibe's color, with the files edited
  while it played. The current track is marked ▶, and the pane redraws as
  tracks change and edits land.

Bop stands still when your system asks for reduced motion (on Windows:
Settings → Accessibility → Visual effects → Animation effects off). To keep
him dancing anyway, set the plugin's `motion` option to `always`: in `/config`
in a terminal session, or in `~/.claude/settings.json`:

```json
"pluginConfigs": { "b-side@b-side": { "options": { "motion": "always" } } }
```

(The key is `b-side@<marketplace>`: `b-side@b-side` when installed as above.)

## Your own mascot

Bop can be swapped for any mascot you like: a character, a pet, an object, a
creature. Each one dances in four moods, picked from how the music feels.

**Ask Claude for one.** The plugin ships a mascot skill,
[`vibe-mascot`](skills/vibe-mascot/SKILL.md), that Claude uses when you ask,
for example "make me a pixel mascot of a sleepy fox in headphones". You can
also start it yourself with `/b-side:vibe-mascot`. Claude then:

1. asks what makes your mascot recognizable, and keeps to those 3-5 features;
2. draws it as 32×32 (or 20×20) pixel art from a small builder script, so
   every tweak is a re-run, not a hand edit;
3. renders a preview of all four moods and shows it to you;
4. opens the **mascot studio**, a local page at `http://127.0.0.1:8765/`
   where all four moods dance side by side, with a pixel editor
   (`/editor.html`) for fixing pixels yourself;
5. saves it to your mascots folder and, with your OK, selects it.

The kit, preview and studio need Python 3 (standard library only).

**Where mascots live.** `%USERPROFILE%\.claude\vibe\mascots\<name>.svg`, with
a name of lowercase letters, digits and hyphens. Plugin updates don't touch
this folder. Select one with the `mascot` option (the name without `.svg`):

```json
"pluginConfigs": { "b-side@b-side": { "options": { "mascot": "sleepy-fox" } } }
```

then run `/reload-plugins`. After editing the SVG itself, reopening
`/soundtrack pane` is enough. A missing or broken file falls back to Bop.

To draw one by hand instead, [MASCOTS.md](MASCOTS.md) has the full contract:
the four moods, the CSS variables the pane sets, the rules and a starter
template. Only use art you made or may share.

## Better labels with Last.fm (optional)

Real listener tags are much better than Haiku's guesses for new songs. It's
free for non-commercial use and takes a minute to set up:

1. While logged in to Last.fm, create an API account at
   <https://www.last.fm/api/account/create> and copy the API key (the shared
   secret isn't needed).
2. Save it as a user environment variable named `LASTFM_API_KEY`, for example
   in PowerShell:
   ```powershell
   [Environment]::SetEnvironmentVariable('LASTFM_API_KEY', '<your key>', 'User')
   ```
3. Restart Claude Code so it sees the variable.

Before the lookup, titles are cleaned up: `【Ado】`, `[Official Video]`,
`(feat. X)`, `- Remastered 2011`, `''Song'' by Artist` and `Artist - Topic`
channels. Tracks Haiku already labeled get one Last.fm lookup the next time
they play. Labels from Last.fm are marked `· Last.fm`.

Tags are provided by [Last.fm](https://www.last.fm), under its
[API terms](https://www.last.fm/api/tos).

## Where the data lives

`%USERPROFILE%\.claude\vibe\`

- `session-<UTC start time>.json`: one per session, with `plays` (when each
  track started) and `edits` (`timestamp, title, artist, app, vibe_guess,
  vibe_source, tool, file_path`). Sessions with nothing logged write no file.
- `vibe-labels.json`: the label cache, `"artist — title": { "vibe", "source" }`
  (older entries are a bare Haiku label).
- `mascots\`: your own mascots (above).

Load the edits with pandas:

```python
import json, glob, pandas as pd
rows = [r for f in glob.glob(r"C:\Users\<you>\.claude\vibe\session-*.json")
        for r in json.load(open(f, encoding="utf-8"))["edits"]]
df = pd.DataFrame(rows)
```

## Working on it

To run a local copy while you change it, start Claude Code with
`claude --plugin-dir <path to this folder>`, and run `/reload-plugins` after
each edit. `claude plugin validate .` checks it and `claude plugin test .`
runs `tests/`.

## Turn it off

- Off for now: `claude plugin disable b-side@b-side`, then `/reload-plugins`.
- Remove it: `claude plugin uninstall b-side@b-side`.
- Delete the data: remove `%USERPROFILE%\.claude\vibe\`.

A session only polls while a turn is running or within 10 minutes of its last
turn. Idle sessions don't run `powershell.exe` and clear their status line,
and a new turn polls right away. Tracks played while a session is idle aren't
logged for it.

## License

MIT, see [LICENSE](LICENSE).
