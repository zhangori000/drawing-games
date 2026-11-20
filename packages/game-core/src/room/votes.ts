import { getSurrenderEligibility } from '../state-machine'
import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { RECONNECT_GRACE_MS, SURRENDER_RULES } from './constants'
import type { RoomContext } from './context'
import { updateTeamRound } from './context'
import { planBotOutlineOnReveal } from './bots'
import { endMatch } from './match'
import { isWithinGrace, teamRoster } from './members'
import {
  countVotes,
  majorityNeeded,
  sitOutIds,
  teamElectorate,
  twoThirdsNeeded,
} from './selectors'
import { effectiveWordLengthMode } from './settings'
import type {
  RoomMember,
  RoomState,
  SurrenderVoteState,
  TeamRoundState,
} from './types'

/*
 * Team votes (the length hint and surrender) pass the moment the yes votes
 * already cast reach the threshold of the *current* electorate. Casting a
 * vote checks it right away; the electorate can also shrink with nobody
 * voting (a teammate leaves, a drawer turn is handed over, or a disconnected
 * teammate's reconnect grace runs out). `nextVoteResolution` finds the
 * earliest such moment from state alone, so `advanceRoom` applies it as due
 * work at exactly that time and `getNextWakeAtMs` wakes the room for it.
 */

type Votes = Readonly<Record<string, boolean>>

/* ------------------------------------------------------------------------ */
/* Length hint                                                              */
/* ------------------------------------------------------------------------ */

/** When a team's hint vote opens (null before drawing starts). */
export function hintUnlocksAtMs(state: RoomState): number | null {
  const startedAt = state.match?.round?.drawingStartedAtMs ?? null
  return startedAt === null
    ? null
    : startedAt + state.settings.hintUnlockSeconds * 1000
}

/**
 * Human guessers within grace, minus the drawer and everyone sitting the
 * turn out (earlier drawers and late joiners).
 */
export function hintElectorate(
  state: RoomState,
  teamRound: TeamRoundState,
  now: number,
): RoomMember[] {
  return teamElectorate(
    state,
    teamRound.team,
    teamRound.drawerId,
    now,
    sitOutIds(teamRound),
  )
}

/** More than half of the hint electorate approves `votes`. */
export function hintVotePasses(
  state: RoomState,
  teamRound: TeamRoundState,
  votes: Votes,
  now: number,
): boolean {
  const electorate = hintElectorate(state, teamRound, now)
  return countVotes(votes, electorate) >= majorityNeeded(electorate.length)
}

