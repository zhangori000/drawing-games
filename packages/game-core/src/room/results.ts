import { getSurrenderEligibility } from '../state-machine'
import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { SURRENDER_RULES } from './constants'
import type { RoomContext } from './context'
import { reject, requireMatch, updateMatch } from './context'
import { endMatch } from './match'
import { findActiveMember, isWithinGrace, teamRoster } from './members'
import { startRound } from './round-start'
import { startShowdown } from './showdown'
import { countVotes, twoThirdsNeeded } from './selectors'
import type { RoomCommand, RoomMember, RoomState } from './types'

type Command<T extends RoomCommand['type']> = Extract<RoomCommand, { type: T }>

export function nextPhaseAfterResults(
  state: RoomState,
): 'word-draft' | 'showdown' | 'stats' {
  const match = state.match
  if (match === null) return 'stats'
  if (match.completedRounds < state.settings.rounds) return 'word-draft'
  const bothHaveCards = TEAM_IDS.every((team) =>
    match.history.some((round) => round.teams[team].chosenWordId !== null),
  )
  return state.settings.showdown && bothHaveCards ? 'showdown' : 'stats'
}

/** Results deadline or host skip: next round, showdown, or final stats. */
export function continueAfterResults(ctx: RoomContext): void {
  switch (nextPhaseAfterResults(ctx.state)) {
    case 'word-draft':
      startRound(ctx)
      return
    case 'showdown':
      startShowdown(ctx)
      return
    case 'stats':
      endMatch(ctx, 'completed', null)
  }
}

export function handleRoundContinue(
  ctx: RoomContext,
  command: Command<'round.continue'>,
): void {
  if (ctx.state.phase !== 'round-results') {
    reject('NOT_ALLOWED', 'There is no round to continue from.')
  }
  if (ctx.state.hostId !== command.actorId) {
    reject('NOT_ALLOWED', 'Only the host can skip ahead.')
  }
  continueAfterResults(ctx)
}

/* ------------------------------------------------------------------------ */
/* Surrender                                                                */
/* ------------------------------------------------------------------------ */

export function surrenderEligible(state: RoomState, team: TeamId): boolean {
  const match = state.match
  if (match === null) return false
  return getSurrenderEligibility({
    team,
    scores: match.scores,
    completedRounds: match.completedRounds,
    phase: state.phase === 'round-results' ? 'round-results' : 'drawing',
    settings: SURRENDER_RULES,
  }).eligible
}

/** Every human on the team, within reconnect grace, may vote. */
export function surrenderElectorate(
  state: RoomState,
  team: TeamId,
  now: number,
): RoomMember[] {
  return teamRoster(state, team).filter(
    (member) => member.kind === 'human' && isWithinGrace(member, now),
  )
}

export function handleSurrenderVote(
  ctx: RoomContext,
  command: Command<'surrender.vote'>,
): void {
  const actor = findActiveMember(ctx.state, command.actorId)
  if (actor === undefined || actor.kind !== 'human') {
    reject('NOT_ALLOWED', 'You are not in this room.')
  }
  if (ctx.state.phase !== 'round-results') {
    reject('NOT_ALLOWED', 'Surrender votes happen between rounds.')
  }
  if (!surrenderEligible(ctx.state, actor.team)) {
    reject(
      'NOT_ALLOWED',
      'Surrender opens after 3 rounds when your team trails by 100+.',
    )
  }
  if (typeof command.approve !== 'boolean') {
    reject('BAD_COMMAND', 'Vote yes or no.')
  }
  const match = requireMatch(ctx.state)
  const roundNumber = match.round?.number ?? match.completedRounds
  const current = match.surrender
  const previous =
    current !== null &&
    current.team === actor.team &&
    current.roundNumber === roundNumber
      ? current.votes
      : {}
  const votes = { ...previous, [actor.id]: command.approve }
  updateMatch(ctx, (state) => ({
    ...state,
    surrender: { team: actor.team, roundNumber, votes },
  }))

  const electorate = surrenderElectorate(ctx.state, actor.team, ctx.now)
  if (countVotes(votes, electorate) >= twoThirdsNeeded(electorate.length)) {
    endMatch(ctx, 'surrender', actor.team)
  }
}
