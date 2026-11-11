import { buildIntro } from '../dist/index.js'

const root = document.documentElement
const stage = document.querySelector('#stage')
const count = document.querySelector('#count')
const state = { speed: 1, tour: true, hud: true, cursor: 'arrow' }
let current = null

const press = (button, on) => button.setAttribute('aria-pressed', String(on))

function play() {
  current = buildIntro(stage, {
    speed: state.speed,
    tour: state.tour,
    hud: state.hud,
    cursor: { style: state.cursor },
    onProgress: ({ total, agents }) => {
      count.textContent = `${total} layers, ${agents} cursors`
    },
  })
}

document.querySelector('#replay').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  play()
})

for (const chip of document.querySelectorAll('[data-speed]')) {
  chip.addEventListener('click', () => {
    state.speed = Number(chip.dataset.speed)
    for (const other of document.querySelectorAll('[data-speed]')) {
      other.setAttribute('aria-checked', String(other === chip))
    }
  })
}

for (const chip of document.querySelectorAll('[data-cursor]')) {
  chip.addEventListener('click', () => {
    state.cursor = chip.dataset.cursor
    for (const other of document.querySelectorAll('[data-cursor]')) {
      other.setAttribute('aria-checked', String(other === chip))
    }
  })
}

const toggles = {
  tour: (on) => { state.tour = on },
  hud: (on) => { state.hud = on },
  rtl: (on) => stage.setAttribute('dir', on ? 'rtl' : 'ltr'),
  dark: (on) => root.setAttribute('data-theme', on ? 'dark' : 'light'),
}
for (const [id, apply] of Object.entries(toggles)) {
  const button = document.querySelector(`#${id}`)
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true'
    press(button, on)
    apply(on)
  })
}

const dialog = document.querySelector('#dialog')
document.querySelector('#code').addEventListener('click', () => dialog.showModal())
document.querySelector('#close').addEventListener('click', () => dialog.close())
document.querySelector('#copy').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText(document.querySelector('#snippet').textContent)
  event.currentTarget.textContent = 'Copied'
  setTimeout(() => { event.currentTarget.textContent = 'Copy' }, 1500)
})

window.addEventListener('pagehide', () => current?.skip())
play()
