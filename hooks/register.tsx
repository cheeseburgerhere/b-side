import type { EngineInterface, Register } from 'claude-code'
import { cellSize, cells, frame, parseMascot, type Mascot as Pixels, type Picture } from './pixels'

// A side channel only: nothing here is sent to the model's context or
// changes a prompt. Polling, labeling and file writes run on timers; the
// tool.call hook only notes the edit in memory.

type $ = EngineInterface

type Track = { title: string; artist: string; app: string }
// Where a label came from: Last.fm listener tags, or Haiku's guess.
type Source = 'lastfm' | 'haiku'
type Play = Track & { started_at: string; vibe_guess: string | null; vibe_source?: Source | null }
type EditRow = Track & {
  timestamp: string
  vibe_guess: string | null
  vibe_source?: Source | null
  tool: string
  file_path: string
}
// How a track feels whatever its genre, as Haiku judges it; picks the mascot's mood.
type Feel = 'aggressive' | 'calm' | 'lively'
const FEELS: Feel[] = ['aggressive', 'calm', 'lively']
// A cached label. `lastfm: 'miss'` means Last.fm had no tags for it, so it is
// not asked again. Earlier versions stored Haiku's label as a bare string and
// had no `feel`.
type Label = { vibe: string; source: Source; lastfm?: 'miss'; feel?: Feel }
type SessionLog = {
  session_id: string
  started_at: string
  cwd: string
  plays: Play[]
  edits: EditRow[]
}

const POLL_MS = 15_000
// A session with no turn running and none in this long is idle and does not poll.
const IDLE_MS = 10 * 60_000
const LABELS_FILE = 'vibe-labels.json'
const PANE = 'vibe-timeline'
// Haiku's answer for media that is not a song; cached like any label.
const NOT_MUSIC = 'not music'

let dir = ''
let file = ''
let log: SessionLog | null = null
let labels: Record<string, string | Label> = {}
// Set only by users who opt in to Last.fm tags; never logged or written.
let lastfmKey: string | undefined
let playing: Track | null = null
let isPolling = false
let isSaveQueued = false
const runningTurns = new Set<string>()
// Tracks asked about since load, so a failing call is not repeated every poll.
const tried = new Set<string>()
let lastActive = 0
let writes: Promise<unknown> = Promise.resolve()

const iso = (ms = Date.now()) => new Date(ms).toISOString()
const keyOf = (t: Track) => `${t.artist} — ${t.title}`.toLowerCase()
const entry = (key: string): Label | undefined => {
  const value = labels[key]
  return typeof value === 'string' ? { vibe: value, source: 'haiku' } : value
}
const vibeOf = (t: Track) => entry(keyOf(t))?.vibe
const isMusic = (t: Track) => vibeOf(t) !== NOT_MUSIC
const debug = ($: $, text: string) => $.ui.log(`b-side: ${text}`, { to: 'debug' })

async function readJson<T>($: $, path: string): Promise<T | null> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

// Writes run one after another, each with the log as it stands then. Every
// change to the log goes through here, so it also redraws the pane.
function save($: $): Promise<unknown> {
  $.ui.invalidate('ui.render')
  writes = writes
    .then(() =>
      log && (log.plays.length > 0 || log.edits.length > 0)
        ? $.fs.write(file, JSON.stringify(log, null, 2))
        : undefined,
    )
    .catch(err => debug($, `write failed: ${String(err)}`))
  return writes
}

async function openSession($: $) {
  const home = await $.env.get('USERPROFILE')
  if (!home) throw new Error('USERPROFILE is not set')
  dir = `${home}\\.claude\\vibe`
  const { startedAt } = await $.session.usage()
  const stamp = iso(startedAt).replace(/[-:]/g, '').replace(/\.\d+/, '')
  file = `${dir}\\session-${stamp}.json`
  log = (await readJson<SessionLog>($, file)) ?? {
    session_id: await $.session.id(),
    started_at: iso(startedAt),
    cwd: await $.session.cwd(),
    plays: [],
    edits: [],
  }
  labels = (await readLabels($)) ?? {}
  lastfmKey = (await $.env.get('LASTFM_API_KEY')) || undefined
}

const readLabels = ($: $) => readJson<Record<string, string | Label>>($, `${dir}\\${LABELS_FILE}`)

function showStatus($: $) {
  $.ui.invalidate('ui.render')
  if (!playing) return $.ui.status('silence')
  const vibe = vibeOf(playing)
  $.ui.status(`${playing.title} — ${playing.artist}${vibe ? ` · ${vibe}` : ''}`)
}

// A track is labeled once. With a Last.fm key, a Haiku label also gets one
// Last.fm lookup, so turning Last.fm on improves tracks already seen. A label
// from before `feel` existed gets one Haiku call for it.
const needsTag = (known: Label | undefined) =>
  !!lastfmKey && (!known || (known.source === 'haiku' && !known.lastfm && known.vibe !== NOT_MUSIC))
