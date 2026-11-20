import type { WordDifficulty } from '../types'
import { boundedMemo } from './memo'
import { termForWordId } from './pool'
import { createSameWordSet, type SameWordSet } from './same-word'
import { wordStems } from './stems'
import { normalizeAnswer } from './text'
import type { DraftSelectionInput, PlayableWord } from './types'

// Pool terms repeat across every draft of a room; guesses never go through
// these caches.
const termAnswerKey = boundedMemo(normalizeAnswer)
const termStems = boundedMemo((term): readonly string[] =>
  Object.freeze(wordStems(term)),
)

/** Odds multiplier per card already taken from the same pack in this draft. */
export const SAME_PACK_IN_DRAFT_FACTOR = 0.35
/** Odds multiplier per shared stem once stems can only be avoided softly. */
export const SHARED_STEM_FACTOR = 0.05
/** Caller multipliers are clamped up to this, so 0 never acts as exclusion. */
export const MIN_PENALTY_MULTIPLIER = 0.01

const FALLBACK_ORDER: Readonly<
  Record<WordDifficulty, readonly WordDifficulty[]>
> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
}

interface Candidate {
  readonly word: PlayableWord
  readonly key: string
  readonly stems: readonly string[]
  /** Caller penalties combined; draft-local factors are applied per pick. */
  readonly baseWeight: number
}

interface DraftProgress {
  readonly chosenKeys: Set<string>
  readonly usedStems: Set<string>
  readonly packCounts: Map<string, number>
}

function clampMultiplier(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 1
  return Math.min(1, Math.max(MIN_PENALTY_MULTIPLIER, value))
}

function unitRoll(random: () => number): number {
  const value = random()
  if (!Number.isFinite(value) || value < 0) return 0
  return value >= 1 ? 1 - Number.EPSILON : value
}

/**
 * The words behind the excluded ids, so an excluded `custom/cat` also
 * blocks `animals/cat` (and vice versa) when the pool changes between
 * matches, and an excluded `animals/dolphin` blocks a custom `dolphins`
 * (`isSameWord`).
 */
function excludedWords(
  pool: readonly PlayableWord[],
  excludedIds: ReadonlySet<string>,
): SameWordSet {
  const words = createSameWordSet()
  if (excludedIds.size === 0) return words
  for (const word of pool) {
    if (excludedIds.has(word.id)) words.add(word.term)
  }
  for (const id of excludedIds) {
    const term = termForWordId(id)
    if (term !== null) words.add(term)
  }
  return words
}

/**
 * Pool words that are not excluded, once each (by id, and by answer key or
 * inflection: one of `dolphin`/`dolphins`), in pool order.
 */
function freshWords(
  pool: readonly PlayableWord[],
  excludedIds: ReadonlySet<string>,
): { word: PlayableWord; key: string }[] {
  const excluded = excludedWords(pool, excludedIds)
  const seenIds = new Set<string>()
  const seen = createSameWordSet()
  const fresh: { word: PlayableWord; key: string }[] = []
  for (const word of pool) {
    if (seenIds.has(word.id) || excludedIds.has(word.id)) continue
    const key = termAnswerKey(word.term)
    if (key.length === 0 || seen.has(word.term) || excluded.has(word.term)) {
      continue
    }
    seenIds.add(word.id)
    seen.add(word.term)
    fresh.push({ word, key })
  }
  return fresh
}

/**
 * How many distinct pool words remain offerable under `excludedIds`, using
 * the same id-or-same-word rule as `selectDraftOptions`. The room uses it to
 * decide when its used-word memory must relax.
 */
export function countFreshWords(
  pool: readonly PlayableWord[],
  excludedIds: ReadonlySet<string>,
): number {
  return freshWords(pool, excludedIds).length
}

function weightedPick<T>(
  entries: readonly { readonly item: T; readonly weight: number }[],
  random: () => number,
): T | null {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (entries.length === 0 || !(total > 0)) return null
  let roll = unitRoll(random) * total
  for (const entry of entries) {
    roll -= entry.weight
    if (roll < 0) return entry.item
  }
  return entries.at(-1)?.item ?? null
}

/**
 * Passes from best to most relaxed: requested difficulty without shared
 * stems, other difficulties without shared stems, then the same two with
 * shared stems allowed at heavily reduced odds. `strict` skips the other
 * difficulties.
 */
