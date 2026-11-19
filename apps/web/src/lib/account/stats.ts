import type {
  AccountStats,
  WordHistoryEvent,
  WordHistoryRole,
} from '@drawing-games/game-core'

export interface StatCard {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string
}

const EMPTY = '—'

export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return EMPTY
  return `${Math.round((part / whole) * 100)}%`
}

export function formatSeconds(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return EMPTY
  const seconds = ms / 1000
  return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`
}

function average(total: number, count: number): number | null {
  return count > 0 ? total / count : null
}

/** The lifetime cards on the profile page, in display order. */
export function lifetimeStatCards(stats: AccountStats): StatCard[] {
  return [
    {
      id: 'matches',
      label: 'Matches',
      value: String(stats.matchesPlayed),
      detail: `${stats.wins}W · ${stats.losses}L · ${stats.ties}T`,
    },
    {
      id: 'win-rate',
      label: 'Win rate',
      value: formatPercent(stats.wins, stats.matchesPlayed),
      detail: `${stats.wins} wins`,
    },
    {
      id: 'drawings-solved',
      label: 'Drawings solved',
      value: formatPercent(stats.drawingsSolved, stats.roundsDrawn),
      detail: `${stats.drawingsSolved} of ${stats.roundsDrawn} drawn`,
    },
    {
      id: 'drawer-solve-time',
      label: 'Avg solve as drawer',
      value: formatSeconds(
        average(stats.drawerSolveMsTotal, stats.drawingsSolved),
      ),
      detail: 'How fast your team reads you',
    },
    {
      id: 'correct-guesses',
      label: 'Correct guesses',
      value: String(stats.correctGuesses),
      detail: `${stats.closeGuesses} so-close calls`,
    },
    {
      id: 'accuracy',
      label: 'Guess accuracy',
      value: formatPercent(stats.correctGuesses, stats.guessesSubmitted),
      detail: `${stats.guessesSubmitted} guesses sent`,
    },
    {
      id: 'time-to-correct',
      label: 'Avg time to correct',
      value: formatSeconds(
        average(stats.timeToCorrectMsTotal, stats.correctGuesses),
      ),
      detail: 'From first stroke to your answer',
    },
    {
      id: 'fastest',
      label: 'Fastest correct',
      value: formatSeconds(stats.fastestCorrectMs),
      detail: 'Personal best',
    },
    {
      id: 'hard-words',
      label: 'Hard words solved',
      value: String(stats.hardWordsSolved),
      detail: 'Drawn or guessed',
    },
    {
      id: 'showdown',
      label: 'Showdown cards',
      value: String(stats.showdownCardsDrawn + stats.showdownCardsGuessed),
      detail: `${stats.showdownCardsDrawn} drawn · ${stats.showdownCardsGuessed} guessed`,
    },
  ]
}

export type WordRoleFilter =
  'all' | 'drew' | 'guessed' | 'missed' | 'offered' | 'seen'

export const WORD_ROLE_FILTERS: readonly {
  readonly id: WordRoleFilter
  readonly label: string
}[] = [
  { id: 'all', label: 'All' },
  { id: 'drew', label: 'Drew' },
  { id: 'guessed', label: 'Guessed' },
  { id: 'missed', label: 'Missed' },
  { id: 'offered', label: 'Offered' },
  { id: 'seen', label: 'Seen' },
]

const ROLE_FILTER: Readonly<Record<WordHistoryRole, WordRoleFilter>> = {
  drew: 'drew',
  guessed: 'guessed',
  missed: 'missed',
  offered: 'offered',
  'unknown-report': 'offered',
  'seen-report': 'seen',
}

export function matchesRoleFilter(
  event: WordHistoryEvent,
  filter: WordRoleFilter,
): boolean {
  return filter === 'all' || ROLE_FILTER[event.role] === filter
}

export const WORD_ROLE_LABELS: Readonly<Record<WordHistoryRole, string>> = {
  drew: 'Drew',
  guessed: 'Guessed',
  missed: 'Missed',
  offered: 'Offered',
  'seen-report': 'Seen it',
  'unknown-report': 'Didn’t know it',
}

/** Short outcome text for one history row. */
export function describeWordResult(event: WordHistoryEvent): string {
  switch (event.role) {
    case 'offered':
      return 'Not picked'
    case 'seen-report':
      return 'Swapped: seen it'
    case 'unknown-report':
      return 'Swapped: didn’t know it'
    default:
      break
  }
  if (event.solved === true) {
    const time =
      event.solveMs === null ? '' : ` in ${formatSeconds(event.solveMs)}`
    const points = event.points === null ? '' : ` · +${event.points}`
    return `Solved${time}${points}`
  }
  return event.solved === false ? 'Not solved' : EMPTY
}

export function formatRelativeTime(atMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - atMs) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return new Date(atMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: days > 300 ? 'numeric' : undefined,
  })
}
