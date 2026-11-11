/** Item id to a fingerprint of how it looks. Change the fingerprint and the item counts as changed. */
export type Fingerprints = ReadonlyMap<string, string>

export interface ReplayGate {
  /** Whether the intro should play for `key` given how its items look now. Does not record anything. */
  shouldPlay: (key: string, current: Fingerprints) => boolean
  /** Remember `current` as what `key` looked like the last time the intro played. */
  markPlayed: (key: string, current: Fingerprints) => void
}

/** Items added, removed or changed between two snapshots. */
export function countChanges(before: Fingerprints, after: Fingerprints): number {
  let changed = 0
  for (const [id, fingerprint] of after) if (before.get(id) !== fingerprint) changed += 1
  for (const id of before.keys()) if (!after.has(id)) changed += 1
  return changed
}

/**
 * Decides when the intro is worth replaying: the first time for a key (a page, a site...), and
 * again only once at least `threshold` items changed since it last played. Small edits show the
 * page straight away. State lives in memory, so a reload starts over.
 */
export function createReplayGate(threshold = 3): ReplayGate {
  const played = new Map<string, Fingerprints>()
  return {
    shouldPlay: (key, current) => {
      const before = played.get(key)
      return !before || countChanges(before, current) >= threshold
    },
    markPlayed: (key, current) => {
      played.set(key, current)
    },
  }
}
