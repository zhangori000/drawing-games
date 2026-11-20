import type { TeamId, WordDifficulty } from '../types'

/**
 * Durable, account-facing records emitted by the room engine. The realtime
 * room forwards them to the optional account actor; they never contain
 * resume tokens, raw drawings, or other players' guesses.
 */

export const WORD_HISTORY_ROLES = [
  /** The member drew this word (normal round or showdown card). */
  'drew',
  /** The member's team had this word and the member guessed it correctly. */
  'guessed',
  /** The member's team had this word but the member did not solve it. */
  'missed',
  /** The word was offered to the member as a draft card but not chosen. */
  'offered',
  /** The member replaced it as "seen before" — never offer it again. */
  'seen-report',
  /** The member replaced it as "I don't know this word". */
  'unknown-report',
] as const

export type WordHistoryRole = (typeof WORD_HISTORY_ROLES)[number]

export interface WordHistoryEvent {
  readonly wordId: string
  readonly term: string
  readonly packId: string
  readonly difficulty: WordDifficulty
  readonly role: WordHistoryRole
  /** Whether the member's team solved the word; null for draft-only roles. */
  readonly solved: boolean | null
  /** Milliseconds from drawing start to the team's solve, when solved. */
  readonly solveMs: number | null
  /** Team points earned for the word, when solved. */
  readonly points: number | null
  readonly atMs: number
  readonly roomCode: string
  /** A Showdown relay card (`drew`/`guessed`); absent for normal rounds. */
  readonly showdown?: true
}

/** Per-member contribution inside one match. All counters are integers. */
export interface MemberMatchStats {
  readonly roundsDrawn: number
  /** Normal rounds this member drew that their team solved. */
  readonly drawingsSolved: number
  /** Sum of solve durations for `drawingsSolved` (for averages). */
  readonly drawerSolveMsTotal: number
  readonly guessesSubmitted: number
  readonly correctGuesses: number
  readonly closeGuesses: number
  /** Sum of time-to-correct for `correctGuesses` (normal rounds only). */
  readonly timeToCorrectMsTotal: number
  readonly fastestCorrectMs: number | null
  /** Hard words this member drew or guessed that were solved. */
  readonly hardWordsSolved: number
  /** Team points credited to this member's own correct guesses. */
  readonly pointsWon: number
  readonly showdownCardsDrawn: number
  readonly showdownCardsGuessed: number
}

export const EMPTY_MEMBER_MATCH_STATS: MemberMatchStats = Object.freeze({
  roundsDrawn: 0,
  drawingsSolved: 0,
  drawerSolveMsTotal: 0,
  guessesSubmitted: 0,
  correctGuesses: 0,
  closeGuesses: 0,
  timeToCorrectMsTotal: 0,
  fastestCorrectMs: null,
  hardWordsSolved: 0,
  pointsWon: 0,
  showdownCardsDrawn: 0,
  showdownCardsGuessed: 0,
})

/** Two seats' contributions added up (fastest: the quicker of the two). */
export function addMemberMatchStats(
  left: MemberMatchStats,
  right: MemberMatchStats,
): MemberMatchStats {
  const fastest =
    left.fastestCorrectMs === null
      ? right.fastestCorrectMs
      : right.fastestCorrectMs === null
        ? left.fastestCorrectMs
        : Math.min(left.fastestCorrectMs, right.fastestCorrectMs)
  return {
    roundsDrawn: left.roundsDrawn + right.roundsDrawn,
    drawingsSolved: left.drawingsSolved + right.drawingsSolved,
    drawerSolveMsTotal: left.drawerSolveMsTotal + right.drawerSolveMsTotal,
    guessesSubmitted: left.guessesSubmitted + right.guessesSubmitted,
    correctGuesses: left.correctGuesses + right.correctGuesses,
    closeGuesses: left.closeGuesses + right.closeGuesses,
    timeToCorrectMsTotal:
      left.timeToCorrectMsTotal + right.timeToCorrectMsTotal,
    fastestCorrectMs: fastest,
    hardWordsSolved: left.hardWordsSolved + right.hardWordsSolved,
    pointsWon: left.pointsWon + right.pointsWon,
    showdownCardsDrawn: left.showdownCardsDrawn + right.showdownCardsDrawn,
    showdownCardsGuessed:
      left.showdownCardsGuessed + right.showdownCardsGuessed,
  }
}

