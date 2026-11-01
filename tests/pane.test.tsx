import { expect, mock, test } from 'claude-code/testing'

const LOG = {
  session_id: 's1',
  started_at: '2026-10-30T18:00:00.000Z',
  cwd: 'C:\\proj',
  plays: [
    { started_at: '2026-10-30T18:01:00.000Z', title: 'Recollect', artist: 'Konomi Suzuki', app: 'Spotify', vibe_guess: 'dreamy electronic' },
    { started_at: '2026-10-30T18:05:00.000Z', title: 'Raven Sky', artist: 'Ado', app: 'Vivaldi', vibe_guess: null },
    { started_at: '2026-10-30T18:06:00.000Z', title: 'Steak frites', artist: 'Jandre', app: 'Vivaldi', vibe_guess: 'lo-fi jazz' },
  ],
  edits: [
    { timestamp: '2026-10-30T18:02:00.000Z', title: 'Recollect', artist: 'Konomi Suzuki', app: 'Spotify', vibe_guess: 'dreamy electronic', tool: 'Edit', file_path: 'C:\\proj\\src\\a.ts' },
    { timestamp: '2026-10-30T18:03:00.000Z', title: 'Recollect', artist: 'Konomi Suzuki', app: 'Spotify', vibe_guess: 'dreamy electronic', tool: 'Write', file_path: 'C:\\proj\\src\\a.ts' },
  ],
}

const PANE = {
  plugin: 'b-side',
  component: 'Pane',
  requestId: 'vibe-timeline',
  props: {
    title: 'Soundtrack',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the timeline draws each track with its files, on desktop and terminal', async ($, on) => {
  on('env.get', () => ({ value: 'C:\\Users\\me' }))
  on('session.usage', () => ({ value: { startedAt: Date.parse(LOG.started_at) } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: 'C:\\proj' }))
  on('fs.read', (_, e) => ({
    value: e.path.endsWith('.svg')
      ? '<svg viewBox="0 0 20 20"><title>Test mascot</title></svg>'
      : e.path.endsWith('vibe-labels.json')
        ? JSON.stringify({ 'jandre — steak frites': 'not music' })
        : JSON.stringify(LOG),
  }))
  on('command.register', () => ({ value: { command: 'soundtrack' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /2 tracks/ }))?.text).toBe('2 tracks · 2 edits')
    expect(await ui.find({ type: 'Text', text: /^Recollect$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /dreamy/ }))?.text).toBe('dreamy electronic')
    expect((await ui.find({ type: 'Text', text: /Konomi/ }))?.text).toBe('Konomi Suzuki ·')
    expect((await ui.find({ type: 'Text', text: /a\.ts/ }))?.text).toBe('a.ts')
    expect((await ui.find({ type: 'Text', text: /src$/ }))?.text).toBe('×2 · src')
    expect((await ui.find({ type: 'Text', text: /no edits/ }))?.text).toBe('no edits')
    expect(await ui.find({ type: 'Text', text: /Steak/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /silence/ }))?.text).toBe('silence')
    // Nothing plays in the test, so the mascot sleeps and the equalizer lies low.
    if (surface === 'desktop') {
      const svgs = await ui.findAll({ type: 'Svg' })
      const svg = (alt: string) => svgs.find(s => s.props.alt === alt)
      expect(String(svg('Test mascot')?.props.source)).toContain('class="m-sleep"')
      expect(String(svg('equalizer')?.props.source)).not.toContain('class="on')
      const name = svg('B-side')
      expect(name?.props.width).toBe(124)
      expect(String(name?.props.source)).not.toContain('class="on')
    } else {
      // A mascot with no pixels keeps the kaomoji; the name and the
      // equalizer are pixels, as wide as each other.
      expect((await ui.find({ type: 'Text', text: /zzZ/ }))?.text).toBe('(－_－) zzZ')
      const rasters = await ui.findAll({ type: 'Raster' })
      expect(rasters.map(r => [r.props.columns, r.props.rows])).toEqual([[31, 4], [31, 3]])
      // Silent, every bar is one block high, in the quiet color.
      const eq = cellsOf(rasters[1]?.props.cells)
      expect(eq.slice(2 * 31 * 3, 2 * 31 * 3 + 6)).toEqual(['2584', '6b6461', '1000000', '20', '1000000', '1000000'])
      expect(eq.slice(0, 3 * 31 * 2).every((w, i) => i % 3 !== 0 || w === '20')).toBe(true)
    }
    await ui.unmount()
  }
})

