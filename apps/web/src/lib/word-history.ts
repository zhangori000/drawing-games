import { readJson, writeJson } from './browser-storage'

/**
 * Guest word history: ids of words this browser has recently drawn, guessed,
 * or been offered. Sent on join as soft "seen it" memory so a guest's prompts
 * stay fresh across rooms. It is a personalization hint only; the room never
 * trusts it for anything else.
 */
export const WORD_HISTORY_KEY = 'dd.wordHistory.v1'
export const WORD_HISTORY_LIMIT = 300

/** Same shape the protocol accepts in `room.join.recentWordIds`. */
const WORD_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/

export function isRecordableWordId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 160 &&
    WORD_ID_PATTERN.test(value)
  )
}

/** Newest first, de-duplicated, at most 300 ids. */
export function getRecentWordIds(): string[] {
  const stored = readJson('local', WORD_HISTORY_KEY)
  if (!Array.isArray(stored)) return []
  return dedupe(stored.filter(isRecordableWordId)).slice(0, WORD_HISTORY_LIMIT)
}

/**
 * Records ids as most recent (in the given order, first = newest). Custom
 * words and malformed ids are skipped because the join schema rejects them.
 */
export function recordWordIds(ids: readonly string[]): void {
  const fresh = ids.filter(isRecordableWordId)
  if (fresh.length === 0) return
  const next = dedupe([...fresh, ...getRecentWordIds()]).slice(
    0,
    WORD_HISTORY_LIMIT,
  )
  writeJson('local', WORD_HISTORY_KEY, next)
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}