const needsFeel = (known: Label | undefined) => !known || (!known.feel && known.vibe !== NOT_MUSIC)
function needsLabel(track: Track) {
  const key = keyOf(track)
  if (tried.has(key)) return false
  const known = entry(key)
  return needsTag(known) || needsFeel(known)
}

// Strips what video and streaming titles add, so Last.fm finds the song:
// 【Ado】, [Official Video], (feat. X), " - Remastered 2011",
// ''Song'' by Artist, "Artist - Topic".
function cleanTrack(track: Track) {
  let { title, artist } = track
  const quoted = title.match(/(?:''|["“])(.+?)(?:''|["”])\s+by\s+(.+)$/i)
  if (quoted?.[1] && quoted[2]) {
    title = quoted[1]
    artist = quoted[2]
  }
  title = title
    .replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
    .replace(/\(([^)]*)\)/g, (all, inner: string) =>
      /feat|ft\.|official|video|audio|lyric|\bmv\b|remaster|version|ver\.|size|full/i.test(inner) ? ' ' : all,
    )
    .replace(/\s+-\s+.*(remaster|official|lyric|video|audio).*$/i, '')
    .replace(/\s+(feat\.?|ft\.)\s.*$/i, '')
  artist = artist
    .replace(/\s+-\s+topic$/i, '')
    .replace(/vevo$/i, '')
    .replace(/\s+(feat\.?|ft\.)\s.*$/i, '')
    .replace(/\([^)]*\)/g, '')
  return { title: title.replace(/\s+/g, ' ').trim(), artist: artist.replace(/\s+/g, ' ').trim() }
}

// Tags that say nothing about how a song sounds.
const JUNK_TAGS = /^(seen live|favou?rites?|loved?|awesome|beautiful|amazing|best.*|my .*|(fe)?male vocalists?|vocalists?|japanese|japan|\d{2,4}s?)$/

// The top Last.fm listener tag for a track: the tag, null when Last.fm has
// none (asked once), or undefined when the lookup failed (asked again later).
async function lastfmTag($: $, track: Track): Promise<string | null | undefined> {
  const { title, artist } = cleanTrack(track)
  const url =
    'https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&autocorrect=1&format=json' +
    `&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}` +
    `&api_key=${encodeURIComponent(lastfmKey ?? '')}`
  try {
    const res = await $.http.fetch(url)
    const body = JSON.parse(res.text) as {
      error?: number
      toptags?: { tag?: { name: string }[] }
    }
    if (body.error === 6) return null // track not found
    if (!res.ok || body.error) {
      debug($, `Last.fm lookup failed: error ${body.error ?? res.status}`)
      return undefined
    }
    const tag = (body.toptags?.tag ?? [])
      .map(t => t.name.toLowerCase().trim())
      .find(name => name && !JUNK_TAGS.test(name) && name !== artist.toLowerCase() && name.split(/\s+/).length <= 3)
    return tag ?? null
  } catch (err) {
    debug($, `Last.fm lookup failed: ${err instanceof Error ? err.name : 'error'}`)
    return undefined
  }
}

async function label($: $, track: Track) {
  const key = keyOf(track)
  // Another open session may have labeled it already.
  labels = { ...labels, ...((await readLabels($)) ?? {}) }
  if (!needsLabel(track)) return
  tried.add(key)

  const known = entry(key)
  const tag = needsTag(known) ? await lastfmTag($, track) : undefined
  // Haiku is asked even when Last.fm has a tag: tags name a genre, not how
  // the track feels.
  const guess = needsFeel(known) ? await haikuGuess($, track) : null
  const base = known ?? (guess ? { vibe: guess.vibe, source: 'haiku' as const } : undefined)
  const next: Label | undefined = tag ? { ...base, vibe: tag, source: 'lastfm' } : base && { ...base }
  if (!next) return
  if (tag === null) next.lastfm = 'miss'
  if (guess?.feel) next.feel = guess.feel
  if (JSON.stringify(next) === JSON.stringify(known)) return

  // Merge with labels other sessions may have written meanwhile; the file wins.
  labels = { ...labels, ...((await readLabels($)) ?? {}), [key]: next }
  await $.fs.write(`${dir}\\${LABELS_FILE}`, JSON.stringify(labels, null, 2))
  for (const row of [...(log?.plays ?? []), ...(log?.edits ?? [])]) {
    if (keyOf(row) !== key || (row.vibe_guess !== null && next.source !== 'lastfm')) continue
    row.vibe_guess = next.vibe
    row.vibe_source = next.source
  }
  await save($)
}

