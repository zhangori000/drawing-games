import { describe, expect, it } from 'vitest'

import { WORD_PACKS } from '../packs'
import type { WordDifficulty } from '../types'
import { buildWordPool } from './pool'
import {
  MIN_PENALTY_MULTIPLIER,
  countFreshWords,
  selectDraftOptions,
} from './selection'
import { difficultySlots } from './slots'
import { wordStems } from './stems'
import { normalizeAnswer } from './text'
import type { DraftSelectionInput, PlayableWord } from './types'

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

function word(
  packId: string,
  term: string,
  difficulty: WordDifficulty,
): PlayableWord {
  return {
    id: `${packId}/${term.replace(/\s+/g, '-')}`,
    term,
    difficulty,
    packId,
    definition: `A test word called ${term}.`,
    aliases: [],
  }
}

/**
 * Vowel-free nonsense terms share no stems or compound parts, so tests that
 * are not about word families are not disturbed by them.
 */
const LETTERS = 'bcdgkpqvxz'
function nonsense(index: number): string {
  const digits = index.toString(10).padStart(3, '0')
  return `q${[...digits].map((digit) => LETTERS[Number(digit)]).join('')}`
}

function syntheticPool(
  packCount: number,
  perDifficulty: number,
): PlayableWord[] {
  const pool: PlayableWord[] = []
  let index = 0
  for (let pack = 0; pack < packCount; pack += 1) {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let n = 0; n < perDifficulty; n += 1) {
        pool.push(word(`pack${pack}`, nonsense(index), difficulty))
        index += 1
      }
    }
  }
  return pool
}

function select(
  overrides: Partial<DraftSelectionInput> & Pick<DraftSelectionInput, 'pool'>,
  seed = 1,
): PlayableWord[] {
  return selectDraftOptions({
    slots: ['easy', 'medium', 'hard'],
    hardExclude: new Set(),
    penalties: new Map(),
    avoidStems: new Set(),
    random: seededRandom(seed),
    ...overrides,
  })
}

const SEEDS = Array.from({ length: 300 }, (_, index) => index + 1)
const POOL = syntheticPool(10, 6)

