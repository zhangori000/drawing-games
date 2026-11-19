import type { PlayableWord } from '@drawing-games/word-bank'

import { SHOWDOWN_POINTS_PER_CARD } from '../scoring'
import type { TeamId } from '../types'
import { otherTeam, TEAM_IDS } from '../types'
import type { RoomContext } from './context'
import { emit, updateMatch } from './context'
import { findMember } from './members'
import type {
  MatchResult,
  MatchSummaryRecord,
  WordHistoryEvent,
  WordHistoryRole,
} from './records'
import { chosenOption } from './selectors'
import type {
  DraftOption,
  MatchState,
  RoomMember,
  RoomState,
  RoundState,
  ShowdownCardResult,
  ShowdownTeamState,
} from './types'
import { lookupWord, roomPool, type WordFacts } from './words'

/** Account word events for one round, keyed by member id (accounts only). */
type WordEventsByMember = Map<string, WordHistoryEvent[]>

interface Outcome {
  readonly solved: boolean | null
  readonly solveMs: number | null
  readonly points: number | null
}

const DRAFT_ONLY: Outcome = { solved: null, solveMs: null, points: null }

function wordEvent(
  state: RoomState,
  facts: WordFacts,
  role: WordHistoryRole,
  outcome: Outcome,
  atMs: number,
): WordHistoryEvent {
  return {
    wordId: facts.wordId,
    term: facts.term,
    packId: facts.packId,
    difficulty: facts.difficulty,
    role,
    solved: outcome.solved,
    solveMs: outcome.solveMs,
    points: outcome.points,
    atMs,
    roomCode: state.roomCode,
  }
}

export function optionFacts(option: DraftOption): WordFacts {
  return {
    wordId: option.wordId,
    term: option.term,
    packId: option.packId,
    difficulty: option.difficulty,
  }
}

function push(
  byMember: WordEventsByMember,
  memberId: string,
  event: WordHistoryEvent,
): void {
  const list = byMember.get(memberId)
  if (list === undefined) byMember.set(memberId, [event])
  else list.push(event)
}

/**
 * Round-end events: the drawer gets `drew` and `offered`, whoever swapped a
 * card gets its report event (the drawer, or a drawer who left mid-draft);
 * each guesser on the roster gets `guessed` or `missed` for their own word.
 */
export function roundWordEvents(
  state: RoomState,
  round: RoundState,
  pool: readonly PlayableWord[],
  atMs: number,
): WordEventsByMember {
  const byMember: WordEventsByMember = new Map()
  for (const team of TEAM_IDS) {
    const teamRound = round.teams[team]
    const chosen = chosenOption(teamRound)
    if (chosen === null) continue
    const solution = teamRound.solution
    const outcome: Outcome = {
      solved: solution !== null,
      solveMs:
        solution !== null && round.drawingStartedAtMs !== null
          ? solution.atMs - round.drawingStartedAtMs
          : null,
      points: solution?.points ?? null,
    }
    const facts = optionFacts(chosen)

    push(
      byMember,
      teamRound.drawerId,
      wordEvent(state, facts, 'drew', outcome, atMs),
    )
    for (const option of teamRound.options) {
      if (option.wordId === chosen.wordId) continue
      push(
        byMember,
        teamRound.drawerId,
        wordEvent(state, optionFacts(option), 'offered', DRAFT_ONLY, atMs),
      )
    }
    for (const replacement of teamRound.replacements) {
      push(
        byMember,
        replacement.actorId,
        wordEvent(
          state,
          lookupWord(pool, replacement.replacedWordId),
          replacement.reason === 'seen-before'
            ? 'seen-report'
            : 'unknown-report',
          DRAFT_ONLY,
          atMs,
        ),
      )
    }
    for (const member of state.members) {
      if (
        member.team !== team ||
        member.left === true ||
        member.id === teamRound.drawerId
      ) {
        continue
      }
      const role = solution?.guesserId === member.id ? 'guessed' : 'missed'
      push(byMember, member.id, wordEvent(state, facts, role, outcome, atMs))
    }
  }
  return byMember
}

/** Showdown: the relay drawer `drew` the card; the solver `guessed` it. */
export function showdownCardEvents(
  state: RoomState,
  card: WordFacts,
  drawerId: string,
  guesserId: string | null,
  outcome: Outcome,
  atMs: number,
): WordEventsByMember {
  const byMember: WordEventsByMember = new Map()
  push(byMember, drawerId, wordEvent(state, card, 'drew', outcome, atMs))
  if (guesserId !== null) {
    push(byMember, guesserId, wordEvent(state, card, 'guessed', outcome, atMs))
  }
  return byMember
}

/** Events for one finished showdown card, as logged in `results`. */
export function showdownResultEvents(
  state: RoomState,
  teamState: ShowdownTeamState,
  result: ShowdownCardResult,
): WordEventsByMember {
  const card = teamState.cards[result.cardIndex]
  if (card === undefined) return new Map()
  const solved = result.guesserId !== null
  return showdownCardEvents(
    state,
    optionFacts(card),
    result.drawerId,
    result.guesserId,
    {
      solved,
      solveMs: result.solveMs,
      points: solved ? SHOWDOWN_POINTS_PER_CARD : null,
    },
    result.atMs,
  )
}

