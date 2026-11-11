import type { ResolvedCursor } from './cursor.js'
import { drawFrame } from './draw.js'
import { clamp, smoothDamp } from './geometry.js'
import type { Layer, StyledElement } from './layers.js'
import { buildPlan, INTRO, type Plan } from './plan.js'

/** How long the page takes to glide to the cursors, while building and while returning to the top. */
const FOLLOW_SMOOTH = 0.7
const RETURN_SMOOTH = 1.3
/** Top speed of the tour in pixels per second, building and returning. */
const FOLLOW_PIXELS = 1500
const RETURN_PIXELS = 2400
/** How far above the viewport's middle the page follows the layer being built. */
const FOLLOW_OFFSET = 0.35
const REVEAL_SECONDS = 0.25
/** The longest the intro waits after its timeline for the page to finish scrolling back, in seconds. */
const SETTLE_LIMIT = 2.5

export type RebuildPhase = 'scanning' | 'building'

export interface RebuildProgress {
  phase: RebuildPhase
  done: number
  total: number
  agents: number
}

export interface Player {
  stop: () => void
  setSpeed: (speed: number) => void
  setTour: (tour: boolean) => void
}

interface PlayerOptions {
  canvas: HTMLCanvasElement
  layers: ReadonlyArray<Layer>
  speed: number
  tour: boolean
  cursor: ResolvedCursor
  onProgress: (progress: RebuildProgress) => void
  /** The visitor scrolled by hand, which switches the tour off. */
  onTourOff: () => void
  onEnd: () => void
}

/** Hides every layer so the intro can build them back; returns the way back. */
export function hideLayers(layers: ReadonlyArray<Layer>): () => void {
  for (const { element } of layers) element.style.visibility = 'hidden'
  return () => {
    for (const { element } of layers) showLayer(element)
  }
}

/** Undoes the hiding, and leaves no empty `style` attribute behind. */
function showLayer(element: StyledElement): void {
  element.style.removeProperty('visibility')
  if (!element.getAttribute('style')) element.removeAttribute('style')
}

/** Shows a layer the way it is built: text typed across, anything else fading in. */
function reveal(element: StyledElement, layer: Layer, seconds: number): Animation {
  element.style.removeProperty('visibility')
  const frame = element.getBoundingClientRect()
  const text = layer.box
  const typed = layer.rtl
    ? `inset(0 0 0 ${Math.max(0, text.x + text.w - (frame.left + window.scrollX))}px)`
    : `inset(0 ${Math.max(0, frame.right + window.scrollX - text.x)}px 0 0)`
  const frames =
    layer.kind === 'text'
      ? [{ clipPath: typed }, { clipPath: 'inset(0 0 0 0)' }]
      : [{ opacity: 0 }, { opacity: 1 }]
  return element.animate(frames, { duration: seconds * 1000, easing: 'linear' })
}

function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(window.innerWidth * ratio)
  canvas.height = Math.round(window.innerHeight * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
}

/**
 * Plays the intro over a page whose layers are already hidden (see `hideLayers`): a swarm of named
 * cursors scans it, then builds it back layer by layer. `stop` leaves everything shown.
 */
