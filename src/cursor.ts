export type CursorStyle = 'arrow' | 'classic' | 'dot' | 'crosshair' | 'custom'

export interface CursorOptions {
  /**
   * The pointer's look. `arrow` is the default, `classic` a plain operating-system-like pointer
   * with a tail and a dark edge, `dot` and `crosshair` are minimal, and `custom` draws `path`.
   */
  style?: CursorStyle
  /** SVG path data for `style: 'custom'`, drawn with its tip at 0,0 and roughly 24 units tall. */
  path?: string
  /** Scales the pointer. Defaults to 1. */
  size?: number
  /** Show the name beside every cursor. Defaults to true. */
  tags?: boolean
  /** Names for the cursors, used in turn. */
  names?: ReadonlyArray<string>
  /** Colors for the cursors, used in turn. Any CSS color works. */
  colors?: ReadonlyArray<string>
}

export interface ResolvedCursor {
  style: CursorStyle
  path: Path2D | null
  size: number
  tags: boolean
  names: ReadonlyArray<string>
  colors: ReadonlyArray<string>
}

export const DEFAULT_NAMES: ReadonlyArray<string> = [
  'Maya', 'Noor', 'Leo', 'Sami', 'Ines', 'Yassine', 'Lina',
  'Omar', 'Zoe', 'Karim', 'Amel', 'Adam', 'Dina', 'Ryan',
]

export const DEFAULT_COLORS: ReadonlyArray<string> = [
  '#ff3d71', '#7c4dff', '#00b8d9', '#00c48c', '#ffab00', '#ff7a45', '#2f6bff',
  '#e040fb', '#26a69a', '#ef5350', '#42a5f5', '#9ccc65', '#ffa726', '#8d6e63',
]

export const DEFAULT_CURSOR: ResolvedCursor = {
  style: 'arrow',
  path: null,
  size: 1,
  tags: true,
  names: DEFAULT_NAMES,
  colors: DEFAULT_COLORS,
}

/** Fills in everything left out, and falls back to the arrow when a custom pointer has no path. */
export function resolveCursor(options: CursorOptions = {}): ResolvedCursor {
  const wantsCustom = options.style === 'custom' && Boolean(options.path)
  return {
    style: wantsCustom ? 'custom' : options.style === 'custom' ? 'arrow' : (options.style ?? 'arrow'),
    path: wantsCustom && options.path ? new Path2D(options.path) : null,
    size: options.size && options.size > 0 ? options.size : 1,
    tags: options.tags ?? true,
    names: options.names && options.names.length > 0 ? options.names : DEFAULT_NAMES,
    colors: options.colors && options.colors.length > 0 ? options.colors : DEFAULT_COLORS,
  }
}

function arrowPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 16.6)
  ctx.lineTo(4.4, 12.6)
  ctx.lineTo(7.7, 19.6)
  ctx.lineTo(11, 18.1)
  ctx.lineTo(7.7, 11.2)
  ctx.lineTo(13.2, 11)
  ctx.closePath()
}

function classicPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 18)
  ctx.lineTo(4.2, 14)
  ctx.lineTo(7.4, 21)
  ctx.lineTo(10.2, 19.8)
  ctx.lineTo(7.1, 13)
  ctx.lineTo(12.6, 12.8)
  ctx.closePath()
}

function paint(ctx: CanvasRenderingContext2D, fill: string, edge: string, edgeWidth: number): void {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fillStyle = fill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = edgeWidth
  ctx.strokeStyle = edge
  ctx.stroke()
}

/** Where a name tag sits relative to a pointer's tip, so it never covers the pointer. */
export function tagOffset(cursor: ResolvedCursor): { x: number; y: number } {
  const dot = cursor.style === 'dot' || cursor.style === 'crosshair'
  return { x: (dot ? 10 : 14) * cursor.size, y: (dot ? 10 : 20) * cursor.size }
}

/** Draws one pointer with its tip at `x, y`, leaning a little into its motion. */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  cursor: ResolvedCursor,
  x: number,
  y: number,
  color: string,
  lean = 0,
  scale = 1,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  ctx.scale(cursor.size * scale, cursor.size * scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  switch (cursor.style) {
    case 'classic':
      classicPath(ctx)
      paint(ctx, color, '#111111', 1.4)
      break
    case 'dot':
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, Math.PI * 2)
      paint(ctx, color, '#ffffff', 2.4)
      break
    case 'crosshair':
      ctx.beginPath()
      ctx.moveTo(-9, 0)
      ctx.lineTo(9, 0)
      ctx.moveTo(0, -9)
      ctx.lineTo(0, 9)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.8
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, 3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      break
    case 'custom':
      if (cursor.path) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetY = 2
        ctx.fillStyle = color
        ctx.fill(cursor.path)
        ctx.shadowColor = 'transparent'
        ctx.lineWidth = 1.8
        ctx.strokeStyle = '#ffffff'
        ctx.stroke(cursor.path)
      }
      break
    default:
      arrowPath(ctx)
      paint(ctx, color, '#ffffff', 1.8)
  }
  ctx.restore()
}
