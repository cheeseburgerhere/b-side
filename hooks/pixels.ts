// A pixel mascot SVG (MASCOTS.md) as terminal cells, for the terminal's
// Raster: each mood's pixels, moved by the mascot's own stepped keyframes,
// two pixels a cell with ▀. It reads what the vibe-mascot kit writes: <rect>
// cells in nested <g class> parts, one-class CSS fills and opacity rules,
// `steps(1)` animations that translate whole cells or blink. Anything else
// (rotation, scaling, smooth easing) is drawn as its resting pose.

type Seconds = (beat: number) => number
type Anim = { name: string; dur: Seconds; delay: Seconds }
type Decls = Record<string, string>
type Rule = { mood: string | null; cls: string; decls: Decls }
// A keyframe's values, at a fraction of the cycle.
type Key = { at: number; dx?: number; dy?: number; opacity?: number }
type Node = { classes: string[]; parent: number; rects: [number, number, number][] }

export type Mascot = {
  width: number
  height: number
  nodes: Node[]
  rules: Rule[]
  keyframes: Record<string, Key[]>
}

const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584

function seconds(value: string): Seconds | null {
  const v = value.trim()
  const plain = v.match(/^(-?[\d.]+)(m?s)$/)
  if (plain) {
    const n = Number(plain[1]) / (plain[2] === 'ms' ? 1000 : 1)
    return () => n
  }
  const beat = v.match(/^var\(--beat(?:,\s*([\d.]+)m?s)?\)$/)
  if (beat) return b => b
  const calc = v.match(/^calc\((.+?)\s*([*/])\s*(-?[\d.]+)\)$/)
  if (calc?.[1] && calc[3]) {
    const inner = seconds(calc[1])
    const k = Number(calc[3])
    if (!inner) return null
    return calc[2] === '*' ? b => inner(b) * k : b => inner(b) / k
  }
  return null
}

// `name dur steps(1) [delay] infinite`: only stepped, endless animations move.
function animation(value: string): Anim | null {
  const parts = value.match(/(?:calc|var|steps)\((?:[^()]|\([^()]*\))*\)|\S+/g) ?? []
  if (!parts.includes('infinite') || !parts.some(p => p.startsWith('steps('))) return null
  const name = parts[0]
  const times = parts.slice(1).map(seconds).filter((s): s is Seconds => s !== null)
  if (!name || !times[0]) return null
  return { name, dur: times[0], delay: times[1] ?? (() => 0) }
}

function keyframe(decls: Decls): Omit<Key, 'at'> {
  const out: Omit<Key, 'at'> = {}
  const t = decls.transform
  if (t !== undefined) {
    const px = (s: string | undefined) => Number((s ?? '0').replace('px', '')) || 0
    const x = t.match(/translateX\(([-\d.]+)px\)/)
    const y = t.match(/translateY\(([-\d.]+)px\)/)
    const xy = t.match(/translate\(([-\d.]+)px(?:,\s*([-\d.]+)px)?\)/)
    out.dx = xy ? px(xy[1]) : x ? px(x[1]) : 0
    out.dy = xy ? px(xy[2]) : y ? px(y[1]) : 0
  }
  if (decls.opacity !== undefined) out.opacity = Number(decls.opacity)
  return out
}

function declarations(body: string): Decls {
  const out: Decls = {}
  for (const d of body.split(';')) {
    const i = d.indexOf(':')
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim()
  }
  return out
}

// Splits CSS into top-level blocks: [prelude, body], body keeping nested braces.
function blocks(css: string): [string, string][] {
  const out: [string, string][] = []
  let depth = 0
  let start = 0
  let open = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{' && depth++ === 0) open = i
    else if (css[i] === '}' && --depth === 0) {
      out.push([css.slice(start, open).trim(), css.slice(open + 1, i)])
      start = i + 1
    }
  }
  return out
}

