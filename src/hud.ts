import type { RebuildProgress } from './player.js'

/** The words the control bar shows. `{agents}`, `{done}` and `{total}` are filled in. */
export interface Labels {
  scanning: string
  agents: string
  layers: string
  tour: string
  touring: string
  tourHint: string
  speedHint: string
  skipHint: string
}

export const DEFAULT_LABELS: Labels = {
  scanning: 'Scanning page...',
  agents: '{agents} agents',
  layers: '{done} / {total} layers',
  tour: 'Tour',
  touring: 'Touring',
  tourHint: 'Scroll along with the build',
  speedHint: 'Build speed',
  skipHint: 'Skip (Esc)',
}

export interface HudState {
  progress: RebuildProgress
  speed: number
  tour: boolean
}

export interface HudHandlers {
  onTour: () => void
  onSpeed: () => void
  onSkip: () => void
}

export interface Hud {
  update: (state: HudState) => void
  destroy: () => void
}

const STYLE = `
:host { all: initial; }
.bar {
  position: fixed; inset-inline: 0; bottom: 96px; margin-inline: auto; width: fit-content;
  max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 4px;
  padding: 6px 6px 6px 16px; border-radius: 16px; background: #17171c; color: #fff;
  font: 500 14px/1.2 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 18px 40px rgb(0 0 0 / .35);
}
.text { white-space: nowrap; margin-inline-end: 8px; font-variant-numeric: tabular-nums; }
.track { width: 80px; height: 4px; border-radius: 2px; background: rgb(255 255 255 / .25); overflow: hidden; margin-inline-end: 8px; }
.fill { display: block; height: 100%; width: 100%; background: #fff; transform-origin: left; transition: transform .2s ease-out; }
:host([dir="rtl"]) .fill { transform-origin: right; }
button {
  all: unset; box-sizing: border-box; cursor: pointer; min-height: 36px; padding: 0 12px;
  display: inline-flex; align-items: center; border-radius: 999px; font-size: 12px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
button:hover { background: rgb(255 255 255 / .15); }
button:focus-visible { outline: 2px solid #1f94e3; outline-offset: 1px; }
button[aria-pressed="true"] { background: #1f94e3; }
button.close { font-size: 14px; padding: 0 10px; }
@media (max-width: 640px) { .track, .agents { display: none; } }
@media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
`

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match))
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** A small control bar in its own shadow root, so the page's CSS can neither reach nor break it. */
export function createHud(labels: Labels, handlers: HudHandlers, zIndex: number): Hud {
  const host = element('div')
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${zIndex}`
  host.setAttribute('dir', getComputedStyle(document.documentElement).direction)
  const shadow = host.attachShadow({ mode: 'open' })

  const style = element('style')
  style.textContent = STYLE
  const bar = element('div', 'bar')
  bar.setAttribute('role', 'status')
  bar.style.pointerEvents = 'auto'

  const agents = element('span', 'text agents')
  const text = element('span', 'text')
  const track = element('span', 'track')
  const meter = element('span', 'fill')
  track.append(meter)
  track.setAttribute('aria-hidden', 'true')

  const tour = element('button')
  tour.type = 'button'
  tour.title = labels.tourHint
  tour.addEventListener('click', handlers.onTour)

  const speed = element('button')
  speed.type = 'button'
  speed.title = labels.speedHint
  speed.setAttribute('aria-label', labels.speedHint)
  speed.addEventListener('click', handlers.onSpeed)

  const close = element('button', 'close', '✕')
  close.type = 'button'
  close.title = labels.skipHint
  close.setAttribute('aria-label', labels.skipHint)
  close.addEventListener('click', handlers.onSkip)

  bar.append(agents, text, track, tour, speed, close)
  shadow.append(style, bar)
  document.body.append(host)

  return {
    update: ({ progress, speed: rate, tour: touring }) => {
      const scanning = progress.phase === 'scanning'
      agents.hidden = scanning
      text.textContent = scanning
        ? labels.scanning
        : fill(labels.layers, { done: progress.done, total: progress.total })
      agents.textContent = fill(labels.agents, { agents: progress.agents })
      meter.style.transform = `scaleX(${progress.total > 0 ? progress.done / progress.total : 0})`
      tour.textContent = touring ? labels.touring : labels.tour
      tour.setAttribute('aria-pressed', String(touring))
      speed.textContent = `${rate}×`
    },
    destroy: () => host.remove(),
  }
}