async function haikuGuess($: $, track: Track): Promise<{ vibe: string; feel?: Feel } | null> {
  const r = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 30,
    timeoutMs: 15_000,
    prompt:
      'This is the media playing on my computer. If it is not music (a short, ' +
      'vlog, podcast, news, tutorial, game or other non-song video), reply ' +
      `exactly: ${NOT_MUSIC}\n` +
      'Otherwise reply with two lines and nothing else:\n' +
      '1. the vibe of the song as a 1-3 word lowercase label, like ' +
      '"dark synthwave", "lo-fi focus" or "raw grunge"\n' +
      '2. how the song feels, whatever its genre: aggressive (angry, loud, ' +
      'distorted, shouted or relentless), calm (soft, slow or gentle) or ' +
      'lively (anything else). A grunge or rock song can be aggressive and a ' +
      'metal ballad calm.\n' +
      `Title: ${track.title}\nArtist: ${track.artist}`,
  })
  if (!r.isAnswered) {
    debug($, `label for "${keyOf(track)}" failed: ${r.reason}`)
    return null
  }
  const [first = '', second = ''] = r.text
    .trim()
    .split('\n')
    .map(line => line.replace(/^\s*\d[.)]\s*/, '').toLowerCase())
  const vibe = first.replace(/["'.!]/g, '').trim().split(/\s+/).slice(0, 3).join(' ')
  if (!vibe) return null
  return { vibe, feel: FEELS.find(feel => second.includes(feel)) }
}

async function isPaneOpen($: $) {
  try {
    return (await $.ui.panes()).some(pane => pane.id === PANE)
  } catch {
    return false
  }
}

async function poll($: $) {
  if (isPolling || !log) return
  // An open pane keeps the session awake: it is there to show what plays.
  if (runningTurns.size === 0 && Date.now() - lastActive > IDLE_MS && !(await isPaneOpen($))) {
    if (playing) {
      playing = null
      $.ui.status(undefined)
      $.ui.invalidate('ui.render')
    }
    return
  }
  isPolling = true
  try {
    const run = await $.process.run(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        `${$.plugin.root}\\nowplaying.ps1`,
      ],
      { timeoutMs: 10_000 },
    )
    const np = JSON.parse(run.stdout.trim() || '{}') as Partial<Track & { status: string }>
    const heard: Track | null =
      np.status === 'playing' && np.title
        ? { title: String(np.title), artist: String(np.artist ?? ''), app: String(np.app ?? '') }
        : null
    // A new track is labeled before anything is logged under it, so a video
    // that is not music never reaches the log.
    if (heard && needsLabel(heard)) {
      if (!entry(keyOf(heard))) playing = null
      await label($, heard)
    }
    playing = heard && isMusic(heard) ? heard : null
    showStatus($)

    const last = log.plays.at(-1)
    if (playing && (!last || keyOf(last) !== keyOf(playing))) {
      const known = entry(keyOf(playing))
      log.plays.push({ started_at: iso(), ...playing, vibe_guess: known?.vibe ?? null, vibe_source: known?.source ?? null })
      await save($)
    }
  } catch (err) {
    debug($, `poll failed: ${String(err)}`)
  } finally {
    isPolling = false
  }
}

function shortPath(path: string, cwd: string) {
  const root = cwd.replace(/[\\/]+$/, '')
  return path.toLowerCase().startsWith(`${root.toLowerCase()}\\`) ||
    path.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    ? path.slice(root.length + 1)
    : path
}

type Block = { play: Play; time: string; vibe: string | null; source: Source | null; files: [string, number][] }

// Last.fm's terms ask for credit wherever its tags are shown.
const credit = (source: Source | null) => (source === 'lastfm' ? ' · Last.fm' : '')

const editCount = (blocks: Block[]) => blocks.reduce((n, b) => n + b.files.reduce((m, [, c]) => m + c, 0), 0)

// A path as its file name and the folder it sits in, the folder cut to its
// last two parts.
function splitPath(path: string) {
  const parts = path.split(/[\\/]+/)
  const name = parts.pop() ?? path
  const folder = parts.length > 2 ? `…\\${parts.slice(-2).join('\\')}` : parts.join('\\')
  return { name, folder }
}

// This session's plays in order, each with the files edited while it played.
// What was logged before its track was judged not music is left out.
function timeline(): Block[] {
  if (!log) return []
  const { cwd } = log
  const plays = log.plays.filter(isMusic)
  const edits = log.edits.filter(isMusic)

  // Each edit belongs to the latest play of its track that started before it.
  const files = plays.map(() => new Map<string, number>())
  for (const edit of edits) {
    let at = -1
    plays.forEach((p, i) => {
      if (keyOf(p) === keyOf(edit) && p.started_at <= edit.timestamp) at = i
    })
    if (at < 0) at = plays.findIndex(p => keyOf(p) === keyOf(edit))
    const bucket = files[at]
    if (!bucket) continue
    const name = shortPath(edit.file_path, cwd)
    bucket.set(name, (bucket.get(name) ?? 0) + 1)
  }

  return plays.map((play, i) => ({
    play,
    time: new Date(play.started_at).toTimeString().slice(0, 5),
    vibe: vibeOf(play) ?? play.vibe_guess,
    source: entry(keyOf(play))?.source ?? play.vibe_source ?? null,
    files: [...(files[i] ?? new Map<string, number>())],
  }))
}

