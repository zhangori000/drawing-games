export type WordLengthVisibility = 'hidden' | 'shown'

export type WordLengthRevealPolicy = 'disabled' | 'team-majority'

export type OpponentDraftVisibility =
  'options-and-actions' | 'actions-only' | 'hidden'

export interface WordLengthSettings {
  /** Whether guessers see blanks or a character count when drawing begins. */
  readonly initialVisibility: WordLengthVisibility
  /** How a hidden length may be revealed during an active round. */
  readonly revealPolicy: WordLengthRevealPolicy
  /** Points deducted when the team successfully reveals the length. */
  readonly hintCost: number
}

export interface SurrenderSettings {
  readonly enabled: boolean
  readonly minimumCompletedRounds: number
  readonly minimumPointDeficit: number
}

export interface GameSettings {
  /** Number of normal rounds before the showdown. */
  readonly rounds: number
  readonly wordChoiceCount: number
  readonly wordDraftSeconds: number
  readonly drawingSeconds: number
  readonly roundResultsSeconds: number
  readonly showdownSeconds: number
  readonly seenRerollsPerDrawer: number
  /** What the opposing team may observe while a drawer chooses its word. */
  readonly opponentDraftVisibility: OpponentDraftVisibility
  readonly wordLength: WordLengthSettings
  readonly surrender: SurrenderSettings
}

export const DEFAULT_GAME_SETTINGS: GameSettings = Object.freeze({
  rounds: 6,
  wordChoiceCount: 3,
  wordDraftSeconds: 15,
  drawingSeconds: 90,
  roundResultsSeconds: 8,
  showdownSeconds: 120,
  seenRerollsPerDrawer: 1,
  opponentDraftVisibility: 'options-and-actions',
  wordLength: Object.freeze({
    initialVisibility: 'hidden',
    revealPolicy: 'team-majority',
    hintCost: 10,
  }),
  surrender: Object.freeze({
    enabled: true,
    minimumCompletedRounds: 3,
    minimumPointDeficit: 100,
  }),
})
