import type { WordDifficulty } from '../types'
import { answerTokens } from './matching'
import type { DraftSelectionInput, PlayableWord } from './types'

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

/**
 * Coarse word-family keys used to avoid offering "snowman" next to
 * "snowball" or both teams drawing "fire truck" and "fire". Tokens are
 * singularized; compound words also contribute a 4+ letter prefix stem.
 */
export function wordStems(term: string): string[] {
  const stems = new Set<string>()
  for (const token of answerTokens(term)) {
    if (STOP_WORDS.has(token) || token.length < 3) continue
    const singular =
      token.endsWith('ies') && token.length > 4
        ? `${token.slice(0, -3)}y`
        : token.endsWith('s') && !token.endsWith('ss') && token.length > 3
          ? token.slice(0, -1)
          : token
    stems.add(singular)
    if (singular.length >= 7) stems.add(singular.slice(0, 4))
  }
  return [...stems]
}

/**
 * Difficulty per card slot. `balanced` guarantees a real choice: with three
 * cards you always see one easy, one medium, and one hard word.
 */
export function difficultySlots(
  mix: 'balanced' | 'easy' | 'mixed' | 'hard',
  count: number,
  random: () => number,
): WordDifficulty[] {
  const safeCount = Math.max(1, Math.floor(count))
  const pick = (weights: Readonly<Record<WordDifficulty, number>>) => {
    const total = weights.easy + weights.medium + weights.hard
    let roll = random() * total
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      roll -= weights[difficulty]
      if (roll < 0) return difficulty
    }
    return 'medium' as const
  }

  switch (mix) {
    case 'easy':
      return Array.from({ length: safeCount }, () =>
        pick({ easy: 3, medium: 1, hard: 0 }),
      ).sort(compareDifficulty)
    case 'hard':
      return Array.from({ length: safeCount }, () =>
        pick({ easy: 0, medium: 1, hard: 2 }),
      ).sort(compareDifficulty)
    case 'mixed':
      return Array.from({ length: safeCount }, () =>
        pick({ easy: 1, medium: 1, hard: 1 }),
      ).sort(compareDifficulty)
    case 'balanced': {
      const base: WordDifficulty[] = ['easy', 'medium', 'hard']
      if (safeCount <= 3) {
        if (safeCount === 3) return base
        if (safeCount === 2)
          return random() < 0.5 ? ['easy', 'hard'] : ['medium', 'hard']
        return ['medium']
      }
      const extra = Array.from({ length: safeCount - 3 }, () =>
        pick({ easy: 1, medium: 2, hard: 1 }),
      )
      return [...base, ...extra].sort(compareDifficulty)
    }
  }
}

const DIFFICULTY_ORDER: Readonly<Record<WordDifficulty, number>> = {
  easy: 0,
  medium: 1,
  hard: 2,
}

function compareDifficulty(left: WordDifficulty, right: WordDifficulty) {
  return DIFFICULTY_ORDER[left] - DIFFICULTY_ORDER[right]
}

const FALLBACK_ORDER: Readonly<
  Record<WordDifficulty, readonly WordDifficulty[]>
> = {
  easy: ['easy', 'medium', 'hard'],
  medium: ['medium', 'easy', 'hard'],
  hard: ['hard', 'medium', 'easy'],
}

/**
 * Picks one word per slot with weighted randomness. Hard exclusions are
 * absolute; penalties, pack penalties, stem conflicts, and pack diversity only
 * lower odds so a small pool still produces a full draft.
 */
export function selectDraftOptions(input: DraftSelectionInput): PlayableWord[] {
  const chosen: PlayableWord[] = []
  const chosenIds = new Set<string>()
  const usedStems = new Set(input.avoidStems)
  const usedPacks = new Set<string>()

  for (const slot of input.slots) {
    const pick =
      pickForSlot(input, slot, chosenIds, usedStems, usedPacks, true) ??
      pickForSlot(input, slot, chosenIds, usedStems, usedPacks, false)
    if (pick === null) break
    chosen.push(pick)
    chosenIds.add(pick.id)
    usedPacks.add(pick.packId)
    for (const stem of wordStems(pick.term)) usedStems.add(stem)
  }

  return chosen
}

function pickForSlot(
  input: DraftSelectionInput,
  slot: WordDifficulty,
  chosenIds: ReadonlySet<string>,
  usedStems: ReadonlySet<string>,
  usedPacks: ReadonlySet<string>,
  strictStems: boolean,
): PlayableWord | null {
  for (const difficulty of FALLBACK_ORDER[slot]) {
    const weighted: { word: PlayableWord; weight: number }[] = []
    for (const word of input.pool) {
      if (word.difficulty !== difficulty) continue
      if (chosenIds.has(word.id) || input.hardExclude.has(word.id)) continue
      const sharesStem = wordStems(word.term).some((stem) =>
        usedStems.has(stem),
      )
      if (sharesStem && strictStems) continue
      let weight = input.penalties.get(word.id) ?? 1
      weight *= input.packPenalties?.get(word.packId) ?? 1
      if (usedPacks.has(word.packId)) weight *= 0.35
      if (sharesStem) weight *= 0.05
      if (weight > 0) weighted.push({ word, weight })
    }
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
    if (total <= 0) continue
    let roll = input.random() * total
    for (const entry of weighted) {
      roll -= entry.weight
      if (roll < 0) return entry.word
    }
    return weighted.at(-1)?.word ?? null
  }
  return null
}