export function parseMascot(source: string): Mascot | null {
  const box = source.match(/viewBox="0 0 (\d+) (\d+)"/)
  if (!box) return null
  const css = (source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')

  const rules: Rule[] = []
  const keyframes: Record<string, Key[]> = {}
  for (const [prelude, body] of blocks(css)) {
    const frames = prelude.match(/^@keyframes\s+([\w-]+)/)
    if (frames?.[1]) {
      keyframes[frames[1]] = blocks(body)
        .flatMap(([at, decls]) =>
          at.split(',').map(p => ({ at: p.trim() === 'from' ? 0 : p.trim() === 'to' ? 1 : Number.parseFloat(p) / 100, ...keyframe(declarations(decls)) })),
        )
        .filter(k => !Number.isNaN(k.at))
        .sort((a, b) => a.at - b.at)
      continue
    }
    if (prelude.startsWith('@')) continue // @media: the reduced-motion opt-out
    const decls = declarations(body)
    for (const sel of prelude.split(',')) {
      const words = sel.trim().split(/\s+/)
      const one = (w: string | undefined) => (w && /^\.[\w-]+$/.test(w) ? w.slice(1) : null)
      if (words.length === 1 && one(words[0])) rules.push({ mood: null, cls: one(words[0])!, decls })
      else if (words.length === 2 && /^\.m-[\w-]+$/.test(words[0] ?? '') && one(words[1]))
        rules.push({ mood: words[0]!.slice(1), cls: one(words[1])!, decls })
    }
  }

  const nodes: Node[] = [{ classes: [], parent: -1, rects: [] }]
  const stack = [0]
  for (const tok of source.matchAll(/<g\b([^>]*)>|<\/g>|<rect\b([^>]*)\/>/g)) {
    if (tok[0].startsWith('</g')) {
      if (stack.length > 1) stack.pop()
    } else if (tok[0].startsWith('<g')) {
      const classes = tok[1]?.match(/\bclass="([^"]*)"/)?.[1] ?? ''
      nodes.push({ classes: classes.split(/\s+/).filter(Boolean), parent: stack.at(-1)!, rects: [] })
      stack.push(nodes.length - 1)
    } else {
      const attr = (n: string) => Number(tok[2]?.match(new RegExp(`\\b${n}="(-?\\d+)"`))?.[1] ?? Number.NaN)
      const [x, y, w, h] = [attr('x'), attr('y'), attr('width'), attr('height')]
      if ([x, y, w, h].some(Number.isNaN)) continue
      for (let dy = 0; dy < h; dy++) nodes[stack.at(-1)!]!.rects.push([x, y + dy, w])
    }
  }
  if (!nodes.some(n => n.rects.length > 0)) return null
  return { width: Number(box[1]), height: Number(box[2]), nodes, rules, keyframes }
}

// The last value a property gets from the rules that match these classes in
// this mood, in source order.
function cascade(m: Mascot, classes: string[], mood: string, prop: string): string | undefined {
  let value: string | undefined
  for (const r of m.rules)
    if (r.decls[prop] !== undefined && (r.mood === null || r.mood === mood) && classes.includes(r.cls)) value = r.decls[prop]
  return value
}

