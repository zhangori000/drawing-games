import type { TeamId } from '../types'
import type { MemberMatchStats } from './records'
import { EMPTY_MEMBER_MATCH_STATS } from './records'
import { Rng } from './rng'
import type {
  MatchState,
  RoomEffect,
  RoomErrorCode,
  RoomMember,
  RoomState,
  RoundState,
  ShowdownState,
  ShowdownTeamState,
  TeamRoundState,
} from './types'

/**
 * Working context for one reducer call. `state` is replaced (never mutated)
 * by each update; randomness accumulates in `rng` and is written back to
 * `rngState` by `finishContext`. `now` is the server time of the event being
 * processed, which may be earlier than the caller's `nowMs` while catching up.
 */
export interface RoomContext {
  state: RoomState
  now: number
  readonly rng: Rng
  readonly effects: RoomEffect[]
}

export function createContext(state: RoomState, now: number): RoomContext {
  return { state, now, rng: new Rng(state.rngState), effects: [] }
}

export function finishContext(ctx: RoomContext): RoomState {
  return ctx.rng.state === ctx.state.rngState
    ? ctx.state
    : { ...ctx.state, rngState: ctx.rng.state }
}

/** A player mistake. Caught at the engine boundary and returned as an error. */
export class RoomRejection extends Error {
  readonly code: RoomErrorCode

  constructor(code: RoomErrorCode, message: string) {
    super(message)
    this.name = 'RoomRejection'
    this.code = code
  }
}

export function reject(code: RoomErrorCode, message: string): never {
  throw new RoomRejection(code, message)
}

export function emit(ctx: RoomContext, effect: RoomEffect): void {
  ctx.effects.push(effect)
}

export function patchState(ctx: RoomContext, patch: Partial<RoomState>): void {
  ctx.state = { ...ctx.state, ...patch }
}

export function requireMatch(state: RoomState): MatchState {
  if (state.match === null) throw new Error('Room has no match')
  return state.match
}

export function requireRound(state: RoomState): RoundState {
  const round = requireMatch(state).round
  if (round === null) throw new Error('Match has no round')
  return round
}

export function requireShowdown(state: RoomState): ShowdownState {
  const showdown = requireMatch(state).showdown
  if (showdown === null) throw new Error('Match has no showdown')
  return showdown
}

export function updateMatch(
  ctx: RoomContext,
  update: (match: MatchState) => MatchState,
): void {
  patchState(ctx, { match: update(requireMatch(ctx.state)) })
}

export function updateRound(
  ctx: RoomContext,
  update: (round: RoundState) => RoundState,
): void {
  const round = requireRound(ctx.state)
  updateMatch(ctx, (match) => ({ ...match, round: update(round) }))
}

export function updateTeamRound(
  ctx: RoomContext,
  team: TeamId,
  update: (teamRound: TeamRoundState) => TeamRoundState,
): void {
  updateRound(ctx, (round) => ({
    ...round,
    teams: { ...round.teams, [team]: update(round.teams[team]) },
  }))
}

export function updateShowdown(
  ctx: RoomContext,
  update: (showdown: ShowdownState) => ShowdownState,
): void {
  const showdown = requireShowdown(ctx.state)
  updateMatch(ctx, (match) => ({ ...match, showdown: update(showdown) }))
}

export function updateShowdownTeam(
  ctx: RoomContext,
  team: TeamId,
  update: (teamState: ShowdownTeamState) => ShowdownTeamState,
): void {
  updateShowdown(ctx, (showdown) => ({
    ...showdown,
    teams: { ...showdown.teams, [team]: update(showdown.teams[team]) },
  }))
}

export function updateMember(
  ctx: RoomContext,
  memberId: string,
  update: (member: RoomMember) => RoomMember,
): void {
  patchState(ctx, {
    members: ctx.state.members.map((member) =>
      member.id === memberId ? update(member) : member,
    ),
  })
}

export function updateStats(
  ctx: RoomContext,
  memberId: string,
  update: (stats: MemberMatchStats) => MemberMatchStats,
): void {
  updateMatch(ctx, (match) => ({
    ...match,
    stats: {
      ...match.stats,
      [memberId]: update(match.stats[memberId] ?? EMPTY_MEMBER_MATCH_STATS),
    },
  }))
}