/** One `account.words` effect per account member with events. */
export function emitWordEvents(
  ctx: RoomContext,
  byMember: WordEventsByMember,
): void {
  for (const [memberId, events] of byMember) {
    const member = findMember(ctx.state, memberId)
    if (member === undefined || member.kind !== 'human') continue
    if (member.accountId === null || events.length === 0) continue
    emit(ctx, { type: 'account.words', accountId: member.accountId, events })
  }
}

function resultFor(match: MatchState, team: TeamId): MatchResult {
  if (match.winner === null) return 'tie'
  return match.winner === team ? 'win' : 'loss'
}

/** The member's summary of a match, or null if they did not take part. */
function matchSummaryFor(
  ctx: RoomContext,
  match: MatchState,
  member: RoomMember,
): MatchSummaryRecord | null {
  const stats = match.stats[member.id]
  if (stats === undefined) return null
  return {
    roomCode: ctx.state.roomCode,
    matchNumber: match.number,
    endedAtMs: match.endedAtMs ?? ctx.now,
    team: member.team,
    result: resultFor(match, member.team),
    teamScore: match.scores[member.team],
    opponentScore: match.scores[otherTeam(member.team)],
    endedReason: match.endedReason ?? 'completed',
    withBots: match.withBots,
    roundsPlayed: match.completedRounds,
    stats,
  }
}

/** `account.match` for every account member who took part in the match. */
export function emitMatchSummaries(ctx: RoomContext, match: MatchState): void {
  for (const member of ctx.state.members) {
    if (member.kind !== 'human' || member.accountId === null) continue
    const summary = matchSummaryFor(ctx, match, member)
    if (summary === null) continue
    emit(ctx, { type: 'account.match', accountId: member.accountId, summary })
  }
}

/**
 * The word events `member` earned in the match so far, re-derived from
 * state exactly as they were (or would have been) emitted: every finished
 * round they were in the room for, then every finished showdown card.
 */
function memberMatchEvents(
  state: RoomState,
  match: MatchState,
  member: RoomMember,
): WordHistoryEvent[] {
  const pool = roomPool(state.settings)
  const events: WordHistoryEvent[] = []
  for (const round of match.history) {
    const endedAtMs = round.endedAtMs
    if (endedAtMs === null || member.joinedAtMs > endedAtMs) continue
    const byMember = roundWordEvents(state, round, pool, endedAtMs)
    events.push(...(byMember.get(member.id) ?? []))
  }
  const showdown = match.showdown
  if (showdown !== null) {
    const cardEvents: WordHistoryEvent[] = []
    for (const team of TEAM_IDS) {
      const teamState = showdown.teams[team]
      for (const result of teamState.results ?? []) {
        const byMember = showdownResultEvents(state, teamState, result)
        cardEvents.push(...(byMember.get(member.id) ?? []))
      }
    }
    events.push(...cardEvents.sort((left, right) => left.atMs - right.atMs))
  }
  return events
}

function isCredited(match: MatchState, memberId: string): boolean {
  return match.creditedMemberIds?.includes(memberId) ?? false
}

/** Records that this member's play in the current match reaches an account. */
export function markMatchCredited(ctx: RoomContext, memberId: string): void {
  const match = ctx.state.match
  if (match === null || isCredited(match, memberId)) return
  updateMatch(ctx, (current) => ({
    ...current,
    creditedMemberIds: [...(current.creditedMemberIds ?? []), memberId],
  }))
}

/** Account members at the start of a match are credited as it is played. */
export function initialCreditedMemberIds(
  members: readonly RoomMember[],
): string[] {
  return members
    .filter((member) => member.kind === 'human' && member.accountId !== null)
    .map((member) => member.id)
}

/**
 * A member just linked an account. If none of their play in the current (or
 * just-finished, during `stats`) match has reached an account yet, credit it
 * now, once: the word events of every round and showdown card so far and, if
 * the match is over, its summary. Later rounds reach the account as usual.
 * Linking again, or another account later, never re-credits the match.
 */
export function creditLinkedMember(ctx: RoomContext, memberId: string): void {
  const match = ctx.state.match
  if (match === null || ctx.state.phase === 'lobby') return
  const member = findMember(ctx.state, memberId)
  if (member === undefined || member.kind !== 'human') return
  const accountId = member.accountId
  if (accountId === null || isCredited(match, memberId)) return
  markMatchCredited(ctx, memberId)

  const events = memberMatchEvents(ctx.state, match, member)
  if (events.length > 0) emit(ctx, { type: 'account.words', accountId, events })
  if (match.endedAtMs === null) return
  const summary = matchSummaryFor(ctx, match, member)
  if (summary !== null) emit(ctx, { type: 'account.match', accountId, summary })
}
