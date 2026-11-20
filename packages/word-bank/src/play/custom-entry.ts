import { WORD_DIFFICULTIES, type WordDifficulty } from '../types'

/**
 * One host custom word as the host typed it, optionally tagged with the
 * difficulty they want it to score as: `paper shredder|hard`. The tag is
 * the text after the only `|`, one of `easy`, `medium` or `hard` (any case,
 * spaces around the `|` allowed). Untagged words are "unrated": they score
 * as medium and the drawer's card says "Custom" instead of a difficulty.
 */
export interface CustomWordEntry {
  readonly term: string
  /** null when the host gave no tag. */
  readonly difficulty: WordDifficulty | null
}

export const CUSTOM_DIFFICULTY_SEPARATOR = '|'

const DIFFICULTIES: ReadonlySet<string> = new Set(WORD_DIFFICULTIES)

function isDifficulty(value: string): value is WordDifficulty {
  return DIFFICULTIES.has(value)
}

/**
 * Splits a custom-word entry into its term and optional difficulty tag.
 * Returns null for an entry that has a `|` but no valid tag after it (or
 * more than one `|`), so a typo never becomes part of an answer. The term
 * is trimmed but otherwise as typed; callers clean and length-check it.
 */
export function parseCustomWordEntry(raw: string): CustomWordEntry | null {
  const parts = raw.split(CUSTOM_DIFFICULTY_SEPARATOR)
  if (parts.length === 1) return { term: raw.trim(), difficulty: null }
  if (parts.length !== 2) return null
  const [term = '', tag = ''] = parts
  const difficulty = tag.trim().toLowerCase()
  return isDifficulty(difficulty) ? { term: term.trim(), difficulty } : null
}

/** The canonical stored form: `term` or `term|hard`. */
export function formatCustomWordEntry(entry: CustomWordEntry): string {
  return entry.difficulty === null
    ? entry.term
    : `${entry.term}${CUSTOM_DIFFICULTY_SEPARATOR}${entry.difficulty}`
}