/** The team's round while a hint vote could still pass, else null. */
function openHintRound(state: RoomState, team: TeamId): TeamRoundState | null {
  if (state.phase !== 'drawing') return null
  if (effectiveWordLengthMode(state.settings) !== 'hidden-vote') return null
  const teamRound = state.match?.round?.teams[team]
  if (teamRound === undefined) return null
  if (teamRound.solution !== null || teamRound.hint.revealed) return null
  return teamRound
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

/** The round a surrender vote cast now belongs to. */
export function surrenderRoundNumber(state: RoomState): number {
  const match = state.match
  return match?.round?.number ?? match?.completedRounds ?? 0
}

/** `team`'s surrender vote for the current results phase, if any. */
export function currentSurrenderVote(
  state: RoomState,
  team: TeamId,
): SurrenderVoteState | null {
  const vote = state.match?.surrender ?? null
  return vote !== null &&
    vote.team === team &&
    vote.roundNumber === surrenderRoundNumber(state)
    ? vote
    : null
}

/** `team`'s surrender votes for the current results phase ({} if none). */
export function currentSurrenderVotes(state: RoomState, team: TeamId): Votes {
  return currentSurrenderVote(state, team)?.votes ?? {}
}

/**
 * `team`'s surrender vote is still open: the team may surrender, some voter
 * in its electorate has not voted yet, and enough of them could still say
 * yes for it to pass. Skipping the results waits while this holds.
 */
export function surrenderVoteOpen(
  state: RoomState,
  team: TeamId,
  now: number,
): boolean {
  if (state.phase !== 'round-results') return false
  if (!surrenderEligible(state, team)) return false
  const electorate = surrenderElectorate(state, team, now)
  if (electorate.length === 0) return false
  const votes = currentSurrenderVotes(state, team)
  const undecided = electorate.filter(
    (member) => votes[member.id] === undefined,
  ).length
  return (
    undecided > 0 &&
    countVotes(votes, electorate) + undecided >=
      twoThirdsNeeded(electorate.length)
  )
}

/** The team whose open surrender vote holds `round.continue`, if any. */
export function continueHeldBy(state: RoomState, now: number): TeamId | null {
  return TEAM_IDS.find((team) => surrenderVoteOpen(state, team, now)) ?? null
}

/**
 * The results deadline with `team`'s surrender window applied: the first
 * yes vote leaves at least `SURRENDER_VOTE_WINDOW_MS` on the clock.
 */
export function resultsDeadlineAtMs(
  baseDeadlineAtMs: number,
  vote: SurrenderVoteState | null,
): number {
  const windowEndsAt = vote?.windowEndsAtMs
  return windowEndsAt === undefined
    ? baseDeadlineAtMs
    : Math.max(baseDeadlineAtMs, windowEndsAt)
}

/** Two thirds (rounded up) of the surrender electorate approves `votes`. */
export function surrenderVotePasses(
  state: RoomState,
  team: TeamId,
  votes: Votes,
  now: number,
): boolean {
  const electorate = surrenderElectorate(state, team, now)
  return countVotes(votes, electorate) >= twoThirdsNeeded(electorate.length)
}

/* ------------------------------------------------------------------------ */
/* Resolution as due work                                                   */
/* ------------------------------------------------------------------------ */

export interface VoteResolution {
  readonly vote: 'hint' | 'surrender'
  readonly team: TeamId
  /** When the votes already cast first meet the threshold. */
  readonly atMs: number
}

/** Nothing passes before the room's latest change (see `RoomState`). */
function settledAtMs(state: RoomState): number {
  return state.changedAtMs ?? state.lastActivityAtMs
}

function hasYesVote(votes: Votes): boolean {
  return Object.values(votes).some((approve) => approve)
}

/**
 * The earliest time at or after `fromMs` at which `passesAt` holds, checking
 * `fromMs` and every moment after it when a disconnected teammate's grace
 * runs out (grace is inclusive, so they drop out 1 ms after it ends).
 * Without a state change the electorate only shrinks at those moments.
 */
function earliestPass(
  state: RoomState,
  team: TeamId,
  fromMs: number,
  passesAt: (nowMs: number) => boolean,
): number | null {
  const expiries = teamRoster(state, team)
    .filter((member) => member.kind === 'human' && !member.connected)
    .map((member) => member.lastSeenAtMs + RECONNECT_GRACE_MS + 1)
    .filter((atMs) => atMs > fromMs)
    .sort((a, b) => a - b)
  for (const atMs of [fromMs, ...expiries]) {
    if (passesAt(atMs)) return atMs
  }
  return null
}

function hintResolution(state: RoomState, team: TeamId): VoteResolution | null {
  const teamRound = openHintRound(state, team)
  const unlocksAt = hintUnlocksAtMs(state)
  if (teamRound === null || unlocksAt === null) return null
  const votes = teamRound.hint.votes
  if (!hasYesVote(votes)) return null
  const fromMs = Math.max(unlocksAt, settledAtMs(state))
  const atMs = earliestPass(state, team, fromMs, (nowMs) =>
    hintVotePasses(state, teamRound, votes, nowMs),
  )
  return atMs === null ? null : { vote: 'hint', team, atMs }
}

function surrenderResolution(
  state: RoomState,
  team: TeamId,
): VoteResolution | null {
  if (state.phase !== 'round-results') return null
  if (!surrenderEligible(state, team)) return null
  const votes = currentSurrenderVotes(state, team)
  if (!hasYesVote(votes)) return null
  const fromMs = Math.max(state.phaseStartedAtMs, settledAtMs(state))
  const atMs = earliestPass(state, team, fromMs, (nowMs) =>
    surrenderVotePasses(state, team, votes, nowMs),
  )
  return atMs === null ? null : { vote: 'surrender', team, atMs }
}

/**
 * The earliest pending vote that already has enough yes votes for the
 * electorate at some moment (now, or once a disconnected teammate's grace
 * runs out). Pure, so `nextWakeAtMs` and `runDueWork` agree on it. Ties go
 * team A first.
 */
export function nextVoteResolution(state: RoomState): VoteResolution | null {
  let best: VoteResolution | null = null
  for (const team of TEAM_IDS) {
    for (const candidate of [
      hintResolution(state, team),
      surrenderResolution(state, team),
    ]) {
      if (candidate !== null && (best === null || candidate.atMs < best.atMs)) {
        best = candidate
      }
    }
  }
  return best
}

/** Reveals the team's length pattern (the vote passed at `ctx.now`). */
export function revealHint(ctx: RoomContext, team: TeamId): void {
  updateTeamRound(ctx, team, (current) => ({
    ...current,
    hint: { ...current.hint, revealed: true, revealedAtMs: ctx.now },
  }))
  // A practice bot drawing for the team now draws the blanks it paid for.
  planBotOutlineOnReveal(ctx, team)
}

/** Applies a due resolution: reveal the hint, or end the match. */
export function runVoteResolution(
  ctx: RoomContext,
  resolution: VoteResolution,
): void {
  if (resolution.vote === 'hint') revealHint(ctx, resolution.team)
  else endMatch(ctx, 'surrender', resolution.team)
}