function sessionReport(): string[] {
  if (!log) return ['B-side is not running in this session.']
  const blocks = timeline()
  if (blocks.length === 0) return ['Soundtrack: nothing has played this session yet.']

  const lines = [`Soundtrack — this session (${blocks.length} tracks, ${editCount(blocks)} edits)`]
  for (const { play, time, vibe, source, files } of blocks) {
    lines.push(`${time}  ${play.title} — ${play.artist}${vibe ? `  [${vibe}${credit(source)}]` : ''}`)
    if (files.length === 0) lines.push('         (no edits)')
    for (const [name, n] of files) lines.push(`         ${name}${n > 1 ? ` ×${n}` : ''}`)
  }
  return lines
}

// Each vibe keeps one color, so the same mood looks the same everywhere: an
// ember palette. Hex, since the mascot's SVG can't read theme keys.
const VIBE_COLORS = ['#253D5B', '#EB4315', '#EC8B10', '#B2A4A1']
const QUIET = '#6B6461'
function vibeColor(vibe: string | null) {
  if (!vibe) return QUIET
  let hash = 0
  for (const ch of vibe) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return VIBE_COLORS[hash % VIBE_COLORS.length] ?? QUIET
}

// The mascot's mood (MASCOTS.md): `m-bang` to aggressive music of any genre,
// sway to calm music, bounce to the rest, sleep through silence. A label with
// no `feel` yet falls back to the words in its vibe.
type Mood = 'm-bounce' | 'm-sway' | 'm-bang' | 'm-sleep'
function moodOf(known: Label | undefined, isPlaying: boolean): Mood {
  if (!isPlaying) return 'm-sleep'
  const vibe = known?.vibe ?? ''
  const feel =
    known?.feel ??
    (/metal|aggressive|heavy|hardcore|punk|scream|djent|nu[ -]?(rock|metal)|dubstep|thrash|grind/.test(vibe)
      ? 'aggressive'
      : /ambient|dream|lo-?fi|chill|ballad|sad|melanch|acoustic|jazz|piano|soft|slow|emotional|sweet|calm|sleep/.test(vibe)
        ? 'calm'
        : 'lively')
  return feel === 'aggressive' ? 'm-bang' : feel === 'calm' ? 'm-sway' : 'm-bounce'
}
// Seconds per beat for each mood until the BPM is known.
const BEAT: Record<Mood, number> = { 'm-bounce': 0.5, 'm-sway': 0.75, 'm-bang': 0.35, 'm-sleep': 0.5 }
// What the terminal, which draws no SVG, shows for a mascot it can't turn
// into pixels.
const KAOMOJI: Record<Mood, string> = {
  'm-bounce': '♪ ┏(・o・)┛ ♪',
  'm-sway': '~(˘▾˘~) ♫',
  'm-bang': '\\m/(>_<)\\m/',
  'm-sleep': '(－_－) zzZ',
}

// `pixels`: the same mascot for the terminal's Raster, when it is pixel art.
let mascot: { source: string; alt: string; width: number; height: number; pixels: Pixels | null } | null = null
let mascotName = 'miso'
// The `motion` option: true keeps the mascot dancing under reduced motion.
let isAlwaysMoving = false

// Reads <name>.svg from the user's mascots folder, which plugin updates leave
// alone, then from the plugin's own, falling back to the default, Miso.
async function loadMascot($: $, name: string) {
  const home = await $.env.get('USERPROFILE')
  const own = `${$.plugin.root}\\mascots`
  const paths = /^[a-z0-9-]+$/.test(name) ? [...(home ? [`${home}\\.claude\\vibe\\mascots`] : []), own].map(d => `${d}\\${name}.svg`) : []
  for (const path of [...paths, `${own}\\miso.svg`]) {
    try {
      const source = (await $.fs.read(path)).trim()
      if (!source.startsWith('<svg') || source.length > 131_072) continue
      // Its own size, given to the Svg: absent, Desktop stretches the box.
      const root = source.match(/<svg\b[^>]*>/)?.[0] ?? ''
      const size = (attr: string) => Number(root.match(new RegExp(`\\s${attr}="(\\d+)"`))?.[1]) || 96
      mascot = {
        source,
        alt: source.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'B-side mascot',
        width: size('width'),
        height: size('height'),
        pixels: parseMascot(source),
      }
      return
    } catch {
      // try the next one
    }
  }
  mascot = null
}

// The mascot with the mod's part of the contract set on its root.
const dressed = (source: string, mood: Mood, color: string) =>
  source.replace(
    /<svg\b/,
    `<svg class="${mood}${isAlwaysMoving ? ' motion-always' : ''}" style="--beat:${BEAT[mood]}s;--vibe:${color}"`,
  )

