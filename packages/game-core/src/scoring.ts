import type { TeamId, TeamScores, WinStreak, WordDifficulty } from './types'
import { otherTeam } from './types'

export const DIFFICULTY_BONUSES: Readonly<Record<WordDifficulty, number>> =
  Object.freeze({
    easy: 0,
    medium: 20,
    hard: 40,
  })

export const WORD_LENGTH_HINT_COST = 10
export const MAX_SHUTDOWN_BOUNTY = 30
export const SHOWDOWN_POINTS_PER_CARD = 10
export const SHOWDOWN_FIRST_CLEAR_BONUS = 20

export interface GuessScoreInput {
  readonly secondsRemaining: number
  readonly roundSeconds: number
  readonly difficulty: WordDifficulty
  readonly usedWordLengthHint?: boolean
}

export interface GuessScoreBreakdown {
  readonly secondsRemaining: number
  readonly roundSeconds: number
  readonly speedScore: number
  readonly difficultyBonus: number
  readonly hintCost: number
  readonly total: number
}

/**
 * Scores a correct guess. Time values are clamped so a stale or dishonest
 * client cannot award more than the round maximum or create a negative score.
 * The authoritative server should supply both values from its own clock.
 */
export function getGuessScoreBreakdown(
  input: GuessScoreInput,
): GuessScoreBreakdown {
  const roundSeconds = normalizeRoundSeconds(input.roundSeconds)
  const secondsRemaining = clampRemainingSeconds(
    input.secondsRemaining,
    roundSeconds,
  )
  const speedScore = Math.round(50 + 50 * (secondsRemaining / roundSeconds))
  const difficultyBonus = DIFFICULTY_BONUSES[input.difficulty]
  const hintCost = input.usedWordLengthHint ? WORD_LENGTH_HINT_COST : 0

  return {
    secondsRemaining,
    roundSeconds,
    speedScore,
    difficultyBonus,
    hintCost,
    total: Math.max(0, speedScore + difficultyBonus - hintCost),
  }
}

export function calculateGuessScore(input: GuessScoreInput): number {
  return getGuessScoreBreakdown(input).total
}

export interface ShowdownScoreInput {
  readonly cardsGuessed: number
  readonly firstToClear: boolean
}

/** Showdown stays simple: no difficulty or shutdown multipliers. */
export function calculateShowdownScore(input: ShowdownScoreInput): number {
  const cardsGuessed = Math.max(
    0,
    Math.floor(normalizeFinite(input.cardsGuessed, 0)),
  )
  return (
    cardsGuessed * SHOWDOWN_POINTS_PER_CARD +
    (input.firstToClear ? SHOWDOWN_FIRST_CLEAR_BONUS : 0)
  )
}

export interface ShutdownBountyInput {
  /** The team that just won the round and would collect the bounty. */
  readonly roundWinner: TeamId
  /** Scores immediately before awarding points for the round. */
  readonly scoresBeforeRound: TeamScores
  /** The uninterrupted streak that existed before this round. */
  readonly activeStreakBeforeRound: WinStreak | null
}

/**
 * A trailing team collects 10 points per opponent win beyond the first, capped
 * at 30, when it breaks that opponent's streak. Tied or leading teams cannot
 * collect a shutdown bounty.
 */
export function calculateShutdownBounty(input: ShutdownBountyInput): number {
  const opponent = otherTeam(input.roundWinner)
  const winnerScore = normalizeNonNegative(
    input.scoresBeforeRound[input.roundWinner],
  )
  const opponentScore = normalizeNonNegative(input.scoresBeforeRound[opponent])
  const streak = input.activeStreakBeforeRound

  if (
    winnerScore >= opponentScore ||
    streak === null ||
    streak.team !== opponent
  ) {
    return 0
  }

  const opponentWins = Math.max(0, Math.floor(normalizeFinite(streak.wins, 0)))

  if (opponentWins < 2) {
    return 0
  }

  return Math.min(MAX_SHUTDOWN_BOUNTY, 10 * (opponentWins - 1))
}

export function updateWinStreak(
  current: WinStreak | null,
  roundWinner: TeamId | null,
): WinStreak | null {
  if (roundWinner === null) return null

  if (current?.team !== roundWinner) {
    return { team: roundWinner, wins: 1 }
  }

  const wins = Math.max(0, Math.floor(normalizeFinite(current.wins, 0)))
  return { team: roundWinner, wins: wins + 1 }
}

function normalizeRoundSeconds(value: number): number {
  return Math.max(1, normalizeFinite(value, 1))
}

function clampRemainingSeconds(value: number, roundSeconds: number): number {
  if (value === Number.POSITIVE_INFINITY) {
    return roundSeconds
  }

  return Math.min(roundSeconds, Math.max(0, normalizeFinite(value, 0)))
}

function normalizeNonNegative(value: number): number {
  return Math.max(0, normalizeFinite(value, 0))
}

function normalizeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
