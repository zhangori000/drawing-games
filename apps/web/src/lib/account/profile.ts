import {
  EMPTY_ACCOUNT_STATS,
  type AccountProfileView,
  type AccountStats,
  type MatchSummaryRecord,
  type WordHistoryEvent,
} from '@drawing-games/game-core'

import { isRecord } from '../browser-storage'

/**
 * Accepts an account profile from the server when its identity fields are
 * present, and sanitizes the rest so the profile page never renders NaN or
 * crashes on a partially implemented backend.
 */
export function parseProfile(value: unknown): AccountProfileView | null {
  if (!isRecord(value)) return null
  const { accountId, username, displayName } = value
  if (typeof accountId !== 'string' || typeof username !== 'string') {
    return null
  }
  return {
    accountId,
    username,
    displayName:
      typeof displayName === 'string' && displayName.length > 0
        ? displayName
        : username,
    createdAtMs: finiteOr(value.createdAtMs, 0),
    stats: parseStats(value.stats),
    recentWords: Array.isArray(value.recentWords)
      ? value.recentWords.filter(isWordEvent)
      : [],
    recentMatches: Array.isArray(value.recentMatches)
      ? value.recentMatches.filter(isMatchSummary)
      : [],
    avoidedWordCount: finiteOr(value.avoidedWordCount, 0),
  }
}

function parseStats(value: unknown): AccountStats {
  if (!isRecord(value)) return EMPTY_ACCOUNT_STATS
  const stats: Record<string, number | null> = {}
  for (const [key, fallback] of Object.entries(EMPTY_ACCOUNT_STATS)) {
    const raw = value[key]
    stats[key] =
      typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  }
  return stats as unknown as AccountStats
}

function isWordEvent(value: unknown): value is WordHistoryEvent {
  return (
    isRecord(value) &&
    typeof value.wordId === 'string' &&
    typeof value.term === 'string' &&
    typeof value.role === 'string' &&
    typeof value.atMs === 'number'
  )
}

function isMatchSummary(value: unknown): value is MatchSummaryRecord {
  return (
    isRecord(value) &&
    typeof value.endedAtMs === 'number' &&
    typeof value.result === 'string' &&
    typeof value.teamScore === 'number' &&
    typeof value.opponentScore === 'number'
  )
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
