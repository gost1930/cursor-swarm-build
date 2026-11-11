import assert from 'node:assert/strict'
import test from 'node:test'

import { countChanges, createReplayGate } from '../dist/replay-gate.js'
import { minJerk, sampleTrack, seededRandom, smoothDamp } from '../dist/geometry.js'
import { buildPlan } from '../dist/plan.js'

const snapshot = (entries) => new Map(Object.entries(entries))

test('countChanges counts added, removed and changed items', () => {
  const before = snapshot({ a: '1', b: '1', c: '1' })
  assert.equal(countChanges(before, snapshot({ a: '1', b: '1', c: '1' })), 0)
  assert.equal(countChanges(before, snapshot({ a: '2', b: '1', c: '1' })), 1)
  assert.equal(countChanges(before, snapshot({ a: '1', b: '1' })), 1)
  assert.equal(countChanges(before, snapshot({ a: '1', b: '1', c: '1', d: '1' })), 1)
})

test('the gate plays first, then only after enough changes', () => {
  const gate = createReplayGate(3)
  const base = snapshot({ a: '1', b: '1', c: '1', d: '1' })
  assert.equal(gate.shouldPlay('home', base), true)
  gate.markPlayed('home', base)
  assert.equal(gate.shouldPlay('home', base), false)
  assert.equal(gate.shouldPlay('home', snapshot({ a: '2', b: '2', c: '1', d: '1' })), false)
  assert.equal(gate.shouldPlay('home', snapshot({ a: '2', b: '2', c: '2', d: '1' })), true)
  assert.equal(gate.shouldPlay('visas', base), true)
})

test('sampleTrack eases between keyframes and clamps outside them', () => {
  const frames = [
    { t: 0, x: 0, y: 0 },
    { t: 1, x: 100, y: 50 },
  ]
  assert.deepEqual(sampleTrack(frames, -1), { x: 0, y: 0 })
  assert.deepEqual(sampleTrack(frames, 2), { x: 100, y: 50 })
  assert.deepEqual(sampleTrack(frames, 0.5), { x: 50, y: 25 })
  assert.equal(minJerk(0), 0)
  assert.equal(minJerk(1), 1)
})

test('a bent move leaves the straight line but still ends where it should', () => {
  const frames = [
    { t: 0, x: 0, y: 0, bend: 0.3 },
    { t: 1, x: 100, y: 0 },
  ]
  const middle = sampleTrack(frames, 0.5)
  assert.ok(Math.abs(middle.y) > 5, 'the path bows sideways')
  assert.deepEqual(sampleTrack(frames, 1), { x: 100, y: 0 })
})

test('smoothDamp glides to its target without overshooting or passing the speed cap', () => {
  let value = 0
  let velocity = 0
  let peak = 0
  for (let step = 0; step < 600; step += 1) {
    const next = smoothDamp(value, 1000, velocity, 0.6, 1 / 60, 800)
    peak = Math.max(peak, Math.abs(next.value - value) * 60)
    assert.ok(next.value <= 1000 + 1e-6, 'never overshoots')
    value = next.value
    velocity = next.velocity
  }
  assert.ok(Math.abs(value - 1000) < 1)
  assert.ok(peak <= 800 * 1.5, `speed ${peak}`)
})

test('seededRandom is repeatable', () => {
  const a = seededRandom(42)
  const b = seededRandom(42)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
})

test('buildPlan keeps starts in order and fits the time budget', () => {
  const layers = Array.from({ length: 200 }, (_, index) => ({
    element: {},
    kind: index % 3 === 0 ? 'text' : index % 3 === 1 ? 'box' : 'media',
    box: { x: 10, y: index * 20, w: 300, h: 18 },
    frame: { x: 10, y: index * 20, w: 300, h: 18 },
    chars: 24,
    rtl: false,
  }))
  const plan = buildPlan(layers, { w: 1200, h: 800 })
  assert.equal(plan.layers.length, 200)
  for (let i = 1; i < plan.layers.length; i += 1) {
    assert.ok(plan.layers[i].start >= plan.layers[i - 1].start)
  }
  assert.ok(plan.cursors.length >= 6 && plan.cursors.length <= 14)
  assert.ok(plan.duration < 25, `duration ${plan.duration}`)
})

test('resolveCursor fills in defaults and never leaves a custom cursor without a shape', async () => {
  const { resolveCursor, DEFAULT_NAMES } = await import('../dist/cursor.js')
  const plain = resolveCursor()
  assert.equal(plain.style, 'arrow')
  assert.equal(plain.tags, true)
  assert.equal(plain.size, 1)
  assert.equal(plain.names, DEFAULT_NAMES)

  assert.equal(resolveCursor({ style: 'custom' }).style, 'arrow')
  assert.equal(resolveCursor({ style: 'classic', size: 1.5, tags: false }).size, 1.5)
  assert.equal(resolveCursor({ style: 'dot', size: -2 }).size, 1)
  assert.deepEqual([...resolveCursor({ names: ['A', 'B'] }).names], ['A', 'B'])
  assert.equal(resolveCursor({ names: [] }).names, DEFAULT_NAMES)
})

test('buildPlan uses the names and colors it is given', () => {
  const layers = Array.from({ length: 12 }, (_, index) => ({
    element: {},
    kind: 'box',
    box: { x: 0, y: index * 30, w: 200, h: 20 },
    frame: { x: 0, y: index * 30, w: 200, h: 20 },
    chars: 0,
    rtl: false,
  }))
  return import('../dist/plan.js').then(({ buildPlan }) => {
    const plan = buildPlan(layers, { w: 1000, h: 700 }, { names: ['Ann', 'Bo'], colors: ['#111', '#222', '#333'] })
    assert.equal(plan.cursors[0].name, 'Ann')
    assert.equal(plan.cursors[1].name, 'Bo')
    assert.equal(plan.cursors[2].name, 'Ann')
    assert.equal(plan.cursors[0].color, '#111')
    assert.equal(plan.cursors[3].color, '#111')
  })
})
