import type { PlayableWord } from '@drawing-games/word-bank'

import type { TeamId } from '../types'
import { otherTeam, TEAM_IDS } from '../types'
import type { RoomContext } from './context'
import { emit } from './context'
import { findMember } from './members'
import type {
  MatchResult,
  MatchSummaryRecord,
  WordHistoryEvent,
  WordHistoryRole,
} from './records'
import { chosenOption } from './selectors'
import type { DraftOption, MatchState, RoomState, RoundState } from './types'
import { lookupWord, type WordFacts } from './words'

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
 * Round-end events: the drawer gets `drew`, `offered`, and report events;
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
        teamRound.drawerId,
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

/** `account.match` for every account member who took part in the match. */
export function emitMatchSummaries(ctx: RoomContext, match: MatchState): void {
  for (const member of ctx.state.members) {
    if (member.kind !== 'human' || member.accountId === null) continue
    const stats = match.stats[member.id]
    if (stats === undefined) continue
    const summary: MatchSummaryRecord = {
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
    emit(ctx, { type: 'account.match', accountId: member.accountId, summary })
  }
}
