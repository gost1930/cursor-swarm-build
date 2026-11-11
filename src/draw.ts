import { DEFAULT_CURSOR, drawCursor, type ResolvedCursor, tagOffset } from './cursor.js'
import { clamp, easeOut, sampleTrack, tremor } from './geometry.js'
import { FADE, INTRO, type Plan, type PlannedLayer } from './plan.js'

const TAG_FONT = '600 11px ui-sans-serif, system-ui, sans-serif'
const GUIDE_COLOR = '#ff5c35'
const GUIDE_SECONDS = 0.3
const RIPPLE_SECONDS = 0.45
/** How far back in time a cursor's heading is read, to lean it into its movement. */
const LEAN_WINDOW = 0.05

interface Viewport {
  w: number
  h: number
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.font = TAG_FONT
  const width = ctx.measureText(text).width + 16
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 1
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, width, 21, 10.5)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 8, y + 11)
}

function drawHandles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = '#ffffff'
  for (const [cx, cy] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ] as const) {
    ctx.fillRect(cx - 3, cy - 3, 6, 6)
    ctx.strokeRect(cx - 3, cy - 3, 6, 6)
  }
}

/** The outline a cursor drags out around a box or picture, ruler guide first. */
function drawShape(
  ctx: CanvasRenderingContext2D,
  item: PlannedLayer,
  color: string,
  time: number,
  scrollY: number,
  view: Viewport,
): void {
  const { x, w, h } = item.layer.box
  const y = item.layer.box.y - scrollY
  const drawn = easeOut(clamp((time - item.start) / Math.max(item.revealAt - item.start, 0.01), 0, 1))
  const fade = 1 - clamp((time - item.revealAt) / FADE, 0, 1)

  if (time - item.start < GUIDE_SECONDS) {
    ctx.save()
    ctx.globalAlpha = 1 - (time - item.start) / GUIDE_SECONDS
    ctx.strokeStyle = GUIDE_COLOR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.round(y) + 0.5)
    ctx.lineTo(view.w, Math.round(y) + 0.5)
    ctx.stroke()
    ctx.restore()
  }
  if (fade <= 0) return

  ctx.save()
  ctx.globalAlpha = fade * 0.08
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * drawn, h * drawn)
  ctx.globalAlpha = fade
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.strokeRect(x, y, w * drawn, h * drawn)
  drawHandles(ctx, x, y, w * drawn, h * drawn)
  if (time < item.revealAt) {
    const label = `${Math.round(w * drawn)} × ${Math.round(h * drawn)}`
    drawTag(ctx, label, x + w * drawn + 10, y + h * drawn + 12, color)
  }
  ctx.restore()
}

/** The selection a cursor puts on a line of text while it is typed in, with a caret at its end. */
function drawTyping(
  ctx: CanvasRenderingContext2D,
  item: PlannedLayer,
  color: string,
  time: number,
  scrollY: number,
): void {
  const { x, w, h } = item.layer.box
  const y = item.layer.box.y - scrollY
  const typed = clamp((time - item.start) / Math.max(item.end - item.start, 0.01), 0, 1)
  const fade = 1 - clamp((time - item.end) / FADE, 0, 1)
  if (fade <= 0) return

  const caret = item.layer.rtl ? x + w - w * typed : x + w * typed
  ctx.save()
  ctx.globalAlpha = fade
  ctx.lineWidth = 1
  ctx.strokeStyle = color
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4)
  ctx.globalAlpha = fade * 0.12
  ctx.fillStyle = color
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4)
  ctx.globalAlpha = fade
  ctx.fillRect(caret - 1, y, 2, h)
  ctx.restore()
}

/** A ring that spreads from the spot a cursor starts working on: the click. */
function drawRipple(
  ctx: CanvasRenderingContext2D,
  item: PlannedLayer,
  color: string,
  time: number,
  scrollY: number,
): void {
  const progress = clamp((time - item.start) / RIPPLE_SECONDS, 0, 1)
  if (progress >= 1) return
  const { x, y, w, h } = item.layer.box
  const text = item.layer.kind === 'text'
  const originX = text && item.layer.rtl ? x + w : x
  const originY = (text ? y + h / 2 : y) - scrollY

  ctx.save()
  ctx.globalAlpha = (1 - progress) * 0.55
  ctx.lineWidth = 2 - progress
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(originX, originY, 3 + easeOut(progress) * 15, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** The large grey pointer that opens the scan, before the swarm spreads out. */
function drawScanner(ctx: CanvasRenderingContext2D, time: number, view: Viewport): void {
  const alpha = clamp((INTRO - time) / 0.4, 0, 1) * clamp(time / 0.25, 0, 1)
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha * 0.55
  const sway = { x: Math.sin(time * 3) * 6, y: Math.cos(time * 3) * 6 }
  drawCursor(ctx, DEFAULT_CURSOR, view.w / 2 - 14 + sway.x, view.h / 2 + sway.y, '#bdbdbd', 0, 2.6)
  ctx.restore()
}

/** One frame: outlines first, so the named cursors always sit on top of them. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  plan: Plan,
  time: number,
  scrollY: number,
  view: Viewport,
  cursor: ResolvedCursor = DEFAULT_CURSOR,
): void {
  ctx.clearRect(0, 0, view.w, view.h)
  drawScanner(ctx, time, view)

  for (const item of plan.layers) {
    if (time < item.start || time > item.end + FADE) continue
    const top = item.layer.box.y - scrollY
    if (top > view.h || top + item.layer.box.h < 0) continue
    const color = plan.cursors[item.cursor]?.color ?? '#ff3d71'
    if (item.layer.kind === 'text') drawTyping(ctx, item, color, time, scrollY)
    else drawShape(ctx, item, color, time, scrollY, view)
    drawRipple(ctx, item, color, time, scrollY)
  }

  const presence = Math.min(clamp(time / 0.35, 0, 1), clamp((plan.duration - time) / 0.6, 0, 1))
  plan.cursors.forEach((track, index) => {
    const here = sampleTrack(track.frames, time)
    const before = sampleTrack(track.frames, time - LEAN_WINDOW)
    const shake = tremor(time, index)
    const x = here.x + shake.x
    const y = here.y + shake.y - scrollY
    if (y < -40 || y > view.h + 40) return

    const lean = clamp((here.x - before.x) / LEAN_WINDOW / 3200, -0.22, 0.22)
    ctx.globalAlpha = presence
    drawCursor(ctx, cursor, x, y, track.color, lean)
    if (cursor.tags) {
      const offset = tagOffset(cursor)
      drawTag(ctx, track.name, x + offset.x, y + offset.y, track.color)
    }
  })
  ctx.globalAlpha = 1
}