// The header's equalizer: pixel bars in the vibe's color that jump on the
// beat while music plays and lie low through silence. Each bar steps through
// one of these heights (of 5 blocks), a beat each.
const EQ_STEPS = [
  [2, 5, 3, 4],
  [4, 2, 5, 1],
  [3, 4, 1, 5],
  [5, 3, 2, 4],
]
const EQ_BARS = 14
const EQ_WIDTH = EQ_BARS * 3 - 1
// Pixels per block: the Svg is drawn at this size.
const EQ_SCALE = 3
function equalizer(mood: Mood, color: string, isPlaying: boolean) {
  const width = EQ_WIDTH
  const keyframes = EQ_STEPS.map(
    (steps, k) => `@keyframes e${k}{${steps.map((s, i) => `${i * 25}%{transform:scaleY(${s / 5})}`).join('')}}`,
  ).join('')
  const bars = Array.from(
    { length: EQ_BARS },
    (_, i) =>
      `<rect x="${i * 3}" y="0" width="2" height="9" style="animation-name:e${(i * 3) % 4};animation-delay:calc(var(--beat) * -${i % 3})"/>`,
  ).join('')
  // Gaps between the blocks: a bar shows only where a stripe is.
  const stripes = [0, 2, 4, 6, 8].map(y => `<rect x="0" y="${y}" width="${width}" height="1" fill="#fff"/>`).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 9" width="${width * EQ_SCALE}" height="${9 * EQ_SCALE}" shape-rendering="crispEdges"` +
    ` class="${isPlaying ? 'on' : ''}${isAlwaysMoving ? ' motion-always' : ''}" style="--beat:${BEAT[mood]}s">` +
    '<title>B-side equalizer</title><style>' +
    '.bars rect{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(.2)}' +
    '.on .bars rect{animation-duration:calc(var(--beat) * 4);animation-timing-function:steps(1);animation-iteration-count:infinite}' +
    keyframes +
    '@media (prefers-reduced-motion:reduce){svg:not(.motion-always) rect{animation:none!important}}' +
    `</style><mask id="blocks">${stripes}</mask>` +
    `<g class="bars" mask="url(#blocks)" fill="${isPlaying ? readable(color) : QUIET}">${bars}</g></svg>`
  )
}
// What the terminal shows in the equalizer's place.
const EQ_TEXT = '▂▅▃▇▄▁▆▃▅▂▇▄'

// The header's name in 5×7 pixel letters, banded like embers cooling to
// ash: orange on top, red-orange through the middle, warm gray below.
// While music plays the letters hop in turn, one a beat.
const NAME = 'B-SIDE'
const GLYPHS: Record<string, string[]> = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
}
const BANDS = ['#EC8B10', '#EC8B10', '#EB4315', '#EB4315', '#EB4315', '#B2A4A1', '#B2A4A1']
const NAME_SCALE = 4
// Its width in blocks: the letters and a block between each.
const NAME_WIDTH = [...NAME].reduce((w, ch) => w + (GLYPHS[ch]?.[0]?.length ?? 0) + 1, -1)
function wordmark(mood: Mood, isPlaying: boolean) {
  const letters = [...NAME]
  let x = 0
  const groups = letters.map((ch, i) => {
    const glyph = GLYPHS[ch] ?? []
    const blocks = glyph.flatMap((row, y) =>
      [...row].flatMap((on, dx) =>
        on === '1' ? [`<rect x="${x + dx}" y="${y}" width="1" height="1" fill="${BANDS[y]}"/>`] : [],
      ),
    )
    x += (glyph[0]?.length ?? 0) + 1
    return `<g style="animation-delay:calc(var(--beat) * ${i})">${blocks.join('')}</g>`
  })
  const width = NAME_WIDTH
  // One row of room above for the hop.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 ${width} 8" width="${width * NAME_SCALE}" height="${8 * NAME_SCALE}" shape-rendering="crispEdges"` +
    ` class="${isPlaying ? 'on' : ''}${isAlwaysMoving ? ' motion-always' : ''}" style="--beat:${BEAT[mood]}s">` +
    '<title>B-side</title><style>' +
    `.on g{animation:hop calc(var(--beat) * ${letters.length}) steps(1) infinite}` +
    `@keyframes hop{0%{transform:translateY(-1px)}${(100 / letters.length).toFixed(2)}%{transform:none}}` +
    '@media (prefers-reduced-motion:reduce){svg:not(.motion-always) g{animation:none!important}}' +
    `</style>${groups.join('')}</svg>`
  )
}

// A vibe's color as text or a mark on a dark pane: the navy, too dark to
// read there, is lifted.
const NAVY = '#253D5B'
const readable = (color: string) => (color === NAVY ? '#5A7BA3' : color)

// The terminal's header in pixels, two a cell: the mascot, the name and the
// equalizer as Rasters, repainted whenever a step of their animation changes
// the picture. The timer stops when the pane is gone.
const DANCE_MS = 50
// The tallest the mascot is drawn, in rows: bigger ones are drawn at half
// size (or less), each block of pixels as one.
const MASCOT_ROWS = 10
const hex = (color: string) => Number.parseInt(color.slice(1), 16)
// The dance's clock: timer ticks, so a test's clock moves it too.
let danceTicks = 0
let dance = { mood: 'm-sleep' as Mood, color: '', isPlaying: false }
// What each Raster last showed, by key.
const shown = new Map<string, string>()
let danceTimer: { cancel: () => void } | null = null
// Refused repaints in a row: the Rasters may not be mounted yet, so only a
// second of refusals means the pane is gone.
let danceMisses = 0

