import {
  formatCustomWordEntry,
  parseCustomWordEntry,
  WORD_PACKS,
} from '@drawing-games/word-bank'

import type { OpponentDraftVisibility } from '../settings'
import { reject } from './context'
import type {
  CustomWordsMode,
  DifficultyMix,
  RoomSettings,
  WordLengthMode,
} from './settings'
import { ROOM_SETTINGS_LIMITS } from './settings'
import { cleanText, codePointLength } from './text'
import { countCustomWords } from './words'

const VISIBILITIES: readonly OpponentDraftVisibility[] = [
  'options-and-actions',
  'actions-only',
  'hidden',
]
const LENGTH_MODES: readonly WordLengthMode[] = [
  'hidden-vote',
  'shown',
  'hidden',
]
const DIFFICULTY_MIXES: readonly DifficultyMix[] = [
  'balanced',
  'easy',
  'mixed',
  'hard',
]
const CUSTOM_MODES: readonly CustomWordsMode[] = ['mix', 'only']

function rangeInt(
  value: unknown,
  limits: { readonly min: number; readonly max: number },
  message: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < limits.min ||
    value > limits.max
  ) {
    return reject('BAD_COMMAND', message)
  }
  return value
}

function oneOf<T>(value: unknown, allowed: readonly T[], message: string): T {
  const match = allowed.find((entry) => entry === value)
  return match === undefined ? reject('BAD_COMMAND', message) : match
}

function bool(value: unknown, message: string): boolean {
  return typeof value === 'boolean' ? value : reject('BAD_COMMAND', message)
}

/** Known pack ids only, de-duplicated, capped. */
function sanitizePackIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return reject('BAD_COMMAND', 'Packs must be a list.')
  const known = new Set(WORD_PACKS.map((pack) => pack.id))
  const ids: string[] = []
  for (const id of raw) {
    if (typeof id === 'string' && known.has(id) && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids.slice(0, ROOM_SETTINGS_LIMITS.packIds.maxCount)
}

/**
 * Trims, collapses whitespace, strips control characters, keeps 2–32
 * character words, and de-duplicates case-insensitively (first spelling
 * wins). An optional difficulty tag (`kite|hard`, `parseCustomWordEntry`)
 * is kept in canonical form; entries with a malformed tag are dropped, and
 * the length limits apply to the word itself.
 */
function sanitizeCustomWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return reject('BAD_COMMAND', 'Custom words must be a list.')
  }
  const limits = ROOM_SETTINGS_LIMITS.customWords
  const words: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const parsed = parseCustomWordEntry(cleanText(entry))
    if (parsed === null) continue
    const term = parsed.term
    const length = codePointLength(term)
    if (length < limits.minLength || length > limits.maxLength) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(formatCustomWordEntry({ term, difficulty: parsed.difficulty }))
  }
  if (words.length > limits.maxCount) {
    return reject(
      'BAD_COMMAND',
      `You can add up to ${limits.maxCount} custom words.`,
    )
  }
  return words
}

/**
 * Validates a host's settings patch against `ROOM_SETTINGS_LIMITS` and
 * returns the merged settings. Rejects (never throws other errors) on any
 * invalid field so the host sees what to fix.
 */