describe('selectDraftOptions', () => {
  it('fills each slot with its own difficulty when the pool allows', () => {
    for (const seed of SEEDS) {
      const cards = select({ pool: POOL }, seed)
      expect(cards.map((card) => card.difficulty)).toEqual([
        'easy',
        'medium',
        'hard',
      ])
    }
  })

  it('never returns hard-excluded words, whatever the exclusion set', () => {
    for (const seed of SEEDS) {
      const random = seededRandom(seed * 7919)
      const excluded = new Set(
        POOL.filter(() => random() < 0.9).map((card) => card.id),
      )
      const cards = select({ pool: POOL, hardExclude: excluded }, seed)
      for (const card of cards) expect(excluded.has(card.id)).toBe(false)
      const fresh = POOL.length - excluded.size
      expect(cards.length).toBe(Math.min(3, fresh))
    }
  })

  it('treats another id with an excluded answer key as excluded', () => {
    const pool = [
      word('food', 'ice cream', 'easy'),
      word('treats', 'Ice-Cream', 'easy'),
      word('custom', 'cat', 'easy'),
      word('animals', 'cat', 'easy'),
      word('animals', 'dog', 'easy'),
    ]
    for (const seed of SEEDS) {
      const cards = select(
        {
          pool,
          slots: ['easy', 'easy', 'easy'],
          hardExclude: new Set(['custom/ice-cream', 'custom/cat']),
        },
        seed,
      )
      expect(cards.map((card) => card.term)).toEqual(['dog'])
    }
  })

  it('never offers two cards with the same id or answer key', () => {
    const pool = [
      word('a', 'cat', 'easy'),
      word('a', 'cat', 'easy'),
      word('b', 'Cat', 'medium'),
      word('c', 'the cat', 'hard'),
      word('d', 'dog', 'easy'),
    ]
    for (const seed of SEEDS) {
      const cards = select({ pool }, seed)
      expect(cards).toHaveLength(2)
      const keys = cards.map((card) => normalizeAnswer(card.term))
      expect(new Set(keys).size).toBe(2)
    }
  })

  it('returns fewer cards only when the pool truly runs out', () => {
    const tiny = [word('a', 'qbb', 'hard'), word('b', 'qcc', 'hard')]
    expect(select({ pool: tiny })).toHaveLength(2)
    expect(
      select({ pool: tiny, hardExclude: new Set(tiny.map((c) => c.id)) }),
    ).toEqual([])
    expect(select({ pool: [] })).toEqual([])
    const sameDifficulty = syntheticPool(1, 3).filter(
      (card) => card.difficulty === 'medium',
    )
    expect(select({ pool: sameDifficulty })).toHaveLength(3)
  })

  it('falls back to the nearest difficulty', () => {
    const pool = [
      word('a', 'qbb', 'easy'),
      ...syntheticPool(3, 2).filter((card) => card.difficulty === 'medium'),
    ]
    for (const seed of SEEDS) {
      expect(select({ pool }, seed).map((card) => card.difficulty)).toEqual([
        'easy',
        'medium',
        'medium',
      ])
    }
    const noEasy = POOL.filter((card) => card.difficulty !== 'easy')
    for (const seed of SEEDS.slice(0, 50)) {
      const [first] = select({ pool: noEasy, slots: ['easy'] }, seed)
      expect(first?.difficulty).toBe('medium')
    }
  })

  it('lowers the odds of penalized words without excluding them', () => {
    const favored = word('a', 'qbb', 'easy')
    const penalized = word('b', 'qcc', 'easy')
    const runs = 4000
    let hits = 0
    let zeroHits = 0
    for (let seed = 1; seed <= runs; seed += 1) {
      const [card] = select(
        {
          pool: [penalized, favored],
          slots: ['easy'],
          penalties: new Map([[penalized.id, 0.05]]),
        },
        seed,
      )
      if (card?.id === penalized.id) hits += 1
      const [zero] = select(
        {
          pool: [penalized, favored],
          slots: ['easy'],
          penalties: new Map([[penalized.id, 0]]),
        },
        seed,
      )
      if (zero?.id === penalized.id) zeroHits += 1
    }
    // Expected share 0.05 / 1.05 ≈ 4.8%.
    expect(hits / runs).toBeGreaterThan(0.025)
    expect(hits / runs).toBeLessThan(0.075)
    // A 0 penalty is clamped to MIN_PENALTY_MULTIPLIER, never an exclusion.
    const expectedZero = MIN_PENALTY_MULTIPLIER / (1 + MIN_PENALTY_MULTIPLIER)
    expect(zeroHits).toBeGreaterThan(0)
    expect(zeroHits / runs).toBeLessThan(expectedZero * 3)
  })

  it('lowers the odds of penalized packs', () => {
    const pool = syntheticPool(2, 5)
    const runs = 3000
    let fromPenalized = 0
    for (let seed = 1; seed <= runs; seed += 1) {
      const [card] = select(
        {
          pool,
          slots: ['medium'],
          packPenalties: new Map([['pack0', 0.1]]),
        },
        seed,
      )
      if (card?.packId === 'pack0') fromPenalized += 1
    }
    // Expected share 0.1 / 1.1 ≈ 9%.
    expect(fromPenalized / runs).toBeGreaterThan(0.06)
    expect(fromPenalized / runs).toBeLessThan(0.12)
  })

  it('spreads one draft across different packs', () => {
    let distinct = 0
    for (const seed of SEEDS) {
      const cards = select({ pool: POOL }, seed)
      if (new Set(cards.map((card) => card.packId)).size === 3) distinct += 1
    }
    // Uniform picks would give 72% with ten packs; diversity pushes past 85%.
    expect(distinct / SEEDS.length).toBeGreaterThan(0.85)
  })

  it('still fills a draft from a single pack', () => {
    const onePack = syntheticPool(1, 2)
    for (const seed of SEEDS.slice(0, 50)) {
      expect(select({ pool: onePack }, seed)).toHaveLength(3)
    }
  })

  it('avoids shared stems strictly while alternatives exist', () => {
    const pool = [
      word('w', 'snowman', 'medium'),
      word('w', 'snowball', 'medium'),
      word('v', 'fire truck', 'medium'),
      word('v', 'campfire', 'medium'),
      ...syntheticPool(4, 2).filter((card) => card.difficulty === 'medium'),
    ]
    for (const seed of SEEDS) {
      const cards = select(
        {
          pool,
          slots: ['medium', 'medium', 'medium', 'medium', 'medium'],
          avoidStems: new Set(['fire']),
        },
        seed,
      )
      const terms = cards.map((card) => card.term)
      expect(terms).not.toContain('fire truck')
      expect(terms).not.toContain('campfire')
      expect(terms.includes('snowman') && terms.includes('snowball')).toBe(
        false,
      )
    }
  })

  it('falls back to shared stems softly on tiny pools', () => {
    const pool = [word('w', 'snowman', 'medium'), word('w', 'snowball', 'hard')]
    expect(
      select({ pool, slots: ['medium', 'hard'] }).map((card) => card.term),
    ).toEqual(['snowman', 'snowball'])
    expect(
      select({
        pool: [word('w', 'snowman', 'medium')],
        slots: ['medium'],
        avoidStems: new Set(wordStems('snow')),
      }).map((card) => card.term),
    ).toEqual(['snowman'])
  })

  it('is deterministic and draws once per card', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      let calls = 0
      const random = seededRandom(seed)
      const counted = () => {
        calls += 1
        return random()
      }
      const first = select({ pool: POOL, random: counted }, seed)
      const second = select({ pool: POOL }, seed)
      expect(first.map((card) => card.id)).toEqual(
        second.map((card) => card.id),
      )
      expect(calls).toBe(first.length)
    }
  })

  it('tolerates a random source at or outside its bounds', () => {
    for (const value of [0, 0.9999999999, 1, -0.5, Number.NaN]) {
      const cards = select({ pool: POOL, random: () => value })
      expect(cards).toHaveLength(3)
      expect(new Set(cards.map((card) => card.id)).size).toBe(3)
    }
  })
})

