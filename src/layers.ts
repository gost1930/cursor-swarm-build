import type { Box } from './geometry.js'

export type LayerKind = 'text' | 'media' | 'box'
export type StyledElement = HTMLElement | SVGElement

/** One thing the intro builds: a block of text, a picture, or a box with a look of its own. */
export interface Layer {
  element: StyledElement
  kind: LayerKind
  /** Document coordinates. For text, the area the text itself covers. */
  box: Box
  /** The element's own area, which the reveal clips. */
  frame: Box
  chars: number
  rtl: boolean
}

/** Past this many, the smallest layers are left alone and simply stay visible. */
const MAX_LAYERS = 260
const MEDIA = new Set(['img', 'video', 'svg', 'canvas', 'picture', 'iframe'])
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const

const isStyled = (node: Element): node is StyledElement =>
  node instanceof HTMLElement || node instanceof SVGElement

const toBox = (rect: DOMRect): Box => ({
  x: rect.left + window.scrollX,
  y: rect.top + window.scrollY,
  w: rect.width,
  h: rect.height,
})

function isTransparent(color: string): boolean {
  if (color === 'transparent') return true
  const alpha = /[,/]\s*([\d.]+)\s*\)$/.exec(color)
  return alpha ? Number.parseFloat(alpha[1] ?? '1') === 0 : false
}

function hasLook(style: CSSStyleDeclaration): boolean {
  if (style.backgroundImage !== 'none' || style.boxShadow !== 'none') return true
  if (!isTransparent(style.backgroundColor)) return true
  return SIDES.some(
    (side) =>
      Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
      style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none',
  )
}

/** The part of an element its own text covers, leaving out its child elements. */
function textArea(element: Element): { box: Box; chars: number } | null {
  const range = document.createRange()
  let area: Box | null = null
  let chars = 0

  for (const node of element.childNodes) {
    const text = node.textContent?.trim() ?? ''
    if (node.nodeType !== Node.TEXT_NODE || !text) continue
    range.selectNodeContents(node)
    const box = toBox(range.getBoundingClientRect())
    chars += text.length
    area = area
      ? {
          x: Math.min(area.x, box.x),
          y: Math.min(area.y, box.y),
          w: Math.max(area.x + area.w, box.x + box.w) - Math.min(area.x, box.x),
          h: Math.max(area.y + area.h, box.y + box.h) - Math.min(area.y, box.y),
        }
      : box
  }
  return area ? { box: area, chars } : null
}

function classify(element: StyledElement): Layer | null {
  const style = getComputedStyle(element)
  const frame = toBox(element.getBoundingClientRect())
  if (frame.w < 2 || frame.h < 2) return null
  const rtl = style.direction === 'rtl'

  if (MEDIA.has(element.localName))
    return { element, kind: 'media', box: frame, frame, chars: 0, rtl }
  const text = textArea(element)
  if (hasLook(style))
    return { element, kind: 'box', box: frame, frame, chars: text?.chars ?? 0, rtl }
  return text ? { element, kind: 'text', box: text.box, frame, chars: text.chars, rtl } : null
}

function walk(parent: Element, found: Array<Layer>): void {
  for (const child of parent.children) {
    if (!isStyled(child)) continue
    const style = getComputedStyle(child)
    if (style.display === 'none' || style.visibility === 'hidden') continue

    const layer = classify(child)
    if (layer) found.push(layer)
    if (layer?.kind !== 'media') walk(child, found)
  }
}

/** Every layer under `root`, in reading order. */
export function collectLayers(root: Element): Array<Layer> {
  const found: Array<Layer> = []
  walk(root, found)
  if (found.length <= MAX_LAYERS) return found

  const area = (layer: Layer): number => layer.frame.w * layer.frame.h
  const keep = new Set([...found].sort((a, b) => area(b) - area(a)).slice(0, MAX_LAYERS))
  return found.filter((layer) => keep.has(layer))
}
