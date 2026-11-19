import {
  DIFFICULTY_BONUSES,
  TEAM_NAMES,
  type GuessScoreBreakdown,
  type RoomView,
  type TeamId,
  type WordDifficulty,
} from '@drawing-games/game-core'

/** Copy shared by every match screen. Pure, so it is unit tested. */

export const DIFFICULTY_LABELS: Readonly<Record<WordDifficulty, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/** "Hard · +40" — the stake, said in words so color is never the only cue. */
export function difficultyStake(difficulty: WordDifficulty): string {
  const bonus = DIFFICULTY_BONUSES[difficulty]
  return bonus > 0
    ? `${DIFFICULTY_LABELS[difficulty]} · +${bonus}`
    : DIFFICULTY_LABELS[difficulty]
}

export function teamName(team: TeamId): string {
  return TEAM_NAMES[team]
}

export function signedPoints(points: number): string {
  return points >= 0 ? `+${points}` : `−${Math.abs(points)}`
}

/** 12.3 → "12.3s", 61 → "1:01". */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
  }
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function formatMs(ms: number | null): string {
  return ms === null ? '—' : formatSeconds(Math.round(ms / 100) / 10)
}

export interface BreakdownPart {
  readonly label: string
  readonly points: number
}

/**
 * The parts of a solve's points, in the order the formula adds them, e.g.
 * speed 97, hard bonus +40, length hint −10.
 */
export function breakdownParts(
  breakdown: GuessScoreBreakdown,
  difficulty: WordDifficulty | null = null,
): BreakdownPart[] {
  const parts: BreakdownPart[] = [
    {
      label: `Speed (${Math.round(breakdown.secondsRemaining)}s left)`,
      points: breakdown.speedScore,
    },
  ]
  if (breakdown.difficultyBonus > 0) {
    parts.push({
      label: difficulty
        ? `${DIFFICULTY_LABELS[difficulty]} bonus`
        : 'Difficulty bonus',
      points: breakdown.difficultyBonus,
    })
  }
  if (breakdown.hintCost > 0) {
    parts.push({ label: 'Letter hint', points: -breakdown.hintCost })
  }
  return parts
}

/** One-line summary: "97 speed + 40 hard − 10 hint = 127". */
export function breakdownSentence(
  breakdown: GuessScoreBreakdown,
  difficulty: WordDifficulty | null = null,
): string {
  const [speed, ...rest] = breakdownParts(breakdown, difficulty)
  const secondsLeft = Math.round(breakdown.secondsRemaining)
  if (rest.length === 0) {
    return `${breakdown.speedScore} speed points for ${secondsLeft}s left`
  }
  let text = `${speed?.points ?? 0} speed`
  for (const part of rest) {
    const label = part.label.replace(/ bonus$/, '').toLowerCase()
    text +=
      part.points >= 0
        ? ` + ${part.points} ${label}`
        : ` − ${-part.points} ${label}`
  }
  return `${text} = ${breakdown.total}`
}

/** Short label for the top bar: round x/y or the phase name. */
export function phaseLabel(view: RoomView): string {
  const round = view.match?.roundNumber ?? 0
  const total = view.match?.totalRounds ?? view.settings.rounds
  switch (view.phase) {
    case 'lobby':
      return 'Lobby'
    case 'word-draft':
      return `Round ${round}/${total} · Pick`
    case 'drawing':
      return `Round ${round}/${total}`
    case 'round-results':
      return `Round ${round}/${total} · Results`
    case 'showdown':
      return 'Showdown'
    case 'stats':
      return 'Final'
  }
}

/** The top bar's label on narrow screens: "R3/6", "Final". */
export function shortPhaseLabel(view: RoomView): string {
  const round = view.match?.roundNumber ?? 0
  const total = view.match?.totalRounds ?? view.settings.rounds
  switch (view.phase) {
    case 'lobby':
      return 'Lobby'
    case 'word-draft':
    case 'drawing':
    case 'round-results':
      return `R${round}/${total}`
    case 'showdown':
      return 'Showdown'
    case 'stats':
      return 'Final'
  }
}

/** Spoken name of the running timer. */
export function timerLabel(view: RoomView): string {
  switch (view.phase) {
    case 'word-draft':
      return 'Word pick time'
    case 'drawing':
      return 'Drawing time'
    case 'round-results':
      return 'Next round starts in'
    case 'showdown':
      return 'Showdown time'
    default:
      return 'Time left'
  }
}

/** What the screen reader hears when the phase changes. */
export function phaseAnnouncement(view: RoomView): string {
  const round = view.match?.roundNumber ?? 0
  switch (view.phase) {
    case 'lobby':
      return 'Back in the lobby.'
    case 'word-draft':
      return view.me?.role === 'drawer'
        ? `Round ${round}. Pick your team's word.`
        : `Round ${round}. Your drawer is picking a word.`
    case 'drawing':
      return view.me?.role === 'drawer'
        ? `Round ${round}. Start drawing!`
        : `Round ${round}. Start guessing!`
    case 'round-results':
      return `Round ${round} results.`
    case 'showdown':
      return 'Showdown! Relay redraw of your team’s words.'
    case 'stats':
      return 'Match over. Final scores.'
  }
}

/** "x/y" with a readable word for screen readers. */
export function votesLabel(votesFor: number, votesNeeded: number): string {
  return `${votesFor}/${votesNeeded}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
