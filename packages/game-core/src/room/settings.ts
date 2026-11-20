import type { OpponentDraftVisibility } from '../settings'

/**
 * Lobby-configurable rules for a live room. Every connected player can see
 * these (except the custom words themselves, which only the host receives;
 * see `RoomSettingsView`); only the host may change them, and only in the
 * lobby.
 */
export type DifficultyMix = 'balanced' | 'easy' | 'mixed' | 'hard'

/**
 * - `hidden-vote`: guessers see nothing about length until a team-majority
 *   vote (available after `hintUnlockSeconds`) reveals blanks for `hintCost`.
 * - `shown`: blanks are visible from the first second at no cost.
 * - `hidden`: length is never revealed.
 */
export type WordLengthMode = 'hidden-vote' | 'shown' | 'hidden'

export type CustomWordsMode = 'mix' | 'only'

export interface RoomSettings {
  /** Normal rounds before the optional showdown. Even, 2–16. */
  readonly rounds: number
  readonly drawingSeconds: number
  readonly wordDraftSeconds: number
  readonly roundResultsSeconds: number
  /** Cards offered to each drawer during the word draft. 2–5. */
  readonly wordChoiceCount: number
  /** Shared allowance for "seen it" and "don't know it" replacements. 0–5. */
  readonly replacementsPerDrawer: number
  readonly opponentDraftVisibility: OpponentDraftVisibility
  readonly wordLengthMode: WordLengthMode
  /** Seconds after drawing starts before a length-reveal vote may open. */
  readonly hintUnlockSeconds: number
  /** Points subtracted from a solve after the team revealed the length. */
  readonly hintCost: number
  readonly difficultyMix: DifficultyMix
  /** Enabled curated word packs (ids from @drawing-games/word-bank). */
  readonly packIds: readonly string[]
  /** Host-supplied words, already trimmed and de-duplicated. Host-only. */
  readonly customWords: readonly string[]
  readonly customWordsMode: CustomWordsMode
  /** Show guessers the pack/category name of their team's word. */
  readonly categoryHint: boolean
  readonly showdown: boolean
  readonly showdownSeconds: number
}

export const ROOM_SETTINGS_LIMITS = Object.freeze({
  rounds: Object.freeze({ min: 2, max: 16, step: 2 }),
  drawingSeconds: Object.freeze([45, 60, 75, 90, 120] as const),
  wordDraftSeconds: Object.freeze({ min: 10, max: 30 }),
  roundResultsSeconds: Object.freeze({ min: 4, max: 20 }),
  wordChoiceCount: Object.freeze({ min: 2, max: 5 }),
  replacementsPerDrawer: Object.freeze({ min: 0, max: 5 }),
  hintUnlockSeconds: Object.freeze({ min: 0, max: 90 }),
  hintCost: Object.freeze({ min: 0, max: 50 }),
  showdownSeconds: Object.freeze([60, 90, 120, 180] as const),
  customWords: Object.freeze({
    maxCount: 300,
    minLength: 2,
    maxLength: 32,
  }),
  packIds: Object.freeze({ maxCount: 32 }),
})

export const MIN_MEMBERS_PER_TEAM = 2
export const MAX_MEMBERS_PER_TEAM = 8
export const MAX_ROOM_MEMBERS = 16

/**
 * Pack ids enabled for a new room. Must stay in sync with the
 * `defaultEnabled` flags in `@drawing-games/word-bank` pack metadata; a test
 * in game-core asserts the two agree.
 */
export const DEFAULT_ROOM_PACK_IDS: readonly string[] = Object.freeze([
  'everyday',
  'animals',
  'food',
  'nature',
  'places',
  'jobs',
  'sports',
  'fantasy',
  'vehicles',
  'space-science',
])

export const DEFAULT_ROOM_SETTINGS: RoomSettings = Object.freeze({
  rounds: 6,
  drawingSeconds: 90,
  wordDraftSeconds: 15,
  roundResultsSeconds: 8,
  wordChoiceCount: 3,
  replacementsPerDrawer: 1,
  // Opponents see swaps, not cards: with the cards, a seat on the other team
  // plus the guessers' own clues would point at the exact word.
  opponentDraftVisibility: 'actions-only',
  wordLengthMode: 'hidden-vote',
  hintUnlockSeconds: 30,
  hintCost: 10,
  difficultyMix: 'balanced',
  packIds: DEFAULT_ROOM_PACK_IDS,
  customWords: Object.freeze([]) as readonly string[],
  customWordsMode: 'mix',
  categoryHint: true,
  showdown: true,
  showdownSeconds: 120,
})

export const TEAM_NAMES = Object.freeze({ A: 'Sun', B: 'Moon' } as const)

/**
 * Whether guessers get clues about their own word that tell draft cards
 * apart: its difficulty (bonus), category, and letter blanks. They are off
 * while opponents see the draft cards (`options-and-actions`), because
 * anyone on the other team could then match a clue to one of the cards they
 * saw and hand over the exact answer. Drawers always see their own word.
 */
export function ownWordCluesAllowed(settings: RoomSettings): boolean {
  return settings.opponentDraftVisibility !== 'options-and-actions'
}

/** The word-length mode in effect (`hidden` while cards are shown). */
export function effectiveWordLengthMode(
  settings: RoomSettings,
): WordLengthMode {
  return ownWordCluesAllowed(settings) ? settings.wordLengthMode : 'hidden'
}

/** Whether guessers see their word's category right now. */
export function effectiveCategoryHint(settings: RoomSettings): boolean {
  return settings.categoryHint && ownWordCluesAllowed(settings)
}
