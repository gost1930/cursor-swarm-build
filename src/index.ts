import { type CursorOptions, resolveCursor } from './cursor.js'
import { createHud, DEFAULT_LABELS, type Hud, type Labels } from './hud.js'
import { collectLayers } from './layers.js'
import { hideLayers, type Player, type RebuildProgress, startPlayer } from './player.js'

export { countChanges, createReplayGate, type Fingerprints, type ReplayGate } from './replay-gate.js'
export type { CursorOptions, CursorStyle } from './cursor.js'
export type { Labels } from './hud.js'
export type { RebuildPhase, RebuildProgress } from './player.js'

/** Lets web fonts and the first layout settle before the page is measured. */
const SETTLE_MS = 250
const SPEEDS: ReadonlyArray<number> = [1, 2, 4]
const DEFAULT_Z_INDEX = 2147483000

export interface BuildIntroOptions {
  /** Words for the control bar. Anything left out stays in English. */
  labels?: Partial<Labels>
  /** 1, 2 or 4. Defaults to 1. */
  speed?: number
  /** Scroll along with the build. Defaults to true. */
  tour?: boolean
  /** How the cursors look: pointer style, size, name tags, names and colors. */
  cursor?: CursorOptions
  /** Show the control bar. Defaults to true. */
  hud?: boolean
  /** Do nothing when the visitor asked for reduced motion. Defaults to true. */
  respectReducedMotion?: boolean
  zIndex?: number
  onProgress?: (progress: RebuildProgress) => void
}

export interface BuildIntro {
  /** Ends the intro at once and leaves the page fully shown. */
  skip: () => void
  /** Settles when the intro ends, by finishing or by `skip`. */
  finished: Promise<void>
}

const noop = (): void => undefined

/** Only one intro runs at a time: starting another ends the one still playing. */
let endCurrent = noop

/**
 * Hides everything under `root`, then lets a swarm of named cursors scan and rebuild it layer by
 * layer. Returns at once; await `finished` to know when the page is whole again. Esc skips it.
 */
export function buildIntro(root: Element, options: BuildIntroOptions = {}): BuildIntro {
  const { respectReducedMotion = true, hud: showHud = true, zIndex = DEFAULT_Z_INDEX } = options
  const labels: Labels = { ...DEFAULT_LABELS, ...options.labels }
  endCurrent()
  const cursor = resolveCursor(options.cursor)
  const layers = collectLayers(root)

  if (layers.length === 0 || (respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    return { skip: noop, finished: Promise.resolve() }
  }

  let speed = options.speed ?? 1
  let tour = options.tour ?? true
  let progress: RebuildProgress = { phase: 'scanning', done: 0, total: layers.length, agents: 0 }
  let player: Player | null = null
  let hud: Hud | null = null
  let timer: number | undefined
  let over = false
  let release = noop
  const finished = new Promise<void>((resolve) => {
    release = resolve
  })

  const show = hideLayers(layers)
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:${zIndex}`
  document.body.append(canvas)

  const render = (): void => hud?.update({ progress, speed, tour })
  const end = (): void => {
    if (over) return
    over = true
    window.clearTimeout(timer)
    window.removeEventListener('keydown', onKey)
    player?.stop()
    show()
    hud?.destroy()
    canvas.remove()
    if (endCurrent === end) endCurrent = noop
    release()
  }
  endCurrent = end
  const skip = (): void => end()
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') skip()
  }
  window.addEventListener('keydown', onKey)

  if (showHud) {
    hud = createHud(
      labels,
      {
        onTour: () => {
          tour = !tour
          player?.setTour(tour)
          render()
        },
        onSpeed: () => {
          speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1
          player?.setSpeed(speed)
          render()
        },
        onSkip: skip,
      },
      zIndex + 1,
    )
    render()
  }

  void document.fonts.ready.then(() => {
    if (over) return
    timer = window.setTimeout(() => {
      player = startPlayer({
        canvas,
        layers,
        speed,
        tour,
        cursor,
        onProgress: (next) => {
          progress = next
          options.onProgress?.(next)
          render()
        },
        onTourOff: () => {
          tour = false
          render()
        },
        onEnd: end,
      })
    }, SETTLE_MS)
  })

  return { skip, finished }
}
