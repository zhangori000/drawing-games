import {
  ROOM_SETTINGS_LIMITS,
  type CustomWordsMode,
  type DifficultyMix,
  type OpponentDraftVisibility,
  type WordLengthMode,
} from '@drawing-games/game-core'

/** Choices and copy for every lobby setting, derived from the room limits. */

export interface Choice<T> {
  readonly value: T
  readonly label: string
  readonly description?: string
}

export interface StepperSpec {
  readonly min: number
  readonly max: number
  readonly step: number
}

function range(min: number, max: number, step = 1): number[] {
  const values: number[] = []
  for (let value = min; value <= max; value += step) values.push(value)
  return values
}

const limits = ROOM_SETTINGS_LIMITS

export const ROUND_CHOICES = range(
  limits.rounds.min,
  limits.rounds.max,
  limits.rounds.step,
)
export const DRAWING_SECONDS_CHOICES: readonly number[] = limits.drawingSeconds
export const WORD_CHOICE_COUNT_CHOICES = range(
  limits.wordChoiceCount.min,
  limits.wordChoiceCount.max,
)
export const REPLACEMENT_CHOICES = range(
  limits.replacementsPerDrawer.min,
  limits.replacementsPerDrawer.max,
)
export const SHOWDOWN_SECONDS_CHOICES: readonly number[] =
  limits.showdownSeconds

export const WORD_DRAFT_STEPPER: StepperSpec = {
  ...limits.wordDraftSeconds,
  step: 5,
}
export const RESULTS_STEPPER: StepperSpec = {
  ...limits.roundResultsSeconds,
  step: 2,
}
export const HINT_UNLOCK_STEPPER: StepperSpec = {
  ...limits.hintUnlockSeconds,
  step: 10,
}
export const HINT_COST_STEPPER: StepperSpec = { ...limits.hintCost, step: 5 }

export const DIFFICULTY_MIX_CHOICES: readonly Choice<DifficultyMix>[] = [
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Balanced: one easy, one medium, one hard every draft',
  },
  {
    value: 'easy',
    label: 'Easy',
    description: 'Mostly easy words. Great for kids and warm-ups.',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    description: 'Any difficulty, picked at random.',
  },
  {
    value: 'hard',
    label: 'Hard',
    description: 'Mostly hard words for bigger bonuses.',
  },
]

export const WORD_LENGTH_CHOICES: readonly Choice<WordLengthMode>[] = [
  {
    value: 'hidden-vote',
    label: 'Team vote',
    description: 'Hidden until the guessers vote to reveal it (costs points).',
  },
  {
    value: 'shown',
    label: 'Always shown',
    description: 'Blanks from the first second, free.',
  },
  {
    value: 'hidden',
    label: 'Never shown',
    description: 'Nobody gets the letter count.',
  },
]

export const VISIBILITY_CHOICES: readonly Choice<OpponentDraftVisibility>[] = [
  {
    value: 'actions-only',
    label: 'Swaps only',
    description: 'Opponents only see that a card was swapped.',
  },
  {
    value: 'options-and-actions',
    label: 'Cards + swaps',
    description:
      'Each team sees the other drawer’s cards and swaps, never the pick. Guessers lose the category, bonus, and letter clues for their own word.',
  },
  {
    value: 'hidden',
    label: 'Hidden',
    description: 'Opponents see nothing during the draft.',
  },
]

/**
 * Why the Clues section is off while opponents see the cards (game-core's
 * `ownWordCluesAllowed` is the rule).
 */
export const CLUES_OFF_WITH_CARDS =
  'Off while opponents see the draft cards: any one clue plus those cards would give the word away.'

export const CUSTOM_MODE_LABELS: Readonly<Record<CustomWordsMode, string>> = {
  mix: 'Mixed into the packs',
  only: 'Only my words',
}

/** Moves one step, snapping to the grid and staying within the limits. */
export function stepValue(
  value: number,
  spec: StepperSpec,
  direction: -1 | 1,
): number {
  const snapped =
    direction > 0
      ? Math.floor(value / spec.step) * spec.step + spec.step
      : Math.ceil(value / spec.step) * spec.step - spec.step
  return Math.min(spec.max, Math.max(spec.min, snapped))
}

/** "Use only my words" needs two full drafts' worth of custom words. */
export function minimumCustomWordsForOnly(wordChoiceCount: number): number {
  return wordChoiceCount * 2
}
