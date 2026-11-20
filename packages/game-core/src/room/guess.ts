import { matchGuess } from '@drawing-games/word-bank'

import { getGuessScoreBreakdown, type GuessScoreBreakdown } from '../scoring'
import type { TeamId } from '../types'
import { TEAM_IDS } from '../types'
import { dropBotCanvas } from './bots'
import {
  GUESS_FEED_LIMIT,
  GUESS_MAX_LENGTH,
  GUESS_MIN_INTERVAL_MS,
  MAX_GUESSES_PER_ROUND,
} from './constants'
import type { RoomContext } from './context'
import {
  emit,
  reject,
  requireRound,
  updateMatch,
  updateShowdownTeam,
  updateStats,
  updateTeamRound,
} from './context'
import { endRound } from './drawing'
import { findActiveMember } from './members'
import { activeCanvas, requireChosen, type ActiveCanvas } from './selectors'
import { clearShowdownCard } from './showdown'
import { cleanText, codePointLength } from './text'
import { roomPool } from './words'
import type {
  GuessRecord,
  GuessVerdict,
  RoomCommand,
  RoomError,
  RoomState,
} from './types'

type Command<T extends RoomCommand['type']> = Extract<RoomCommand, { type: T }>

export interface GuessTarget {
  readonly canvas: ActiveCanvas
  readonly text: string
}

export type GuessCheck =
  | { readonly ok: true; readonly target: GuessTarget }
  | {
      readonly ok: false
      readonly error: RoomError
      /** Only the 400 ms spacing failed; bots retry shortly. */
      readonly rateLimited: boolean
    }

/**
 * Whether `memberId` may guess `rawText` right now. Pure, so human commands
 * and practice bots share exactly the same rules.
 */
export function checkGuess(
  state: RoomState,
  memberId: string,
  rawText: unknown,
  now: number,
): GuessCheck {
  const fail = (
    message: string,
    code: RoomError['code'] = 'NOT_ALLOWED',
    rateLimited = false,
  ): GuessCheck => ({ ok: false, error: { code, message }, rateLimited })
  const member = findActiveMember(state, memberId)
  if (member === undefined) return fail('You are not in this room.')
  if (state.phase === 'round-results' || state.phase === 'stats') {
    return fail("Time's up for this round.")
  }
  if (state.phase !== 'drawing' && state.phase !== 'showdown') {
    return fail('Guessing opens once drawing starts.')
  }
  const canvas = activeCanvas(state, member.team)
  if (canvas === null) {
    return fail(
      state.phase === 'showdown'
        ? 'Your team has cleared every card.'
        : 'Your team already solved it.',
    )
  }
  if (canvas.drawerId === member.id) return fail("The drawer can't guess.")
  if (canvas.formerDrawerIds.includes(member.id)) {
    return fail('You saw this word as the drawer, so sit this one out.')
  }
  if (canvas.lateJoinerIds.includes(member.id)) {
    return fail('You joined during this turn, so guess from the next one.')
  }

  const text = typeof rawText === 'string' ? cleanText(rawText) : ''
  const length = codePointLength(text)
  if (length < 1 || length > GUESS_MAX_LENGTH) {
    return fail(`Guesses are 1–${GUESS_MAX_LENGTH} characters.`, 'BAD_COMMAND')
  }

  const limit = state.match?.guessLimits?.[member.id]
  if (limit !== undefined && limit.scope === canvas.canvasId) {
    if (limit.count >= MAX_GUESSES_PER_ROUND) {
      return fail("You're out of guesses for this round.")
    }
    if (now - limit.lastAtMs < GUESS_MIN_INTERVAL_MS) {
      return fail('Slow down a little.', 'NOT_ALLOWED', true)
    }
  }
  return { ok: true, target: { canvas, text } }
}

/** Scores a normal-round solve; the room's hint cost replaces the default. */
function scoreSolve(
  state: RoomState,
  team: TeamId,
  atMs: number,
): GuessScoreBreakdown {
  const round = requireRound(state)
  const teamRound = round.teams[team]
  const settings = state.settings
  const deadline = round.drawingDeadlineAtMs ?? atMs
  // The shared helper's fixed hint cost is replaced by the room setting.
  const base = getGuessScoreBreakdown({
    secondsRemaining: (deadline - atMs) / 1000,
    roundSeconds: settings.drawingSeconds,
    difficulty: requireChosen(teamRound).difficulty,
    usedWordLengthHint: false,
  })
  const hintCost = teamRound.hint.revealed ? settings.hintCost : 0
  return {
    ...base,
    hintCost,
    total: Math.max(0, base.speedScore + base.difficultyBonus - hintCost),
  }
}