const shrinkFor = (pixels: Pixels) => {
  let k = 1
  while (cellSize(pixels, k).rows > MASCOT_ROWS) k++
  return k
}

// The name as in wordmark(): banded letters, one hopping a beat while music plays.
function namePicture(t: number, beat: number, isPlaying: boolean): Picture {
  const height = 8 // a row of room above for the hop
  const pixels = new Map<number, number>()
  let x = 0
  ;[...NAME].forEach((ch, i) => {
    const glyph = GLYPHS[ch] ?? []
    const lift = isPlaying && Math.floor(t / beat) % NAME.length === i ? 0 : 1
    glyph.forEach((row, y) =>
      [...row].forEach((on, dx) => {
        if (on === '1') pixels.set((y + lift) * NAME_WIDTH + x + dx, hex(BANDS[y] ?? QUIET))
      }),
    )
    x += (glyph[0]?.length ?? 0) + 1
  })
  return { width: NAME_WIDTH, height, pixels }
}

// The equalizer as in equalizer(): a bar every other column, as wide as the
// name, each stepping through its heights a beat at a time; low in silence.
const TERM_EQ_HEIGHT = 6
function eqPicture(t: number, beat: number, isPlaying: boolean, color: string): Picture {
  const pixels = new Map<number, number>()
  const paint = isPlaying ? hex(readable(color)) : hex(QUIET)
  for (let i = 0; 2 * i < NAME_WIDTH; i++) {
    const steps = EQ_STEPS[(i * 3) % 4] ?? [1]
    const h = isPlaying ? (steps[(Math.floor(t / beat) + (i % 3)) % steps.length] ?? 1) : 1
    for (let y = TERM_EQ_HEIGHT - h; y < TERM_EQ_HEIGHT; y++) pixels.set(y * NAME_WIDTH + 2 * i, paint)
  }
  return { width: NAME_WIDTH, height: TERM_EQ_HEIGHT, pixels }
}

// Each Raster of the header now: key, size and cells.
function terminalArt() {
  const t = (danceTicks * DANCE_MS) / 1000
  const { mood, color, isPlaying } = dance
  const beat = BEAT[mood]
  const art: { key: string; columns: number; rows: number; cells: string }[] = []
  const pixels = mascot?.pixels
  if (pixels) {
    const k = shrinkFor(pixels)
    art.push({ key: 'mascot', ...cellSize(pixels, k), cells: frame(pixels, mood, beat, hex(color), t, k) })
  }
  const asCells = (key: string, p: Picture) => art.push({ key, columns: p.width, rows: Math.ceil(p.height / 2), cells: cells(p) })
  asCells('name', namePicture(t, beat, isPlaying))
  asCells('eq', eqPicture(t, beat, isPlaying, color))
  return art
}

function stopDance() {
  danceTimer?.cancel()
  danceTimer = null
}

async function danceStep($: $) {
  danceTicks++
  let isRefused = false
  for (const { key, columns, rows, cells } of terminalArt()) {
    if (shown.get(key) === cells) continue
    const res = await $.ui.blit({ requestId: PANE, key, columns, rows, cells })
    if (res.deny) isRefused = true
    else shown.set(key, cells)
  }
  if (!isRefused) danceMisses = 0
  else if (++danceMisses * DANCE_MS >= 1000) {
    danceMisses = 0
    stopDance()
  }
}

async function allReport($: $): Promise<string[]> {
  const entries = await $.fs.list(dir)
  const tracks = new Map<string, { title: string; artist: string; vibe: string | null; source: Source | null; edits: number }>()
  const vibes = new Map<string, number>()
  let sessions = 0
  let edits = 0
  for (const file of entries) {
    if (file.kind !== 'file' || !/^session-.*\.json$/.test(file.name)) continue
    const one = await readJson<SessionLog>($, `${dir}\\${file.name}`)
    if (!one) continue
    sessions++
    for (const edit of (one.edits ?? []).filter(isMusic)) {
      edits++
      const key = keyOf(edit)
      const vibe = vibeOf(edit) ?? edit.vibe_guess
      const source = entry(key)?.source ?? edit.vibe_source ?? null
      const t = tracks.get(key) ?? { title: edit.title, artist: edit.artist, vibe, source, edits: 0 }
      t.edits++
      tracks.set(key, t)
      if (vibe) vibes.set(vibe, (vibes.get(vibe) ?? 0) + 1)
    }
  }
  if (edits === 0) return [`Soundtrack — ${sessions} sessions, no edits logged while music played yet.`]

  const lines = [`Soundtrack — all sessions (${sessions} sessions, ${edits} edits)`, '', 'Top tracks by edits:']
  ;[...tracks.values()]
    .sort((a, b) => b.edits - a.edits)
    .slice(0, 10)
    .forEach((t, i) =>
      lines.push(
        `${String(i + 1).padStart(2)}. ${t.title} — ${t.artist}${t.vibe ? `  [${t.vibe}${credit(t.source)}]` : ''}  ${t.edits}`,
      ),
    )
  lines.push('', 'Vibes you code to most (Last.fm tags or Haiku guesses):')
  ;[...vibes]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([vibe, n], i) => lines.push(`${String(i + 1).padStart(2)}. ${vibe}  ${n}`))
  return lines
}