function pickForSlot(
  candidates: readonly Candidate[],
  slot: WordDifficulty,
  progress: DraftProgress,
  random: () => number,
  strict = false,
): Candidate | null {
  const fallback = FALLBACK_ORDER[slot] ?? FALLBACK_ORDER.medium
  const order = strict ? fallback.slice(0, 1) : fallback
  for (const strictStems of [true, false]) {
    for (const difficulty of order) {
      const eligible: { item: Candidate; weight: number }[] = []
      for (const candidate of candidates) {
        if (candidate.word.difficulty !== difficulty) continue
        if (progress.chosenKeys.has(candidate.key)) continue
        const sharedStems = candidate.stems.filter((stem) =>
          progress.usedStems.has(stem),
        ).length
        if (strictStems && sharedStems > 0) continue
        const packRepeats = progress.packCounts.get(candidate.word.packId) ?? 0
        eligible.push({
          item: candidate,
          weight:
            candidate.baseWeight *
            SAME_PACK_IN_DRAFT_FACTOR ** packRepeats *
            SHARED_STEM_FACTOR ** sharedStems,
        })
      }
      const pick = weightedPick(eligible, random)
      if (pick !== null) return pick
    }
  }
  return null
}

/**
 * Picks one word per slot with weighted randomness.
 *
 * - Hard exclusions are absolute and also cover other ids with the same
 *   answer key or inflection (`isSameWord`); no two cards ever share an id
 *   or name the same word.
 * - Caller penalties and pack penalties multiply a word's odds (clamped to
 *   [`MIN_PENALTY_MULTIPLIER`, 1]); a repeated pack within the draft costs
 *   `SAME_PACK_IN_DRAFT_FACTOR` per earlier card from that pack.
 * - A slot prefers its own difficulty, then the nearest others; stems in
 *   `avoidStems` or on earlier cards are avoided strictly first, softly last.
 * - Calls `random` exactly once per returned card, so the same random
 *   sequence always gives the same cards.
 *
 * Returns fewer cards than slots only when the pool has no other
 * non-excluded word left.
 */
export function selectDraftOptions(input: DraftSelectionInput): PlayableWord[] {
  const chosen: PlayableWord[] = []
  for (const word of selectDraftSlots(input)) {
    if (word === null) break
    chosen.push(word)
  }
  return chosen
}

export interface DraftSlotSelectionInput extends DraftSelectionInput {
  /**
   * Only fill a slot with a word of its own difficulty (no fallback to the
   * nearest other difficulty); slots with none stay empty.
   */
  readonly strictDifficulty?: boolean
  /**
   * Fill at most this many slots. The slots whose difficulty has the most
   * candidates are filled first (ties in slot order), so scarce words of a
   * difficulty are left for whoever needs them next (the other hand).
   */
  readonly maxPicks?: number
}

/**
 * `selectDraftOptions` slot by slot: `result[i]` is the word for
 * `slots[i]`, or null when it stays empty (nothing eligible, or past
 * `maxPicks`). Same rules and the same one `random` call per filled slot;
 * without `strictDifficulty` and `maxPicks`, the filled slots are exactly
 * the cards `selectDraftOptions` returns.
 */
export function selectDraftSlots(
  input: DraftSlotSelectionInput,
): (PlayableWord | null)[] {
  const candidates: Candidate[] = freshWords(input.pool, input.hardExclude).map(
    ({ word, key }) => ({
      word,
      key,
      stems: termStems(word.term),
      baseWeight:
        clampMultiplier(input.penalties.get(word.id)) *
        clampMultiplier(input.packPenalties?.get(word.packId)),
    }),
  )
  const progress: DraftProgress = {
    chosenKeys: new Set(),
    usedStems: new Set(input.avoidStems),
    packCounts: new Map(),
  }
  const result: (PlayableWord | null)[] = input.slots.map(() => null)
  const maxPicks = input.maxPicks ?? input.slots.length
  let order = input.slots.map((_, index) => index)
  if (maxPicks < input.slots.length) {
    const supply = new Map<WordDifficulty, number>()
    for (const candidate of candidates) {
      const difficulty = candidate.word.difficulty
      supply.set(difficulty, (supply.get(difficulty) ?? 0) + 1)
    }
    const supplyOf = (index: number) =>
      supply.get(input.slots[index] as WordDifficulty) ?? 0
    order = [...order].sort((left, right) => supplyOf(right) - supplyOf(left))
  }

  let picks = 0
  for (const index of order) {
    if (picks >= maxPicks) break
    const pick = pickForSlot(
      candidates,
      input.slots[index] as WordDifficulty,
      progress,
      input.random,
      input.strictDifficulty === true,
    )
    if (pick === null) {
      // With fallback, nothing is left for any later slot either.
      if (input.strictDifficulty === true) continue
      break
    }
    result[index] = pick.word
    picks += 1
    progress.chosenKeys.add(pick.key)
    for (const stem of pick.stems) progress.usedStems.add(stem)
    progress.packCounts.set(
      pick.word.packId,
      (progress.packCounts.get(pick.word.packId) ?? 0) + 1,
    )
  }
  return result
}
