import type { TeamId } from '../types'
import { isWithinGrace, teamRoster } from './members'
import type {
  DraftOption,
  MatchState,
  RoomMember,
  RoomState,
  TeamRoundState,
} from './types'

export function chosenOption(teamRound: TeamRoundState): DraftOption | null {
  if (teamRound.chosenWordId === null) return null
  return (
    teamRound.options.find(
      (option) => option.wordId === teamRound.chosenWordId,
    ) ?? null
  )
}

/** Chosen option, or an internal error (only call once drawing started). */
export function requireChosen(teamRound: TeamRoundState): DraftOption {
  const chosen = chosenOption(teamRound)
  if (chosen === null) throw new Error(`Team ${teamRound.team} has no word`)
  return chosen
}

/** A match that has started and not yet ended. */
export function isMatchRunning(state: RoomState): boolean {
  return (
    state.match !== null &&
    state.match.endedAtMs === null &&
    state.phase !== 'lobby' &&
    state.phase !== 'stats'
  )
}

/** The canvas a team is actively drawing on right now, if any. */
export interface ActiveCanvas {
  readonly team: TeamId
  readonly canvasId: string
  readonly drawerId: string
  readonly term: string
  readonly aliases: readonly string[]
  readonly strokeCount: number
  /** Start of the guessing window (drawing start or showdown card start). */
  readonly startedAtMs: number
}

export function activeCanvas(
  state: RoomState,
  team: TeamId,
): ActiveCanvas | null {
  const match = state.match
  if (match === null) return null
  if (state.phase === 'drawing' && match.round !== null) {
    const teamRound = match.round.teams[team]
    const chosen = chosenOption(teamRound)
    if (chosen === null || teamRound.solution !== null) return null
    return {
      team,
      canvasId: teamRound.canvasId,
      drawerId: teamRound.drawerId,
      term: chosen.term,
      aliases: chosen.aliases,
      strokeCount: teamRound.strokeCount,
      startedAtMs: match.round.drawingStartedAtMs ?? match.round.startedAtMs,
    }
  }
  if (state.phase === 'showdown' && match.showdown !== null) {
    const teamState = match.showdown.teams[team]
    const card = teamState.cards[teamState.cardIndex]
    if (card === undefined || teamState.drawerId === null) return null
    return {
      team,
      canvasId: teamState.canvasId,
      drawerId: teamState.drawerId,
      term: card.term,
      aliases: card.aliases,
      strokeCount: teamState.strokeCount,
      startedAtMs: teamState.cardStartedAtMs,
    }
  }
  return null
}

/** The member currently drawing for `team` (round or showdown card). */
export function currentDrawerId(state: RoomState, team: TeamId): string | null {
  const match = state.match
  if (match === null) return null
  if (
    (state.phase === 'word-draft' || state.phase === 'drawing') &&
    match.round !== null
  ) {
    return match.round.teams[team].drawerId
  }
  if (state.phase === 'showdown' && match.showdown !== null) {
    return match.showdown.teams[team].drawerId
  }
  return null
}

/** Human guessers who may vote: non-drawers within reconnect grace. */
export function teamElectorate(
  state: RoomState,
  team: TeamId,
  excludeId: string | null,
  now: number,
): RoomMember[] {
  return teamRoster(state, team).filter(
    (member) =>
      member.kind === 'human' &&
      member.id !== excludeId &&
      isWithinGrace(member, now),
  )
}

export function countVotes(
  votes: Readonly<Record<string, boolean>>,
  electorate: readonly RoomMember[],
): number {
  return electorate.filter((member) => votes[member.id] === true).length
}

/** More than half of the electorate. */
export function majorityNeeded(electorateSize: number): number {
  return Math.floor(electorateSize / 2) + 1
}

/** Two thirds, rounded up (at least one). */
export function twoThirdsNeeded(electorateSize: number): number {
  return Math.max(1, Math.ceil((2 * electorateSize) / 3))
}

export function roundsWon(match: MatchState, team: TeamId): number {
  return match.history.filter((round) => round.winner === team).length
}