test('an aggressive track of any genre gets the m-bang mood', async ($, on) => {
  const clock = mock.clock(on)
  const written: Record<string, string> = {}
  on('env.get', () => ({ value: 'C:\\Users\\me' }))
  on('session.usage', () => ({ value: { startedAt: Date.parse(LOG.started_at) } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: 'C:\\proj' }))
  // Labeled before moods had a `feel`: its words alone would bounce.
  on('fs.read', (_, e) => ({
    value: e.path.endsWith('.svg')
      ? '<svg viewBox="0 0 20 20"><title>Test mascot</title></svg>'
      : e.path.endsWith('vibe-labels.json')
        ? (written[e.path] ?? JSON.stringify({ 'nirvana — breed': 'grunge rock' }))
        : JSON.stringify(LOG),
  }))
  on('fs.write', (_, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'soundtrack' } }))
  on('ui.panes', () => ({ value: [{ id: 'vibe-timeline', title: 'Soundtrack', isShown: true, isFocused: false }] }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: JSON.stringify({ title: 'Breed', artist: 'Nirvana', app: 'Spotify', status: 'playing' }), stderr: '' },
  }))
  const asked: string[] = []
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return {
      value: {
        isAnswered: true,
        text: '1. raw grunge\n2. aggressive',
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:\\proj', surface: 'desktop', isInteractive: true })
  await clock.advance(15_000)

  expect(asked.length).toBe(1)
  const labels = JSON.parse(written['C:\\Users\\me\\.claude\\vibe\\vibe-labels.json'] ?? '{}')
  // The label it had stays; only the feel is added.
  expect(labels['nirvana — breed']).toEqual({ vibe: 'grunge rock', source: 'haiku', feel: 'aggressive' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(String(svgs.find(s => s.props.alt === 'Test mascot')?.props.source)).toContain('class="m-bang')
  await ui.unmount()

  // Heard again, it is not asked about twice.
  await clock.advance(15_000)
  expect(asked.length).toBe(1)
})

// Two pixels a cell: red on top, green below it only while asleep; in
// m-sleep the red one drops a row on each second half of its 1 s cycle.
const PIXEL_MASCOT =
  '<svg viewBox="0 0 2 2" width="8" height="8"><title>Pixel mascot</title><style>' +
  '.a{fill:#ff0000}.zz{fill:var(--vibe,#00ff00)}.zz{opacity:0}.m-sleep .zz{opacity:1}' +
  '.m-sleep .drop{animation:drop 1s steps(1) infinite}@keyframes drop{50%{transform:translateY(1px)}}' +
  '</style><g class="drop"><g class="a"><rect x="0" y="0" width="1" height="1"/></g></g>' +
  '<g class="zz"><rect x="1" y="1" width="1" height="1"/></g></svg>'

const cellsOf = (base64: unknown) => {
  const bytes = Uint8Array.fromBase64(String(base64))
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
  return [...words].map(w => w.toString(16))
}

test('the terminal draws a pixel mascot as a Raster and dances it with blits', async ($, on) => {
  const clock = mock.clock(on)
  on('env.get', () => ({ value: 'C:\Users\me' }))
  on('session.usage', () => ({ value: { startedAt: Date.parse(LOG.started_at) } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: 'C:\proj' }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('.svg') ? PIXEL_MASCOT : e.path.endsWith('vibe-labels.json') ? '{}' : JSON.stringify(LOG) }))
  on('command.register', () => ({ value: { command: 'soundtrack' } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '{}', stderr: '' } }))
  const blits: string[][] = []
  on('ui.blit', (_, e) => {
    if ('cells' in e) blits.push(cellsOf(e.cells))
    return { value: {} }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:\proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(2)
  expect(raster?.props.rows).toBe(1)
  // Nothing plays: asleep, the quiet color standing in for the vibe.
  expect(cellsOf(raster?.props.cells)).toEqual(['2580', 'ff0000', '1000000', '2584', '6b6461', '1000000'])
  expect(await ui.find({ type: 'Text', text: /zzZ/ })).toBeUndefined()

  // Half a cycle on, the red pixel has dropped to the bottom half.
  await clock.advance(600)
  expect(blits.at(-1)).toEqual(['2584', 'ff0000', '1000000', '2584', '6b6461', '1000000'])
  await ui.unmount()
})

test('a mascot taller than 10 rows is drawn at half size in the terminal', async ($, on) => {
  const big =
    '<svg viewBox="0 0 24 24"><title>Big</title><style>.a{fill:#ff0000}</style>' +
    '<g class="a"><rect x="0" y="0" width="24" height="24"/></g></svg>'
  on('env.get', () => ({ value: 'C:\Users\me' }))
  on('session.usage', () => ({ value: { startedAt: Date.parse(LOG.started_at) } }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: 'C:\proj' }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('.svg') ? big : e.path.endsWith('vibe-labels.json') ? '{}' : JSON.stringify(LOG) }))
  on('command.register', () => ({ value: { command: 'soundtrack' } }))
  on('ui.blit', () => ({ value: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:\proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const [mascot] = await ui.findAll({ type: 'Raster' })
  // 24 pixels would be 12 rows; halved, 12 columns by 6 rows.
  expect([mascot?.props.columns, mascot?.props.rows]).toEqual([12, 6])
  expect(cellsOf(mascot?.props.cells).slice(0, 3)).toEqual(['2580', 'ff0000', 'ff0000'])
  await ui.unmount()
})
