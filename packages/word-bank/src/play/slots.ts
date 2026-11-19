import { WORD_DIFFICULTIES, type WordDifficulty } from '../types'

/** Mirrors game-core's `DifficultyMix` (word-bank must not import game-core). */
export type DraftDifficultyMix = 'balanced' | 'easy' | 'mixed' | 'hard'

export const MAX_DRAFT_SLOTS = 7

type DifficultyWeights = Readonly<Record<WordDifficulty, number>>

const DIFFICULTY_ORDER: Readonly<Record<WordDifficulty, number>> = {
  easy: 0,
  medium: 1,
  hard: 2,
}

/** Extra cards beyond one-of-each lean toward the middle. */
const BALANCED_EXTRA: DifficultyWeights = { easy: 1, medium: 2, hard: 1 }
const EASY_BIAS: DifficultyWeights = { easy: 3, medium: 1, hard: 0 }
const HARD_BIAS: DifficultyWeights = { easy: 0, medium: 1, hard: 2 }
const UNIFORM: DifficultyWeights = { easy: 1, medium: 1, hard: 1 }

function compareDifficulty(left: WordDifficulty, right: WordDifficulty) {
  return DIFFICULTY_ORDER[left] - DIFFICULTY_ORDER[right]
}

function unitRoll(random: () => number): number {
  const value = random()
  if (!Number.isFinite(value) || value < 0) return 0
  return value >= 1 ? 1 - Number.EPSILON : value
}

/** Weighted pick among `allowed` (all difficulties by default). */
function pickDifficulty(
  weights: DifficultyWeights,
  random: () => number,
  allowed: readonly WordDifficulty[] = WORD_DIFFICULTIES,
): WordDifficulty {
  const total = allowed.reduce(
    (sum, difficulty) => sum + weights[difficulty],
    0,
  )
  if (total <= 0) return allowed[0] ?? 'medium'
  let roll = unitRoll(random) * total
  for (const difficulty of allowed) {
    roll -= weights[difficulty]
    if (roll < 0) return difficulty
  }
  return allowed.at(-1) ?? 'medium'
}

/**
 * As even as possible: every difficulty appears ⌊n/3⌋ times and the
 * remainder goes to distinct difficulties, so 3 cards are exactly one of
 * each, 2 cards always differ, and 4–5 cards repeat at most one each.
 */
function balancedSlots(count: number, random: () => number): WordDifficulty[] {
  const slots: WordDifficulty[] = []
  const perDifficulty = Math.floor(count / 3)
  for (const difficulty of WORD_DIFFICULTIES) {
    for (let index = 0; index < perDifficulty; index += 1)
      slots.push(difficulty)
  }
  const remaining = [...WORD_DIFFICULTIES]
  for (let index = 0; index < count % 3; index += 1) {
    const pick = pickDifficulty(BALANCED_EXTRA, random, remaining)
    slots.push(pick)
    remaining.splice(remaining.indexOf(pick), 1)
  }
  return slots
}

/** One guaranteed `anchor` card, the rest drawn from `weights`. */
function biasedSlots(
  count: number,
  anchor: WordDifficulty,
  weights: DifficultyWeights,
  random: () => number,
): WordDifficulty[] {
  const slots: WordDifficulty[] = [anchor]
  while (slots.length < count) slots.push(pickDifficulty(weights, random))
  return slots
}

/** Independent uniform picks, but never all the same with 2+ cards. */
function mixedSlots(count: number, random: () => number): WordDifficulty[] {
  const slots: WordDifficulty[] = []
  while (slots.length < count) slots.push(pickDifficulty(UNIFORM, random))
  const first = slots[0] as WordDifficulty
  if (count >= 2 && slots.every((slot) => slot === first)) {
    const others = WORD_DIFFICULTIES.filter(
      (difficulty) => difficulty !== first,
    )
    slots[count - 1] = pickDifficulty(UNIFORM, random, others)
  }
  return slots
}

/**
 * Requested difficulty per draft card, sorted easy → hard for display.
 * `count` is clamped to 1–`MAX_DRAFT_SLOTS`. Uses only `random`, so the same
 * random sequence always yields the same slots.
 */
export function difficultySlots(
  mix: DraftDifficultyMix,
  count: number,
  random: () => number,
): WordDifficulty[] {
  const safeCount = Number.isFinite(count)
    ? Math.min(MAX_DRAFT_SLOTS, Math.max(1, Math.floor(count)))
    : 1
  let slots: WordDifficulty[]
  switch (mix) {
    case 'easy':
      slots = biasedSlots(safeCount, 'easy', EASY_BIAS, random)
      break
    case 'hard':
      slots = biasedSlots(safeCount, 'hard', HARD_BIAS, random)
      break
    case 'mixed':
      slots = mixedSlots(safeCount, random)
      break
    default:
      slots = balancedSlots(safeCount, random)
  }
  return slots.sort(compareDifficulty)
}
