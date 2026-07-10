export const TEAM_IDS = ['A', 'B'] as const

export type TeamId = (typeof TEAM_IDS)[number]

export type PlayerId = string

export type TeamScores = Readonly<Record<TeamId, number>>

export type TeamRosters = Readonly<Record<TeamId, readonly PlayerId[]>>

export type DrawersByTeam = Readonly<Record<TeamId, PlayerId>>

export const WORD_DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export type WordDifficulty = (typeof WORD_DIFFICULTIES)[number]

export const WORD_REPLACEMENT_REASONS = [
  'seen-before',
  'unknown-definition',
] as const

export type WordReplacementReason = (typeof WORD_REPLACEMENT_REASONS)[number]

export interface WinStreak {
  readonly team: TeamId
  readonly wins: number
}

export const GAME_PHASES = [
  'lobby',
  'settings',
  'ready',
  'word-draft',
  'drawing',
  'round-results',
  'showdown',
  'stats',
  'rematch',
] as const

export type GamePhaseName = (typeof GAME_PHASES)[number]

export const TIMED_PHASES = [
  'word-draft',
  'drawing',
  'round-results',
  'showdown',
] as const

export type TimedPhaseName = (typeof TIMED_PHASES)[number]

export type UntimedPhaseName = Exclude<GamePhaseName, TimedPhaseName>

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A'
}
