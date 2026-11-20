import { readJson, removeKey, writeJson } from './browser-storage'

/**
 * Guest word history: ids of words this browser has recently met, sent on
 * join so a guest's prompts stay fresh across rooms, the way an account's
 * history does. Two lists, newest first:
 *
 * - `avoid`: words this browser drew, or reported "seen it" on as drawer.
 *   The room does not deal them to this player as drawer again while fresh
 *   words remain (an account's `avoid` rule).
 * - `soft`: every other word met (guessed, missed, offered, "don't know
 *   it", the other team's word). Dealt less often.
 *
 * It is a personalization hint only: it shapes this player's own cards (and
 * their teammates' drafts a little), and the room never trusts it for
 * anything else.
 */
export const WORD_HISTORY_KEY = 'dd.wordHistory.v2'
/** The single-list history before drawn words were kept apart (all soft). */
export const LEGACY_WORD_HISTORY_KEY = 'dd.wordHistory.v1'
/** Per list: what the protocol accepts in `room.join`. */
export const WORD_HISTORY_LIMIT = 300

export interface WordHistory {
  readonly avoid: readonly string[]
  readonly soft: readonly string[]
}

/** Same shape the protocol accepts in `room.join.recentWordIds`. */
const WORD_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/

export function isRecordableWordId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 160 &&
    WORD_ID_PATTERN.test(value)
  )
}

/**
 * Both lists, newest first, de-duplicated, at most 300 ids each; a word in
 * `avoid` is not repeated in `soft`. A v1 history is moved into `soft` once.
 */
export function getWordHistory(): WordHistory {
  const stored = readJson('local', WORD_HISTORY_KEY)
  if (stored !== null) return clean(stored)
  const legacy = readJson('local', LEGACY_WORD_HISTORY_KEY)
  if (legacy === null) return { avoid: [], soft: [] }
  const migrated = clean({ avoid: [], soft: legacy })
  writeJson('local', WORD_HISTORY_KEY, migrated)
  removeKey('local', LEGACY_WORD_HISTORY_KEY)
  return migrated
}

/** How many different words this browser remembers. */
export function countRememberedWords(): number {
  const history = getWordHistory()
  return history.avoid.length + history.soft.length
}

/**
 * Records ids as most recent (in the given order, first = newest). Ids the
 * join schema would reject are skipped; `custom/<slug>` ids are kept because
 * rooms match them to curated words by answer. A drawn or "seen it" word
 * stays in `avoid` when it is met again later.
 */
export function recordWordHistory(entry: {
  readonly avoid?: readonly string[]
  readonly soft?: readonly string[]
}): void {
  const avoid = (entry.avoid ?? []).filter(isRecordableWordId)
  const soft = (entry.soft ?? []).filter(isRecordableWordId)
  if (avoid.length === 0 && soft.length === 0) return
  const current = getWordHistory()
  writeJson(
    'local',
    WORD_HISTORY_KEY,
    clean({
      avoid: [...avoid, ...current.avoid],
      soft: [...soft, ...current.soft],
    }),
  )
}

function clean(stored: unknown): WordHistory {
  const record =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)
      : {}
  const avoid = uniqueIds(record.avoid).slice(0, WORD_HISTORY_LIMIT)
  const avoided = new Set(avoid)
  const soft = uniqueIds(record.soft)
    .filter((id) => !avoided.has(id))
    .slice(0, WORD_HISTORY_LIMIT)
  return { avoid, soft }
}

/** Valid ids in their order, each kept at its first (newest) place. */
function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isRecordableWordId))]
}