describe('countFreshWords', () => {
  it('counts distinct offerable words under the selector rules', () => {
    const pool = [
      word('a', 'cat', 'easy'),
      word('b', 'Cat', 'easy'),
      word('a', 'dog', 'easy'),
      word('a', 'dog', 'easy'),
      word('a', 'fish', 'easy'),
    ]
    expect(countFreshWords(pool, new Set())).toBe(3)
    expect(countFreshWords(pool, new Set(['b/Cat']))).toBe(2)
    expect(countFreshWords(pool, new Set(['custom/fish']))).toBe(2)
    expect(countFreshWords([], new Set(['x']))).toBe(0)
  })
})

/**
 * Plays drafts the way the room does (team A, then team B excluding A's cards
 * and avoiding their stems), choosing one card per team, until the room would
 * have to relax its used-word memory. No word may be drawn twice before then.
 */
function simulateRoom(pool: readonly PlayableWord[], seed: number) {
  const random = seededRandom(seed)
  const byId = new Map(pool.map((card) => [card.id, card]))
  const cardsPerDraft = 3
  const used: string[] = []
  const usedSet = new Set<string>()
  let drafts = 0
  while (countFreshWords(pool, usedSet) >= 4 * cardsPerDraft) {
    const roundExclude = new Set(usedSet)
    const roundStems = new Set(
      used.slice(-2).flatMap((id) => {
        const drawn = byId.get(id)
        return drawn ? wordStems(drawn.term) : []
      }),
    )
    for (let team = 0; team < 2; team += 1) {
      const cards = selectDraftOptions({
        pool,
        slots: difficultySlots('balanced', cardsPerDraft, random),
        hardExclude: roundExclude,
        penalties: new Map(),
        avoidStems: roundStems,
        random,
      })
      drafts += 1
      expect(cards.length).toBeGreaterThan(0)
      for (const card of cards) {
        expect(usedSet.has(card.id)).toBe(false)
        roundExclude.add(card.id)
        for (const stem of wordStems(card.term)) roundStems.add(stem)
      }
      const chosen = cards[Math.floor(random() * cards.length)]
      if (chosen === undefined) break
      expect(usedSet.has(chosen.id)).toBe(false)
      used.push(chosen.id)
      usedSet.add(chosen.id)
    }
  }
  return { used, drafts }
}

describe('room-level freshness', () => {
  it('never repeats a drawn word until the pool is nearly exhausted', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { used } = simulateRoom(POOL, seed)
      expect(new Set(used).size).toBe(used.length)
      expect(used.length).toBeGreaterThanOrEqual(POOL.length - 4 * 3 - 1)
    }
  })

  it('holds for the real default pool', () => {
    const pool = buildWordPool({
      packIds: WORD_PACKS.filter((pack) => pack.defaultEnabled).map(
        (pack) => pack.id,
      ),
      customWords: [],
      customWordsMode: 'mix',
    })
    for (const seed of SEEDS.slice(0, 2)) {
      const { used, drafts } = simulateRoom(pool, seed)
      expect(new Set(used).size).toBe(used.length)
      expect(drafts).toBeGreaterThan(0)
    }
  })
})
