import { describe, expect, it } from 'vitest'

import type { WordDifficulty } from '../types'
import {
  MAX_DRAFT_SLOTS,
  difficultySlots,
  type DraftDifficultyMix,
} from './slots'

/** mulberry32: tiny seeded PRNG so loops are reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ORDER: Readonly<Record<WordDifficulty, number>> = {
  easy: 0,
  medium: 1,
  hard: 2,
}

function counts(slots: readonly WordDifficulty[]) {
  return {
    easy: slots.filter((slot) => slot === 'easy').length,
    medium: slots.filter((slot) => slot === 'medium').length,
    hard: slots.filter((slot) => slot === 'hard').length,
  }
}

function expectSorted(slots: readonly WordDifficulty[]) {
  for (let index = 1; index < slots.length; index += 1) {
    expect(ORDER[slots[index - 1] as WordDifficulty]).toBeLessThanOrEqual(
      ORDER[slots[index] as WordDifficulty],
    )
  }
}

const SEEDS = Array.from({ length: 400 }, (_, index) => index + 1)

describe('difficultySlots', () => {
  it('balanced with three cards is always exactly one of each', () => {
    for (const seed of SEEDS) {
      expect(difficultySlots('balanced', 3, seededRandom(seed))).toEqual([
        'easy',
        'medium',
        'hard',
      ])
    }
  })

  it('balanced with two cards always offers two different difficulties', () => {
    const pairs = new Set<string>()
    for (const seed of SEEDS) {
      const slots = difficultySlots('balanced', 2, seededRandom(seed))
      expect(slots).toHaveLength(2)
      expect(slots[0]).not.toBe(slots[1])
      expectSorted(slots)
      pairs.add(slots.join('+'))
    }
    expect([...pairs].sort()).toEqual([
      'easy+hard',
      'easy+medium',
      'medium+hard',
    ])
  })

  it.each([4, 5, 6, 7])(
    'balanced with %i cards covers every difficulty as evenly as possible',
    (count) => {
      for (const seed of SEEDS) {
        const slots = difficultySlots('balanced', count, seededRandom(seed))
        expect(slots).toHaveLength(count)
        const tally = Object.values(counts(slots))
        expect(Math.min(...tally)).toBeGreaterThanOrEqual(1)
        expect(Math.max(...tally) - Math.min(...tally)).toBeLessThanOrEqual(1)
        expectSorted(slots)
      }
    },
  )

  it('easy mix always includes an easy card and never a hard one', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      for (const seed of SEEDS) {
        const slots = difficultySlots('easy', count, seededRandom(seed))
        expect(slots).toHaveLength(count)
        expect(slots).toContain('easy')
        expect(slots).not.toContain('hard')
        expectSorted(slots)
      }
    }
  })

  it('hard mix always includes a hard card and never an easy one', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      for (const seed of SEEDS) {
        const slots = difficultySlots('hard', count, seededRandom(seed))
        expect(slots).toContain('hard')
        expect(slots).not.toContain('easy')
        expectSorted(slots)
      }
    }
  })

  it('mixed is random but never all the same with two or more cards', () => {
    const seen = new Set<WordDifficulty>()
    for (const count of [2, 3, 4, 5]) {
      for (const seed of SEEDS) {
        const slots = difficultySlots('mixed', count, seededRandom(seed))
        expect(slots).toHaveLength(count)
        expect(new Set(slots).size).toBeGreaterThan(1)
        expectSorted(slots)
        for (const slot of slots) seen.add(slot)
      }
    }
    expect(seen.size).toBe(3)
  })

  it('is deterministic for the same random sequence', () => {
    const mixes: readonly DraftDifficultyMix[] = [
      'balanced',
      'easy',
      'mixed',
      'hard',
    ]
    for (const mix of mixes) {
      for (const seed of SEEDS.slice(0, 50)) {
        expect(difficultySlots(mix, 5, seededRandom(seed))).toEqual(
          difficultySlots(mix, 5, seededRandom(seed)),
        )
      }
    }
  })

  it.each([
    [0, 1],
    [-3, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [2.7, 2],
    [99, MAX_DRAFT_SLOTS],
  ])('clamps count %d to %i cards', (count, expected) => {
    expect(difficultySlots('balanced', count, seededRandom(7))).toHaveLength(
      expected,
    )
  })

  it('tolerates a random source at or outside its bounds', () => {
    for (const value of [0, 0.999999999, 1, -1, Number.NaN]) {
      const slots = difficultySlots('mixed', 4, () => value)
      expect(slots).toHaveLength(4)
      expect(new Set(slots).size).toBeGreaterThan(1)
    }
  })
})
