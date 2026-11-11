import { clamp, type Keyframe, seededRandom } from './geometry.js'
import { DEFAULT_COLORS, DEFAULT_NAMES } from './cursor.js'
import type { Layer } from './layers.js'

/** Seconds the cursors take to arrive and scan the page before anything is built. */
export const INTRO = 1.4
/** Seconds an outline takes to fade once its layer is real. */
export const FADE = 0.25

/** How long all the building should roughly take, however many layers there are. */
const TARGET_BUILD = 14
/** A cursor reaches its next layer this long before it starts on it. */
const ARRIVE_EARLY = 0.05
/** The longest a move between two layers takes; any extra wait is spent standing still. */
const MAX_TRAVEL = 0.85
const GAP = 0.1
/** The page scrolls back to the top this fast once everything is built, in pixels per second. */
const RETURN_SPEED = 1100
const MIN_OUTRO = 0.8
const MAX_OUTRO = 3.2
const MIN_CURSORS = 6
const MAX_CURSORS = 14

export interface PlannedLayer {
  layer: Layer
  cursor: number
  start: number
  /** When the real layer starts to appear: at once for text, once outlined for the rest. */
  revealAt: number
  end: number
}

export interface CursorTrack {
  name: string
  color: string
  frames: Array<Keyframe>
}

export interface Plan {
  layers: Array<PlannedLayer>
  cursors: Array<CursorTrack>
  /** Seconds after the last layer for the cursors to leave and the page to scroll back up. */
  outro: number
  duration: number
}

function baseDuration(layer: Layer): number {
  if (layer.kind === 'text') return clamp(0.35 + layer.chars * 0.02, 0.4, 1.4)
  return layer.kind === 'media' ? 0.9 : 0.7
}

/** Where a cursor works on a layer, from where it starts to where it finishes. */
function stroke(layer: Layer): [{ x: number; y: number }, { x: number; y: number }] {
  const { x, y, w, h } = layer.box
  if (layer.kind !== 'text')
    return [
      { x, y },
      { x: x + w, y: y + h },
    ]
  const middle = y + h / 2
  return layer.rtl
    ? [
        { x: x + w, y: middle },
        { x, y: middle },
      ]
    : [
        { x, y: middle },
        { x: x + w, y: middle },
      ]
}

/** Layers in, a timeline out: which cursor builds what and when, and where every cursor goes. */
export function buildPlan(
  layers: ReadonlyArray<Layer>,
  viewport: { w: number; h: number },
  look: { names?: ReadonlyArray<string>; colors?: ReadonlyArray<string> } = {},
): Plan {
  const names = look.names ?? DEFAULT_NAMES
  const colors = look.colors ?? DEFAULT_COLORS
  const random = seededRandom(layers.length * 7919 + Math.round(viewport.w))
  const count = clamp(Math.round(Math.sqrt(layers.length) * 1.3), MIN_CURSORS, MAX_CURSORS)
  const durations = layers.map(baseDuration)
  const load = durations.reduce((sum, value) => sum + value, 0) / count
  const scale = load > TARGET_BUILD ? Math.max(TARGET_BUILD / load, 0.25) : 1

  const free = new Array<number>(count).fill(INTRO)
  let previous = INTRO
  const planned = layers.map((layer, index): PlannedLayer => {
    const cursor = free.indexOf(Math.min(...free))
    const length = Math.max(0.12, (durations[index] ?? 0.4) * scale)
    const start = Math.max(free[cursor] ?? INTRO, previous)
    previous = start
    free[cursor] = start + length + GAP
    const revealAt = layer.kind === 'text' ? start : start + length * 0.7
    return { layer, cursor, start, revealAt, end: start + length }
  })

  const lastEnd = planned.reduce((latest, item) => Math.max(latest, item.end), INTRO)
  const pageBottom = layers.reduce(
    (lowest, layer) => Math.max(lowest, layer.box.y + layer.box.h),
    0,
  )
  const outro = clamp((pageBottom - viewport.h) / RETURN_SPEED, MIN_OUTRO, MAX_OUTRO)
  const duration = lastEnd + outro

  const cursors = Array.from({ length: count }, (_, cursor): CursorTrack => {
    const edge = random() < 0.5 ? -40 : viewport.w + 40
    const bow = (): number => (random() - 0.5) * 0.5
    const frames: Array<Keyframe> = [
      { t: 0, x: edge, y: random() * viewport.h, bend: bow() },
      {
        t: INTRO * 0.55,
        x: viewport.w * (0.35 + random() * 0.3),
        y: viewport.h * (0.3 + random() * 0.3),
        bend: bow(),
      },
      {
        t: INTRO,
        x: viewport.w * (0.2 + random() * 0.6),
        y: viewport.h * (0.15 + random() * 0.6),
        bend: bow(),
      },
    ]
    const own = planned.filter((item) => item.cursor === cursor)

    for (const item of own) {
      const [from, to] = stroke(item.layer)
      const previous = frames[frames.length - 1]
      const arrive = Math.max(item.start - ARRIVE_EARLY, (previous?.t ?? 0) + 0.05)
      // A long wait is spent standing still, then the move itself takes a natural beat.
      if (previous && arrive - previous.t > MAX_TRAVEL) {
        frames.push({ t: arrive - MAX_TRAVEL, x: previous.x, y: previous.y, bend: bow() })
      }
      frames.push({ t: arrive, ...from, bend: 0 })
      frames.push({ t: Math.max(item.revealAt, item.end - 0.04), ...to, bend: bow() })
    }
    if (own.length === 0) {
      for (let t = INTRO + 0.9; t < lastEnd; t += 1.1) {
        frames.push({ t, x: random() * viewport.w, y: random() * viewport.h * 1.4, bend: bow() })
      }
    }

    const tail = frames[frames.length - 1]
    const exitX = (tail?.x ?? 0) < viewport.w / 2 ? -60 : viewport.w + 60
    frames.push({ t: Math.max(duration, (tail?.t ?? 0) + 0.1), x: exitX, y: tail?.y ?? 0 })
    return {
      name: names[cursor % names.length] ?? '',
      color: colors[cursor % colors.length] ?? '#ff3d71',
      frames,
    }
  })

  return { layers: planned, cursors, outro, duration }
}