export function startPlayer({
  canvas,
  layers,
  speed: initialSpeed,
  tour: initialTour,
  cursor,
  onProgress,
  onTourOff,
  onEnd,
}: PlayerOptions): Player {
  const ctx = canvas.getContext('2d')
  const noop: Player = {
    stop: () => undefined,
    setSpeed: () => undefined,
    setTour: () => undefined,
  }
  if (!ctx) {
    onEnd()
    return noop
  }

  const plan: Plan = buildPlan(
    layers,
    { w: window.innerWidth, h: window.innerHeight },
    { names: cursor.names, colors: cursor.colors },
  )
  const running = new Set<Animation>()
  const shown = new Set<number>()
  let speed = initialSpeed
  let tour = initialTour
  let time = 0
  let frame = 0
  let last = performance.now()
  let reported = ''
  let focus = 0
  let position = window.scrollY
  let velocity = 0
  let aim = position
  let aimVelocity = 0

  fitCanvas(canvas, ctx)
  const onResize = (): void => fitCanvas(canvas, ctx)
  const onWheel = (): void => {
    if (!tour) return
    tour = false
    onTourOff()
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('touchstart', onWheel, { passive: true })

  const report = (): void => {
    const done = plan.layers.filter((item) => time >= item.end).length
    const phase: RebuildPhase = time < INTRO ? 'scanning' : 'building'
    const key = `${phase}:${done}`
    if (key === reported) return
    reported = key
    onProgress({ phase, done, total: plan.layers.length, agents: plan.cursors.length })
  }

  /*
   * The tour keeps the page centred on where the cursors are working: the middle of the layers
   * being built right now. A critically damped spring carries the page there, so it glides, never
   * lurches or stops dead, and settles back to the top the same way once everything is built.
   */
  const focusY = (): number => {
    const active = plan.layers.filter((item) => time >= item.start && time <= item.end + 0.3)
    const small = active.filter((item) => item.layer.box.h < window.innerHeight * 0.6)
    const pool = small.length > 0 ? small : active
    if (pool.length === 0) return focus
    focus = pool.reduce((sum, item) => sum + item.layer.box.y + item.layer.box.h / 2, 0) / pool.length
    return focus
  }

  const follow = (seconds: number): void => {
    if (!tour || seconds <= 0) return
    if (Math.abs(window.scrollY - Math.round(position)) > 2) {
      position = window.scrollY
      aim = position
      velocity = 0
      aimVelocity = 0
    }
    const returning = time >= plan.duration - plan.outro
    const wanted = returning || time < INTRO ? 0 : focusY() - window.innerHeight * FOLLOW_OFFSET
    const limit = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0)
    const smooth = Math.max((returning ? RETURN_SMOOTH : FOLLOW_SMOOTH) / speed, 0.2)
    const top = (returning ? RETURN_PIXELS : FOLLOW_PIXELS) * speed

    // Two springs in a row: the first softens where the page is heading, the second carries the
    // page there. A single spring starts a long move with a jolt; two start and end it gently.
    const heading = smoothDamp(aim, clamp(wanted, 0, limit), aimVelocity, smooth * 0.8, seconds, top)
    aim = heading.value
    aimVelocity = heading.velocity
    const moved = smoothDamp(position, aim, velocity, smooth * 0.6, seconds, top * 1.2)
    position = moved.value
    velocity = moved.velocity
    window.scrollTo({ top: position, behavior: 'instant' })
  }

  const stop = (): void => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('touchstart', onWheel)
    for (const animation of running) animation.cancel()
    running.clear()
    for (const { element } of layers) showLayer(element)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const tick = (now: number): void => {
    const seconds = Math.min((now - last) / 1000, 0.1)
    last = now
    time += seconds * speed

    plan.layers.forEach((item, index) => {
      if (time < item.revealAt || shown.has(index)) return
      shown.add(index)
      const length = item.layer.kind === 'text' ? item.end - item.start : REVEAL_SECONDS
      const animation = reveal(item.layer.element, item.layer, length / speed)
      running.add(animation)
      animation.finished.then(
        () => running.delete(animation),
        () => running.delete(animation),
      )
    })

    report()
    follow(seconds)
    drawFrame(
      ctx,
      plan,
      time,
      window.scrollY,
      { w: window.innerWidth, h: window.innerHeight },
      cursor,
    )

    // The page may still be gliding back to the top: wait for it, within reason.
    const settled = !tour || window.scrollY < 2 || time >= plan.duration + SETTLE_LIMIT
    if (time >= plan.duration && settled) {
      if (tour) window.scrollTo({ top: 0, behavior: 'instant' })
      stop()
      onEnd()
      return
    }
    frame = requestAnimationFrame(tick)
  }

  report()
  frame = requestAnimationFrame(tick)
  return {
    stop,
    setSpeed: (value) => {
      speed = value
    },
    setTour: (value) => {
      tour = value
    },
  }
}
