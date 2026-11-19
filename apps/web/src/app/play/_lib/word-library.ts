import { isRecord, readJson } from '@/lib/browser-storage'

/**
 * Read-only bridge to the admin Word Library (`/admin/words`), which keeps
 * its catalog snapshot in this browser's localStorage. The lobby only reads
 * it to offer "Import from Word Library"; it never writes to it.
 *
 * Snapshot shape (see admin/words/word-library-client.tsx):
 * `{ version: 1, words: CatalogWord[], collections: CustomWordCollection[] }`.
 */
export const WORD_LIBRARY_STORAGE_KEY = 'drawing-games.word-catalog.v1'

export interface LibraryCollection {
  readonly id: string
  readonly name: string
  readonly kind: 'master' | 'custom'
  /** Display terms of the collection's active, playable words. */
  readonly terms: readonly string[]
}

const MASTER_ID = 'master'

interface PlayableTerm {
  readonly id: string
  readonly term: string
}

function playableTerm(value: unknown): PlayableTerm | null {
  if (!isRecord(value)) return null
  const { id, term, status, eligibleForPlay } = value
  if (typeof id !== 'string' || typeof term !== 'string') return null
  if (status !== 'active' || eligibleForPlay === false) return null
  const trimmed = term.trim()
  return trimmed ? { id, term: trimmed } : null
}

/**
 * Lists the Master collection (every active, playable word) followed by the
 * active custom collections, alphabetically. Returns null when the value is
 * not a catalog snapshot this version understands.
 */
export function parseWordLibrary(value: unknown): LibraryCollection[] | null {
  if (!isRecord(value) || value.version !== 1) return null
  if (!Array.isArray(value.words) || !Array.isArray(value.collections)) {
    return null
  }

  const terms = new Map<string, string>()
  for (const entry of value.words) {
    const word = playableTerm(entry)
    if (word) terms.set(word.id, word.term)
  }

  const custom: LibraryCollection[] = []
  for (const entry of value.collections) {
    if (!isRecord(entry) || entry.kind !== 'custom') continue
    if (entry.status !== 'active') continue
    const { id, name, wordIds } = entry
    if (typeof id !== 'string' || id === MASTER_ID) continue
    if (typeof name !== 'string' || !name.trim()) continue
    if (!Array.isArray(wordIds)) continue
    const collectionTerms = wordIds
      .map((wordId) => (typeof wordId === 'string' ? terms.get(wordId) : null))
      .filter((term): term is string => typeof term === 'string')
    custom.push({
      id,
      name: name.trim(),
      kind: 'custom',
      terms: collectionTerms,
    })
  }
  custom.sort((left, right) => left.name.localeCompare(right.name))

  return [
    {
      id: MASTER_ID,
      name: 'Master list',
      kind: 'master',
      terms: [...terms.values()],
    },
    ...custom,
  ]
}

/** The library saved in this browser, or null if there is none. */
export function readWordLibrary(): LibraryCollection[] | null {
  return parseWordLibrary(readJson('local', WORD_LIBRARY_STORAGE_KEY))
}
