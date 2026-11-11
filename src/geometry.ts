/** A rectangle in document coordinates (scroll offset included). */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A point a cursor passes through, at a time in seconds from the start of the intro. */
export interface Keyframe {
  t: number
  x: number
  y: number
  /** How far the move that starts here bows sideways, as a share of its length. 0 is a straight line. */
  bend?: number
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount

export const easeOut = (t: number): number => 1 - (1 - t) ** 3

/** Minimum-jerk easing: the speed profile of a hand reaching for something. Gentle in, gentle out. */
export const minJerk = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/** Where a cursor is at `time`: a curved, hand-like move between the two keyframes around it. */
export function sampleTrack(
  frames: ReadonlyArray<Keyframe>,
  time: number,
): { x: number; y: number } {
  const first = frames[0]
  const last = frames[frames.length - 1]
  if (!first || !last) return { x: 0, y: 0 }
  if (time <= first.t) return { x: first.x, y: first.y }
  if (time >= last.t) return { x: last.x, y: last.y }

  const nextIndex = frames.findIndex((frame) => frame.t > time)
  const from = frames[nextIndex - 1] ?? first
  const to = frames[nextIndex] ?? last
  const u = minJerk(clamp((time - from.t) / Math.max(to.t - from.t, 0.001), 0, 1))

  const bend = from.bend ?? 0
  const controlX = (from.x + to.x) / 2 - (to.y - from.y) * bend
  const controlY = (from.y + to.y) / 2 + (to.x - from.x) * bend
  const rest = 1 - u
  return {
    x: rest * rest * from.x + 2 * rest * u * controlX + u * u * to.x,
    y: rest * rest * from.y + 2 * rest * u * controlY + u * u * to.y,
  }
}

/** A faint, smooth tremor, so a cursor held still still looks like a hand is on it. */
export const tremor = (time: number, seed: number): { x: number; y: number } => ({
  x: (Math.sin(time * 5.3 + seed * 7.1) + 0.6 * Math.sin(time * 9.1 + seed * 3.3)) * 0.45,
  y: (Math.sin(time * 4.7 + seed * 5.7) + 0.6 * Math.sin(time * 8.3 + seed * 1.9)) * 0.45,
})

export interface Damped {
  value: number
  velocity: number
}

/**
 * Moves `current` toward `target` like a critically damped spring: no overshoot, no sudden stops,
 * and the speed never passes `maxSpeed`. `smoothTime` is roughly how long the move takes.
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  seconds: number,
  maxSpeed: number,
): Damped {
  const omega = 2 / Math.max(smoothTime, 0.0001)
  const x = omega * seconds
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const maxChange = maxSpeed * smoothTime
  const change = clamp(current - target, -maxChange, maxChange)
  const reached = current - change
  const carried = (velocity + omega * change) * seconds
  const next = reached + (change + carried) * decay
  const nextVelocity = (velocity - omega * carried) * decay

  if (target - current > 0 === next > target) {
    return { value: target, velocity: seconds > 0 ? (next - target) / seconds : 0 }
  }
  return { value: next, velocity: nextVelocity }
}

/** A small deterministic generator, so a given page always plays the same choreography. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