// $.ui.log lines are shown in the transcript and never sent to the model.
function print($: $, lines: string[]) {
  let chunk: string[] = []
  for (const line of lines) {
    if ([...chunk, line].join('\n').length > 1800) {
      $.ui.log(chunk.join('\n'))
      chunk = []
    }
    chunk.push(line)
  }
  if (chunk.length > 0) $.ui.log(chunk.join('\n'))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    try {
      mascotName = String(options.mascot ?? 'miso')
      await loadMascot($, mascotName)
      isAlwaysMoving = options.motion === 'always'
      await openSession($)
      $.clock.every(POLL_MS, () => void poll($))
    } catch (err) {
      debug($, `could not start: ${String(err)}`)
    }
    try {
      await $.command.register({
        name: 'soundtrack',
        description: 'Tracks played this session and the files edited during each ("all": every session, "pane": timeline pane)',
        argumentHint: '[all|pane]',
      })
    } catch (err) {
      debug($, `could not register /soundtrack: ${String(err)}`)
    }
    return next(e)
  })

  // Turns mark the session active; a new one polls right away so the track
  // is current before any edit.
  on('turn.start', ($, e, next) => {
    runningTurns.add(e.turnId)
    lastActive = Date.now()
    $.clock.after(1, () => void poll($))
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    runningTurns.delete(e.turnId)
    lastActive = Date.now()
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const track = playing
    const ran = await next(e)
    try {
      if (track && log && ran.deny === undefined && !ran.isError) {
        log.edits.push({
          timestamp: iso(),
          ...track,
          vibe_guess: vibeOf(track) ?? null,
          vibe_source: entry(keyOf(track))?.source ?? null,
          tool: e.tool,
          file_path: e.file_path,
        })
        if (!isSaveQueued) {
          isSaveQueued = true
          $.clock.after(500, () => {
            isSaveQueued = false
            void save($)
          })
        }
      }
    } catch {
      // Logging never gets in the way of the edit.
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'soundtrack' }, async ($, e) => {
    const arg = e.args.trim()
    // Asking for the soundtrack counts as activity: poll now.
    lastActive = Date.now()
    $.clock.after(1, () => void poll($))
    try {
      if (arg === 'pane') {
        // Read the mascot again, so an edited mascot file shows on reopening.
        await loadMascot($, mascotName)
        await $.ui.open({ id: PANE, title: 'Soundtrack' })
        $.ui.invalidate('ui.render')
      }
      else print($, arg === 'all' ? await allReport($) : sessionReport())
    } catch (err) {
      $.ui.log(`b-side: /soundtrack failed: ${String(err)}`)
    }
    return {}
  })

  // The timeline in a pixel-LCD look: the mascot dancing to what plays now
  // beside a pixel equalizer, then the tracks newest first on a line of
  // square nodes in each vibe's color, with the files edited while each
  // played. The terminal, which draws no SVG, gets the mascot as a Raster
  // (or a kaomoji) and a text equalizer.
  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    let blocks: Block[]
    try {
      blocks = timeline()
    } catch (err) {
      return <Text color="error">B-side could not build the timeline: {String(err)}</Text>
    }

    const isTerminal = e.surface === 'terminal'
    const nowVibe = playing ? (vibeOf(playing) ?? null) : null
    const mood = moodOf(playing ? entry(keyOf(playing)) : undefined, playing !== null)
    const nowColor = vibeColor(nowVibe)
    // The terminal's table carries an Svg that draws nothing. Each Svg gets
    // its own size: without one, Desktop stretches it to the room it has.
    const Svg = !isTerminal && 'Svg' in els ? els.Svg : undefined
    const Raster = isTerminal && 'Raster' in els ? els.Raster : undefined
    const art = new Map<string, ReturnType<typeof terminalArt>[number]>()
    if (Raster) {
      dance = { mood, color: nowColor, isPlaying: playing !== null }
      for (const a of terminalArt()) {
        art.set(a.key, a)
        shown.set(a.key, a.cells)
      }
      danceTimer ??= $.clock.every(DANCE_MS, () => void danceStep($))
    }
    const raster = (key: string) => {
      const a = art.get(key)
      return Raster && a ? <Raster key={key} columns={a.columns} rows={a.rows} cells={a.cells} /> : undefined
    }
    const dancer =
      raster('mascot') ??
      (Svg && mascot ? (
        <Svg
          source={dressed(mascot.source, mood, nowColor)}
          alt={mascot.alt}
          width={mascot.width}
          height={mascot.height}
          isInteractive
        />
      ) : (
        <Text mono color={nowColor}>
          {KAOMOJI[mood]}
        </Text>
      ))
    const eq = raster('eq') ?? (Svg ? (
      <Svg
        source={equalizer(mood, nowColor, playing !== null)}
        alt="equalizer"
        width={NAME_WIDTH * NAME_SCALE}
        height={9 * EQ_SCALE}
        isInteractive
      />
    ) : (
      <Text mono color={playing ? nowColor : QUIET}>
        {playing ? EQ_TEXT : '▁'.repeat(EQ_TEXT.length)}
      </Text>
    ))

    const last = blocks.length - 1
    const nowKey = playing ? keyOf(playing) : null
    return (
      <Box flexDirection="column" rowGap={1}>
        {/* The cover: the name, the equalizer, what plays now and the
            counts in one column as tall as the mascot, spread top to bottom. */}
        <Box flexDirection="row" gap={2} alignItems="stretch">
          {dancer}
          <Box flexDirection="column" flexShrink={1} justifyContent="space-between">
            {raster('name') ?? (Svg ? (
              <Svg
                source={wordmark(mood, playing !== null)}
                alt="B-side"
                width={NAME_WIDTH * NAME_SCALE}
                height={8 * NAME_SCALE}
                isInteractive
              />
            ) : (
              <Text mono weight="bold" color={BANDS[0]}>
                {NAME}
              </Text>
            ))}
            {eq}
            <Text mono color={playing ? readable(nowColor) : QUIET} wrap="truncate-end">
              {playing ? `▶ ${playing.title}` : 'silence'}
            </Text>
            <Text mono size="caption" dimColor>
              {blocks.length} tracks · {editCount(blocks)} edits
            </Text>
          </Box>
        </Box>
        {/* Desktop fits a little less than bodyColumns and neither clips
            nor cuts cleanly (a cut ends in "…", an overflow wraps), so
            there the line is drawn a bit short. */}
        <Text mono dimColor>
          {'─'.repeat(isTerminal ? e.props.bodyColumns : Math.max(0, e.props.bodyColumns - Math.ceil(e.props.bodyColumns / 16) - 1))}
        </Text>
        {blocks.length === 0 && (
          <Text mono dimColor>
            Nothing has played yet. Put some music on and get coding.
          </Text>
        )}
        <Box flexDirection="column">
          {[...blocks].reverse().flatMap((b, back) => {
            // Newest first; `i` stays the play's own place.
            const i = last - back
            const color = readable(vibeColor(b.vibe))
            const isNow = i === last && nowKey === keyOf(b.play)
            // The gutter: the track's node, then the line down to the older
            // tracks (none under the oldest).
            const line = i > 0 ? '│' : ' '
            const row = (key: string, mark: string, body: ReturnType<typeof h>[]) => (
              <Box key={key} flexDirection="row">
                <Box width={2} flexShrink={0}>
                  <Text mono {...(mark === line ? { dimColor: true } : { color })}>
                    {mark}
                  </Text>
                </Box>
                <Box flexDirection="row" flexGrow={1} flexShrink={1} gap={1}>
                  {body}
                </Box>
              </Box>
            )
            const files = b.files.length === 0
              ? [
                  row(`${i}-none`, line, [
                    <Text mono dimColor>
                      no edits
                    </Text>,
                  ]),
                ]
              : b.files.map(([path, n], f) => {
                  const { name, folder } = splitPath(path)
                  const more = [n > 1 ? `×${n}` : '', folder].filter(Boolean).join(' · ')
                  return row(`${i}-file-${f}`, line, [
                    <Text mono>
                      {name}
                    </Text>,
                    ...(more
                      ? [
                          <Box flexShrink={1}>
                            <Text mono wrap="truncate-end" dimColor>
                              {more}
                            </Text>
                          </Box>,
                        ]
                      : []),
                  ])
                })
            return [
              row(`${i}-title`, isNow ? '▶' : '■', [
                <Box flexGrow={1} flexShrink={1}>
                  <Text mono weight="bold" wrap="truncate-end">
                    {b.play.title}
                  </Text>
                </Box>,
                <Text mono tabular dimColor>
                  {b.time}
                </Text>,
              ]),
              row(`${i}-vibe`, line, [
                ...(b.play.artist
                  ? [
                      <Box flexShrink={1}>
                        <Text mono wrap="truncate-end" dimColor>
                          {b.play.artist} ·
                        </Text>
                      </Box>,
                    ]
                  : []),
                <Text mono color={color}>
                  {b.vibe ?? '…'}
                </Text>,
                ...(b.source === 'lastfm'
                  ? [
                      <Text mono dimColor>
                        · Last.fm
                      </Text>,
                    ]
                  : []),
              ]),
              ...files,
              ...(i > 0 ? [row(`${i}-gap`, line, [])] : []),
            ]
          })}
        </Box>
      </Box>
    )
  })

  on('session.end', async ($, e, next) => {
    try {
      await save($)
    } catch {}
    const ended = await next(e)
    if (e.reason === 'clear') {
      // A /clear starts a new session with no session.start: open a new file.
      try {
        await openSession($)
      } catch (err) {
        debug($, `could not reopen after /clear: ${String(err)}`)
      }
    }
    return ended
  })
}