function recordGuess(
  ctx: RoomContext,
  target: GuessTarget,
  memberId: string,
  verdict: GuessVerdict,
): void {
  const { canvas } = target
  const previous = ctx.state.match?.guessLimits?.[memberId]
  const count =
    (previous !== undefined && previous.scope === canvas.canvasId
      ? previous.count
      : 0) + 1
  updateMatch(ctx, (match) => ({
    ...match,
    guessLimits: {
      ...match.guessLimits,
      [memberId]: { scope: canvas.canvasId, count, lastAtMs: ctx.now },
    },
  }))
  const guess: GuessRecord = {
    id: `${canvas.canvasId}-${memberId}-${count}`,
    memberId,
    text: target.text,
    verdict,
    atMs: ctx.now,
  }
  const appendGuess = <T extends { readonly guesses: readonly GuessRecord[] }>(
    feed: T,
  ): T => ({
    ...feed,
    guesses: [...feed.guesses, guess].slice(-GUESS_FEED_LIMIT),
  })
  if (ctx.state.phase === 'showdown') {
    updateShowdownTeam(ctx, canvas.team, appendGuess)
  } else {
    updateTeamRound(ctx, canvas.team, appendGuess)
  }
}

function solveRound(ctx: RoomContext, team: TeamId, guesserId: string): void {
  const breakdown = scoreSolve(ctx.state, team, ctx.now)
  const round = requireRound(ctx.state)
  const teamRound = round.teams[team]
  updateTeamRound(ctx, team, (current) => ({
    ...current,
    solution: {
      guesserId,
      atMs: ctx.now,
      points: breakdown.total,
      breakdown,
    },
  }))
  const word = requireChosen(teamRound)
  const elapsed = ctx.now - (round.drawingStartedAtMs ?? ctx.now)
  updateStats(ctx, guesserId, (stats) => ({
    ...stats,
    correctGuesses: stats.correctGuesses + 1,
    timeToCorrectMsTotal: stats.timeToCorrectMsTotal + elapsed,
    fastestCorrectMs:
      stats.fastestCorrectMs === null
        ? elapsed
        : Math.min(stats.fastestCorrectMs, elapsed),
    hardWordsSolved:
      stats.hardWordsSolved + (word.difficulty === 'hard' ? 1 : 0),
    pointsWon: stats.pointsWon + breakdown.total,
  }))
  dropBotCanvas(ctx, teamRound.canvasId)
  const after = requireRound(ctx.state)
  if (TEAM_IDS.every((id) => after.teams[id].solution !== null)) endRound(ctx)
}

/** Records a validated guess at `ctx.now` and applies its consequences. */
export function applyGuess(
  ctx: RoomContext,
  memberId: string,
  target: GuessTarget,
): GuessVerdict {
  const { canvas, text } = target
  // The room pool lets the matcher refuse a verb form that is another word
  // in play (`wave` while `waving` is a card), not just another curated word.
  const verdict = matchGuess(text, {
    term: canvas.term,
    aliases: canvas.aliases,
    otherWords: roomPool(ctx.state.settings),
  })
  recordGuess(ctx, target, memberId, verdict)

  const member = findActiveMember(ctx.state, memberId)
  if (member?.kind === 'human') {
    emit(ctx, { type: 'guess.feedback', memberId, text, verdict })
  }
  const isShowdown = ctx.state.phase === 'showdown'
  if (!isShowdown) {
    updateStats(ctx, memberId, (stats) => ({
      ...stats,
      guessesSubmitted: stats.guessesSubmitted + 1,
      closeGuesses: stats.closeGuesses + (verdict === 'close' ? 1 : 0),
    }))
  }
  if (verdict === 'correct') {
    if (isShowdown) clearShowdownCard(ctx, canvas.team, memberId)
    else solveRound(ctx, canvas.team, memberId)
  }
  return verdict
}

export function handleGuess(
  ctx: RoomContext,
  command: Command<'guess.submit'>,
): void {
  const check = checkGuess(ctx.state, command.actorId, command.text, ctx.now)
  if (!check.ok) reject(check.error.code, check.error.message)
  applyGuess(ctx, command.actorId, check.target)
}
