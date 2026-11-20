import type { PlayableWord } from '@drawing-games/word-bank'

import { SHOWDOWN_POINTS_PER_CARD } from '../scoring'
import type { TeamId } from '../types'
import { otherTeam, TEAM_IDS } from '../types'
import type { RoomContext } from './context'
import { emit, updateMatch } from './context'
import { findMember } from './members'
import { addMemberMatchStats } from './records'
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
 * Nobody is credited with play they were not there for: a drawer who was
 * away for the whole drawing (`round.absentIds`, e.g. a deadline pick after
 * their phone locked) gets no `drew`/`offered`, a guesser who was away gets
 * no `missed`, and an earlier drawer of a turn someone took over (who saw
 * the cards but could not guess) gets `offered` for every card instead.
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
    const absent = new Set(round.absentIds ?? [])
    const former = new Set(teamRound.formerDrawerIds ?? [])

    if (!absent.has(teamRound.drawerId)) {
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
    }
    for (const formerId of former) {
      if (formerId === teamRound.drawerId) continue
      if (findMember(state, formerId)?.left === true) continue
      for (const option of teamRound.options) {
        push(
          byMember,
          formerId,
          wordEvent(state, optionFacts(option), 'offered', DRAFT_ONLY, atMs),
        )
      }
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
        member.id === teamRound.drawerId ||
        former.has(member.id) ||
        absent.has(member.id)
      ) {
        continue
      }
      const role = solution?.guesserId === member.id ? 'guessed' : 'missed'
      push(byMember, member.id, wordEvent(state, facts, role, outcome, atMs))
    }
  }
  return byMember
}

/**
 * Showdown: the relay drawer `drew` the card (unless they were away for all
 * of it, `drawerId` null); the solver `guessed` it. Both are tagged
 * `showdown` so history can tell a relay card from the round it came from.
 */
export function showdownCardEvents(
  state: RoomState,
  card: WordFacts,
  drawerId: string | null,
  guesserId: string | null,
  outcome: Outcome,
  atMs: number,
): WordEventsByMember {
  const byMember: WordEventsByMember = new Map()
  const event = (role: WordHistoryRole): WordHistoryEvent => ({
    ...wordEvent(state, card, role, outcome, atMs),
    showdown: true,
  })
  if (drawerId !== null) push(byMember, drawerId, event('drew'))
  if (guesserId !== null) push(byMember, guesserId, event('guessed'))
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
    result.drawerAbsent === true ? null : result.drawerId,
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

/**
 * Whether the member played any of the match: was there for a finished
 * round (not away for its whole drawing), or drew or guessed in it.
 */
function tookPart(match: MatchState, member: RoomMember): boolean {
  const stats = match.stats[member.id]
  if (stats === undefined) return false
  if (stats.guessesSubmitted > 0) return true
  const presentForRound = match.history.some(
    (round) =>
      round.endedAtMs !== null &&
      member.joinedAtMs <= round.endedAtMs &&
      !(round.absentIds ?? []).includes(member.id),
  )
  if (presentForRound) return true
  const showdown = match.showdown
  if (showdown === null) return false
  return TEAM_IDS.some((team) =>
    (showdown.teams[team].results ?? []).some(
      (result) =>
        (result.drawerId === member.id && result.drawerAbsent !== true) ||
        result.guesserId === member.id,
    ),
  )
}

/** The member's summary of a match, or null if they did not take part. */
function matchSummaryFor(
  ctx: RoomContext,
  match: MatchState,
  member: RoomMember,
): MatchSummaryRecord | null {
  const stats = match.stats[member.id]
  if (stats === undefined || !tookPart(match, member)) return null
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

/**
 * One `account.match` per account that took part in the match. A player who
 * left and rejoined has several seats on one account: their stats are added
 * up, and the seat they joined last (the one they finished on) gives the
 * team and result. Accounts record one summary per room match, so separate
 * summaries would keep only the first seat's play.
 */
export function emitMatchSummaries(ctx: RoomContext, match: MatchState): void {
  const seatsByAccount = new Map<string, RoomMember[]>()
  for (const member of ctx.state.members) {
    if (member.kind !== 'human' || member.accountId === null) continue
    const seats = seatsByAccount.get(member.accountId)
    if (seats === undefined) seatsByAccount.set(member.accountId, [member])
    else seats.push(member)
  }
  for (const [accountId, seats] of seatsByAccount) {
    // Members are in join order, so the last summary is the latest seat's.
    const summaries = seats.flatMap((seat) => {
      const summary = matchSummaryFor(ctx, match, seat)
      return summary === null ? [] : [summary]
    })
    const latest = summaries.at(-1)
    if (latest === undefined) continue
    const stats = summaries
      .map((summary) => summary.stats)
      .reduce(addMemberMatchStats)
    emit(ctx, {
      type: 'account.match',
      accountId,
      summary: { ...latest, stats },
    })
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
