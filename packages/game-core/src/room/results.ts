import { TEAM_IDS } from '../types'
import { SURRENDER_VOTE_WINDOW_MS } from './constants'
import type { RoomContext } from './context'
import { patchState, reject, updateMatch } from './context'
import { endMatch } from './match'
import { findActiveMember } from './members'
import { startRound } from './round-start'
import { TEAM_NAMES } from './settings'
import { startShowdown } from './showdown'
import type { RoomCommand, RoomState, SurrenderVoteState } from './types'
import {
  continueHeldBy,
  currentSurrenderVote,
  resultsDeadlineAtMs,
  surrenderEligible,
  surrenderRoundNumber,
  surrenderVotePasses,
} from './votes'

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
  const heldBy = continueHeldBy(ctx.state, ctx.now)
  if (heldBy !== null) {
    reject(
      'NOT_ALLOWED',
      `${TEAM_NAMES[heldBy]} can still vote to surrender. Results continue when the clock runs out.`,
    )
  }
  continueAfterResults(ctx)
}

/* ------------------------------------------------------------------------ */
/* Surrender                                                                */
/* ------------------------------------------------------------------------ */

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
  const roundNumber = surrenderRoundNumber(ctx.state)
  const current = currentSurrenderVote(ctx.state, actor.team)
  const votes = { ...current?.votes, [actor.id]: command.approve }
  // The first yes vote leaves teammates a fair window to answer, once.
  const windowEndsAtMs =
    current?.windowEndsAtMs ??
    (command.approve ? ctx.now + SURRENDER_VOTE_WINDOW_MS : undefined)
  const surrender: SurrenderVoteState =
    windowEndsAtMs === undefined
      ? { team: actor.team, roundNumber, votes }
      : { team: actor.team, roundNumber, votes, windowEndsAtMs }
  updateMatch(ctx, (state) => ({ ...state, surrender }))
  const deadline = ctx.state.phaseDeadlineAtMs
  if (deadline !== null) {
    patchState(ctx, {
      phaseDeadlineAtMs: resultsDeadlineAtMs(deadline, surrender),
    })
  }
  // Votes that pass later, once the electorate shrinks (a teammate leaves
  // or drops past grace), end the match as due work (see `votes.ts`).
  if (surrenderVotePasses(ctx.state, actor.team, votes, ctx.now)) {
    endMatch(ctx, 'surrender', actor.team)
  }
}