function fillOf(m: Mascot, classes: string[], vibe: number): number | null {
  const fill = cascade(m, classes, '', 'fill')
  if (!fill) return null
  if (fill.startsWith('var(--vibe')) return vibe
  const hex = fill.match(/#([0-9a-f]{6})/i)?.[1]
  return hex ? Number.parseInt(hex, 16) : null
}

// One node's motion at time t: a stepped keyframe holds until the next one.
function motion(m: Mascot, node: Node, mood: string, beat: number, t: number) {
  const value = cascade(m, node.classes, mood, 'animation')
  const anim = value ? animation(value) : null
  const frames = anim ? m.keyframes[anim.name] : undefined
  if (!anim || !frames) return { dx: 0, dy: 0, opacity: 1 }
  const delayed = cascade(m, node.classes, mood, 'animation-delay')
  const delay = (delayed ? seconds(delayed) : null) ?? anim.delay
  const dur = anim.dur(beat)
  const phase = dur > 0 ? ((((t + -delay(beat)) / dur) % 1) + 1) % 1 : 0
  const at = (prop: 'dx' | 'dy' | 'opacity', base: number) =>
    frames.filter(k => k.at <= phase && k[prop] !== undefined).at(-1)?.[prop] ?? base
  return { dx: at('dx', 0), dy: at('dy', 0), opacity: at('opacity', 1) }
}

// A picture: colors by `y * width + x`, transparent where absent.
export type Picture = { width: number; height: number; pixels: Map<number, number> }

// The mascot at time t (seconds), `shrink` pixels to one (see shrink()), as
// Raster cells.
export function frame(m: Mascot, mood: string, beat: number, vibe: number, t: number, shrinkBy = 1): string {
  return cells(shrink(picture(m, mood, beat, vibe, t), shrinkBy))
}

// The Raster's size for a mascot drawn at 1/shrinkBy.
export function cellSize(m: Mascot, shrinkBy = 1) {
  const width = Math.ceil(m.width / shrinkBy)
  return { columns: width, rows: Math.ceil(Math.ceil(m.height / shrinkBy) / 2) }
}

const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11

// Each k×k block becomes one pixel: its most common color, the darker on a
// tie so outlines and eyes survive; transparent where most of it is.
export function shrink(p: Picture, k: number): Picture {
  if (k <= 1) return p
  const width = Math.ceil(p.width / k)
  const height = Math.ceil(p.height / k)
  const pixels = new Map<number, number>()
  for (let by = 0; by < height; by++)
    for (let bx = 0; bx < width; bx++) {
      const counts = new Map<number, number>()
      for (let y = by * k; y < Math.min((by + 1) * k, p.height); y++)
        for (let x = bx * k; x < Math.min((bx + 1) * k, p.width); x++) {
          const c = p.pixels.get(y * p.width + x)
          if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      const opaque = [...counts.values()].reduce((a, b) => a + b, 0)
      if (opaque * 2 < k * k) continue
      const [best] = [...counts].sort((a, b) => b[1] - a[1] || luma(a[0]) - luma(b[0]))
      if (best) pixels.set(by * width + bx, best[0])
    }
  return { width, height, pixels }
}

// A picture as Raster cells, two pixels a cell (▀ ▄): base64 of
// [codePoint, foreground, background] u32 triplets, row-major.
export function cells({ width, height, pixels }: Picture): string {
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < width; x++) {
      const top = pixels.get(2 * r * width + x)
      const bottom = 2 * r + 1 < height ? pixels.get((2 * r + 1) * width + x) : undefined
      const at = (r * width + x) * 3
      if (top !== undefined) words.set([UPPER, top, bottom ?? DEFAULT], at)
      else if (bottom !== undefined) words.set([LOWER, bottom, DEFAULT], at)
      else words.set([0x20, DEFAULT, DEFAULT], at)
    }
  return new Uint8Array(words.buffer).toBase64()
}

function picture(m: Mascot, mood: string, beat: number, vibe: number, t: number): Picture {
  const { width, height } = m
  const pixels = new Map<number, number>()
  const placed = m.nodes.map(() => ({ dx: 0, dy: 0, shown: true, classes: [] as string[] }))
  m.nodes.forEach((node, i) => {
    const up = node.parent >= 0 ? placed[node.parent]! : { dx: 0, dy: 0, shown: true, classes: [] }
    const move = motion(m, node, mood, beat, t)
    const hidden = node.classes.some(c => cascade(m, [c], mood, 'opacity') === '0')
    const here = (placed[i] = {
      dx: up.dx + move.dx,
      dy: up.dy + move.dy,
      shown: up.shown && !hidden && move.opacity > 0,
      classes: [...up.classes, ...node.classes],
    })
    if (!here.shown || node.rects.length === 0) return
    // The innermost class with a fill colors the cells.
    let color: number | null = null
    for (let k = here.classes.length - 1; k >= 0 && color === null; k--) color = fillOf(m, [here.classes[k]!], vibe)
    if (color === null) return
    for (const [x, y, w] of node.rects)
      for (let c = 0; c < w; c++) {
        const px = x + c + here.dx
        const py = y + here.dy
        if (px >= 0 && px < width && py >= 0 && py < height) pixels.set(py * width + px, color)
      }
  })
  return { width, height, pixels }
}
