export const PLAYTEST_PARTICIPANT_IDS = [
  'team-a-drawer',
  'team-a-guesser',
  'team-b-drawer',
  'team-b-guesser',
] as const

export type PlaytestParticipantId = (typeof PLAYTEST_PARTICIPANT_IDS)[number]
export type PlaytestTeamId = 'team-a' | 'team-b'
export type PlaytestRole = 'drawer' | 'guesser'

export interface PlaytestParticipant {
  readonly id: PlaytestParticipantId
  readonly displayName: string
  readonly role: PlaytestRole
  readonly teamId: PlaytestTeamId
}

export const PLAYTEST_PARTICIPANTS: Readonly<
  Record<PlaytestParticipantId, PlaytestParticipant>
> = {
  'team-a-drawer': {
    id: 'team-a-drawer',
    displayName: 'Ari',
    role: 'drawer',
    teamId: 'team-a',
  },
  'team-a-guesser': {
    id: 'team-a-guesser',
    displayName: 'Mina',
    role: 'guesser',
    teamId: 'team-a',
  },
  'team-b-drawer': {
    id: 'team-b-drawer',
    displayName: 'Bo',
    role: 'drawer',
    teamId: 'team-b',
  },
  'team-b-guesser': {
    id: 'team-b-guesser',
    displayName: 'Theo',
    role: 'guesser',
    teamId: 'team-b',
  },
}

export interface PlaytestTeamView {
  readonly id: PlaytestTeamId
  readonly name: string
  readonly score: number
  readonly solved: boolean
  readonly members: readonly PlaytestParticipant[]
}

export type PlaytestWordView =
  | {
      readonly visibility: 'drawer-only'
      readonly value: string
      readonly length: number
      readonly difficulty: WordDifficulty
    }
  | {
      readonly visibility: 'length-only'
      readonly length: number
    }

export interface PlaytestGuessView {
  readonly id: string
  readonly announcement: string
  readonly result: 'correct' | 'incorrect'
  readonly teamId: PlaytestTeamId
}

export interface PlaytestRoomView {
  readonly roomCode: string
  readonly revision: number
  readonly participant: PlaytestParticipant
  readonly phase: 'drawing'
  readonly round: {
    readonly current: number
    readonly total: number
    readonly secondsRemaining: number
  }
  readonly word: PlaytestWordView
  readonly teams: readonly PlaytestTeamView[]
  readonly recentGuesses: readonly PlaytestGuessView[]
}

export function isPlaytestParticipantId(
  value: unknown,
): value is PlaytestParticipantId {
  return (
    typeof value === 'string' &&
    PLAYTEST_PARTICIPANT_IDS.some((participantId) => participantId === value)
  )
}
import type { WordDifficulty } from '@drawing-games/game-core'