export function applySettingsPatch(
  current: RoomSettings,
  patch: Partial<RoomSettings>,
): RoomSettings {
  if (typeof patch !== 'object' || patch === null) {
    return reject('BAD_COMMAND', 'Those settings could not be read.')
  }
  const limits = ROOM_SETTINGS_LIMITS
  let next: RoomSettings = { ...current }

  if (patch.rounds !== undefined) {
    const rounds = rangeInt(
      patch.rounds,
      limits.rounds,
      `Rounds must be an even number from ${limits.rounds.min} to ${limits.rounds.max}.`,
    )
    if (rounds % limits.rounds.step !== 0) {
      reject(
        'BAD_COMMAND',
        `Rounds must be an even number from ${limits.rounds.min} to ${limits.rounds.max}.`,
      )
    }
    next = { ...next, rounds }
  }
  if (patch.drawingSeconds !== undefined) {
    next = {
      ...next,
      drawingSeconds: oneOf(
        patch.drawingSeconds,
        limits.drawingSeconds,
        `Drawing time must be one of ${limits.drawingSeconds.join(', ')} seconds.`,
      ),
    }
  }
  if (patch.wordDraftSeconds !== undefined) {
    next = {
      ...next,
      wordDraftSeconds: rangeInt(
        patch.wordDraftSeconds,
        limits.wordDraftSeconds,
        `Word pick time must be ${limits.wordDraftSeconds.min}–${limits.wordDraftSeconds.max} seconds.`,
      ),
    }
  }
  if (patch.roundResultsSeconds !== undefined) {
    next = {
      ...next,
      roundResultsSeconds: rangeInt(
        patch.roundResultsSeconds,
        limits.roundResultsSeconds,
        `Results time must be ${limits.roundResultsSeconds.min}–${limits.roundResultsSeconds.max} seconds.`,
      ),
    }
  }
  if (patch.wordChoiceCount !== undefined) {
    next = {
      ...next,
      wordChoiceCount: rangeInt(
        patch.wordChoiceCount,
        limits.wordChoiceCount,
        `Word choices must be ${limits.wordChoiceCount.min}–${limits.wordChoiceCount.max}.`,
      ),
    }
  }
  if (patch.replacementsPerDrawer !== undefined) {
    next = {
      ...next,
      replacementsPerDrawer: rangeInt(
        patch.replacementsPerDrawer,
        limits.replacementsPerDrawer,
        `Word swaps must be ${limits.replacementsPerDrawer.min}–${limits.replacementsPerDrawer.max}.`,
      ),
    }
  }
  if (patch.opponentDraftVisibility !== undefined) {
    next = {
      ...next,
      opponentDraftVisibility: oneOf(
        patch.opponentDraftVisibility,
        VISIBILITIES,
        'Unknown draft visibility.',
      ),
    }
  }
  if (patch.wordLengthMode !== undefined) {
    next = {
      ...next,
      wordLengthMode: oneOf(
        patch.wordLengthMode,
        LENGTH_MODES,
        'Unknown word length mode.',
      ),
    }
  }
  if (patch.hintUnlockSeconds !== undefined) {
    next = {
      ...next,
      hintUnlockSeconds: rangeInt(
        patch.hintUnlockSeconds,
        limits.hintUnlockSeconds,
        `Hint unlock must be ${limits.hintUnlockSeconds.min}–${limits.hintUnlockSeconds.max} seconds.`,
      ),
    }
  }
  if (patch.hintCost !== undefined) {
    next = {
      ...next,
      hintCost: rangeInt(
        patch.hintCost,
        limits.hintCost,
        `Hint cost must be ${limits.hintCost.min}–${limits.hintCost.max} points.`,
      ),
    }
  }
  if (patch.difficultyMix !== undefined) {
    next = {
      ...next,
      difficultyMix: oneOf(
        patch.difficultyMix,
        DIFFICULTY_MIXES,
        'Unknown difficulty mix.',
      ),
    }
  }
  if (patch.packIds !== undefined) {
    next = { ...next, packIds: sanitizePackIds(patch.packIds) }
  }
  if (patch.customWords !== undefined) {
    next = { ...next, customWords: sanitizeCustomWords(patch.customWords) }
  }
  if (patch.customWordsMode !== undefined) {
    next = {
      ...next,
      customWordsMode: oneOf(
        patch.customWordsMode,
        CUSTOM_MODES,
        'Unknown custom words mode.',
      ),
    }
  }
  if (patch.categoryHint !== undefined) {
    next = {
      ...next,
      categoryHint: bool(
        patch.categoryHint,
        'Category hint must be on or off.',
      ),
    }
  }
  if (patch.showdown !== undefined) {
    next = {
      ...next,
      showdown: bool(patch.showdown, 'Showdown must be on or off.'),
    }
  }
  if (patch.showdownSeconds !== undefined) {
    next = {
      ...next,
      showdownSeconds: oneOf(
        patch.showdownSeconds,
        limits.showdownSeconds,
        `Showdown time must be one of ${limits.showdownSeconds.join(', ')} seconds.`,
      ),
    }
  }

  const minCustom = 2 * next.wordChoiceCount
  const customOnlyIsEnough =
    next.customWordsMode === 'only' &&
    countCustomWords(next.customWords) >= minCustom
  if (next.packIds.length === 0 && !customOnlyIsEnough) {
    reject(
      'BAD_COMMAND',
      `Turn on at least one word pack, or use only your own words (at least ${minCustom}).`,
    )
  }
  return next
}

export function settingsEqual(
  left: RoomSettings,
  right: RoomSettings,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
