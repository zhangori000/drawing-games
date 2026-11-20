import { ROOM_SETTINGS_LIMITS } from '@drawing-games/game-core'
import {
  formatCustomWordEntry,
  parseCustomWordEntry,
} from '@drawing-games/word-bank'

/**
 * Client mirror of the room's custom-word rules (game-core
 * `sanitizeCustomWords`), so the lobby can show an honest count before the
 * host's edit reaches the server. The room stays authoritative.
 */
export const CUSTOM_WORD_LIMITS = ROOM_SETTINGS_LIMITS.customWords

/** C0/C1 controls plus zero-width and bidi-override characters. */
const INVISIBLE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g

export interface ParsedCustomWords {
  /**
   * Clean, de-duplicated words, capped at the room's maximum. A difficulty
   * tag is kept in the room's canonical form: `paper shredder|hard`.
   */
  readonly words: readonly string[]
  /** Entries dropped for being too short or too long. */
  readonly invalid: number
  /** Entries dropped for a tag other than `|easy`, `|medium` or `|hard`. */
  readonly badTags: number
  /** Case-insensitive repeats that were dropped. */
  readonly duplicates: number
  /** Valid words beyond the room's maximum that were not kept. */
  readonly overLimit: number
  /**
   * The entries dropped for their length or tag, cleaned, in input order, so
   * the lobby can name them and keep them in the box for fixing.
   */
  readonly skipped: readonly SkippedCustomWord[]
}

export interface SkippedCustomWord {
  readonly entry: string
  readonly reason: 'length' | 'tag'
}

function cleanWord(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function codePointLength(text: string): number {
  return Array.from(text).length
}

/** Splits host input on commas and line breaks and applies the room rules. */
export function parseCustomWords(text: string): ParsedCustomWords {
  return sanitizeWordList(text.split(/[,\n\r]+/))
}

export function sanitizeWordList(
  entries: readonly string[],
): ParsedCustomWords {
  const words: string[] = []
  const seen = new Set<string>()
  let invalid = 0
  let badTags = 0
  let duplicates = 0
  let overLimit = 0
  const skipped: SkippedCustomWord[] = []
  for (const entry of entries) {
    const cleaned = cleanWord(entry)
    if (cleaned.length === 0) continue
    const parsed = parseCustomWordEntry(cleaned)
    if (parsed === null) {
      badTags += 1
      skipped.push({ entry: cleaned, reason: 'tag' })
      continue
    }
    const term = parsed.term
    const length = codePointLength(term)
    if (
      length < CUSTOM_WORD_LIMITS.minLength ||
      length > CUSTOM_WORD_LIMITS.maxLength
    ) {
      invalid += 1
      skipped.push({ entry: cleaned, reason: 'length' })
      continue
    }
    const key = term.toLowerCase()
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    if (words.length >= CUSTOM_WORD_LIMITS.maxCount) {
      overLimit += 1
      continue
    }
    words.push(formatCustomWordEntry({ term, difficulty: parsed.difficulty }))
  }
  return { words, invalid, badTags, duplicates, overLimit, skipped }
}

/** One word per line: the textarea's canonical form. */
export function formatCustomWords(words: readonly string[]): string {
  return words.join('\n')
}

/**
 * The host's box after an import: the new list, one word per line, then the
 * entries the host typed that were skipped (a mistyped tag, too long), so
 * an import never throws away text they still mean to fix.
 */
export function formatWithSkipped(
  words: readonly string[],
  skipped: readonly SkippedCustomWord[],
): string {
  return [...words, ...skipped.map((item) => item.entry)].join('\n')
}

/** Appends `added` after `existing`, keeping the first spelling of repeats. */
export function mergeCustomWords(
  existing: readonly string[],
  added: readonly string[],
): { readonly words: readonly string[]; readonly addedCount: number } {
  const merged = sanitizeWordList([...existing, ...added])
  const before = sanitizeWordList(existing).words.length
  return {
    words: merged.words,
    addedCount: Math.max(0, merged.words.length - before),
  }
}

/** Same comparison the room uses: order and spelling both matter. */
export function sameWordList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((word, index) => word === right[index])
  )
}
