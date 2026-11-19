const UINT32_RANGE = 0x1_0000_0000

/** Maps any number to a uint32 PRNG state (non-finite values become 0). */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  const integer = Math.trunc(seed)
  return ((integer % UINT32_RANGE) + UINT32_RANGE) % UINT32_RANGE
}

/** One mulberry32 step: the next state and a uniform float in [0, 1). */
function stepRandom(state: number): {
  readonly state: number
  readonly value: number
} {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { state: next, value: ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE }
}

/**
 * Seeded random source for one reducer call. The caller copies `state` back
 * into `RoomState.rngState`, so every random choice is reproducible.
 */
export class Rng {
  #state: number

  constructor(state: number) {
    this.#state = normalizeSeed(state)
  }

  get state(): number {
    return this.#state
  }

  next(): number {
    const step = stepRandom(this.#state)
    this.#state = step.state
    return step.value
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    if (max <= min) return min
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with no items')
    return items[Math.floor(this.next() * items.length)] as T
  }

  /** Fisher–Yates; returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.next() * (index + 1))
      const current = result[index] as T
      result[index] = result[swap] as T
      result[swap] = current
    }
    return result
  }
}