/** Whether the member drew, guessed, or scored anything in the match. */
export function hasMatchActivity(stats: MemberMatchStats): boolean {
  return (
    stats.roundsDrawn > 0 ||
    stats.guessesSubmitted > 0 ||
    stats.closeGuesses > 0 ||
    stats.pointsWon > 0 ||
    stats.showdownCardsDrawn > 0 ||
    stats.showdownCardsGuessed > 0
  )
}

export type MatchResult = 'win' | 'loss' | 'tie'

export interface MatchSummaryRecord {
  readonly roomCode: string
  readonly matchNumber: number
  readonly endedAtMs: number
  readonly team: TeamId
  readonly result: MatchResult
  readonly teamScore: number
  readonly opponentScore: number
  readonly endedReason: 'completed' | 'surrender'
  readonly withBots: boolean
  readonly roundsPlayed: number
  readonly stats: MemberMatchStats
}

/** Lifetime totals stored on an account. */
export interface AccountStats {
  readonly matchesPlayed: number
  readonly wins: number
  readonly losses: number
  readonly ties: number
  readonly roundsDrawn: number
  readonly drawingsSolved: number
  readonly drawerSolveMsTotal: number
  readonly guessesSubmitted: number
  readonly correctGuesses: number
  readonly closeGuesses: number
  readonly timeToCorrectMsTotal: number
  readonly fastestCorrectMs: number | null
  readonly hardWordsSolved: number
  readonly pointsWon: number
  readonly showdownCardsDrawn: number
  readonly showdownCardsGuessed: number
  /** Distinct words this account has drawn. */
  readonly distinctWordsDrawn: number
}

export const EMPTY_ACCOUNT_STATS: AccountStats = Object.freeze({
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  roundsDrawn: 0,
  drawingsSolved: 0,
  drawerSolveMsTotal: 0,
  guessesSubmitted: 0,
  correctGuesses: 0,
  closeGuesses: 0,
  timeToCorrectMsTotal: 0,
  fastestCorrectMs: null,
  hardWordsSolved: 0,
  pointsWon: 0,
  showdownCardsDrawn: 0,
  showdownCardsGuessed: 0,
  distinctWordsDrawn: 0,
})

/**
 * Word memory used to keep prompts fresh. Ids are word-bank word ids.
 * - `avoid`: never offer this word to this member as a drawer.
 * - `soft`: strongly de-prioritize for this member and their teammates.
 */
export interface PlayerWordMemory {
  readonly avoid: readonly string[]
  readonly soft: readonly string[]
}

export const EMPTY_WORD_MEMORY: PlayerWordMemory = Object.freeze({
  avoid: Object.freeze([]) as readonly string[],
  soft: Object.freeze([]) as readonly string[],
})

/** Caps applied wherever memory crosses a boundary (join, account verify). */
export const WORD_MEMORY_LIMITS = Object.freeze({ avoid: 600, soft: 600 })

/** What `GET /accounts/me` returns and what the profile page renders. */
export interface AccountProfileView {
  readonly accountId: string
  readonly username: string
  readonly displayName: string
  readonly createdAtMs: number
  readonly stats: AccountStats
  /** Most recent first, at most 200. */
  readonly recentWords: readonly WordHistoryEvent[]
  /** Most recent first, at most 30. */
  readonly recentMatches: readonly MatchSummaryRecord[]
  /** Number of words this account will never be offered again. */
  readonly avoidedWordCount: number
}
