import type { TeamId } from '../types'
import { otherTeam, TEAM_IDS } from '../types'
import { emitMatchSummaries } from './account-effects'
import { clearBots } from './bots'
import type { RoomContext } from './context'
import { patchState, reject, requireMatch, updateMatch } from './context'
import { activeMembers, chooseHost, teamRoster } from './members'
import type { MemberMatchStats } from './records'
import { EMPTY_MEMBER_MATCH_STATS } from './records'
import { startRound } from './round-start'
import { MAX_MEMBERS_PER_TEAM, MIN_MEMBERS_PER_TEAM } from './settings'
import type { MatchState, RoomCommand } from './types'

type Command<T extends RoomCommand['type']> = Extract<RoomCommand, { type: T }>

/** Drops members who left mid-match and re-homes the host if needed. */
function pruneLeftMembers(ctx: RoomContext): void {
  if (!ctx.state.members.some((member) => member.left === true)) return
  patchState(ctx, {
    members: ctx.state.members.filter((member) => member.left !== true),
  })
  const host = ctx.state.hostId
  if (
    host === null ||
    !ctx.state.members.some((member) => member.id === host)
  ) {
    patchState(ctx, { hostId: chooseHost(ctx.state) })
  }
}

function teamsAreValid(ctx: RoomContext): boolean {
  return TEAM_IDS.every((team) => {
    const size = teamRoster(ctx.state, team).length
    return size >= MIN_MEMBERS_PER_TEAM && size <= MAX_MEMBERS_PER_TEAM
  })
}

/** A fresh match: scores, rotation, and stats reset; room memory survives. */
export function startMatch(ctx: RoomContext): void {
  pruneLeftMembers(ctx)
  clearBots(ctx)
  const members = activeMembers(ctx.state)
  const stats: Record<string, MemberMatchStats> = {}
  for (const member of members) stats[member.id] = EMPTY_MEMBER_MATCH_STATS
  const match: MatchState = {
    number: (ctx.state.match?.number ?? 0) + 1,
    startedAtMs: ctx.now,
    scores: { A: 0, B: 0 },
    completedRounds: 0,
    winStreak: null,
    drawerTurns: { A: 0, B: 0 },
    round: null,
    history: [],
    showdown: null,
    showdownPoints: { A: 0, B: 0 },
    surrender: null,
    largestLead: { A: 0, B: 0 },
    endedAtMs: null,
    endedReason: null,
    winner: null,
    stats,
    withBots: members.some((member) => member.kind === 'bot'),
    guessLimits: {},
  }
  patchState(ctx, { match })
  startRound(ctx)
}

/**
 * Ends the match. A surrender records the opponent as winner without extra
 * points; otherwise the higher total wins (tie → null).
 */
export function endMatch(
  ctx: RoomContext,
  reason: 'completed' | 'surrender',
  surrenderingTeam: TeamId | null,
): void {
  const { scores } = requireMatch(ctx.state)
  const winner: TeamId | null =
    reason === 'surrender' && surrenderingTeam !== null
      ? otherTeam(surrenderingTeam)
      : scores.A === scores.B
        ? null
        : scores.A > scores.B
          ? 'A'
          : 'B'
  updateMatch(ctx, (match) => ({
    ...match,
    endedAtMs: ctx.now,
    endedReason: reason,
    winner,
    surrender: null,
    guessLimits: {},
  }))
  clearBots(ctx)
  patchState(ctx, {
    phase: 'stats',
    phaseStartedAtMs: ctx.now,
    phaseDeadlineAtMs: null,
  })
  emitMatchSummaries(ctx, requireMatch(ctx.state))
}

/**
 * Back to the lobby: left members are removed and every human must ready up
 * again. The finished match stays in state only for match numbering.
 */
export function enterLobby(ctx: RoomContext): void {
  pruneLeftMembers(ctx)
  clearBots(ctx)
  patchState(ctx, {
    phase: 'lobby',
    phaseStartedAtMs: ctx.now,
    phaseDeadlineAtMs: null,
    members: ctx.state.members.map((member) =>
      member.kind === 'human' && member.ready
        ? { ...member, ready: false }
        : member,
    ),
  })
}

export function handleRematch(
  ctx: RoomContext,
  command: Command<'match.rematch'>,
): void {
  if (ctx.state.phase !== 'stats') {
    reject('NOT_ALLOWED', 'A rematch starts after the final scores.')
  }
  if (ctx.state.hostId !== command.actorId) {
    reject('NOT_ALLOWED', 'Only the host can start a rematch.')
  }
  if (command.mode !== 'same-settings' && command.mode !== 'change-settings') {
    reject('BAD_COMMAND', 'Pick a rematch option.')
  }
  pruneLeftMembers(ctx)
  if (command.mode === 'same-settings' && teamsAreValid(ctx)) {
    startMatch(ctx)
    return
  }
  enterLobby(ctx)
}
