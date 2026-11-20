import { nounPluralKeys, nounSingularKeys } from './inflection'
import { boundedMemo } from './memo'
import { answerTokens } from './text'

/**
 * Answer keys that name the same word as `term` for no-repeat purposes: its
 * own key first, then its simple plurals and singulars (irregular ones too,
 * and on X of an "X of Y" phrase), exactly the noun forms `matchGuess`
 * accepts as correct for it. So `dolphin`/`dolphins`, `cat`/`cats` and
 * `mouse`/`mice` are one word to the pool, the room's no-repeat memory,
 * personal memory, and the lobby's fresh count. Verb forms are not
 * included: `wave` and `waving` are different cards. Empty for a term with
 * no letters or digits.
 */
export const sameWordKeys: (term: string) => readonly string[] = boundedMemo(
  (term) => {
    const tokens = answerTokens(term)
    const key = tokens.join('')
    if (key.length === 0) return Object.freeze([])
    return Object.freeze([
      ...new Set([key, ...nounPluralKeys(tokens), ...nounSingularKeys(tokens)]),
    ])
  },
)

/** Whether two terms name the same word (see `sameWordKeys`). */
export function isSameWord(left: string, right: string): boolean {
  const leftKeys = sameWordKeys(left)
  const rightKeys = sameWordKeys(right)
  const [leftKey] = leftKeys
  const [rightKey] = rightKeys
  if (leftKey === undefined || rightKey === undefined) return false
  return leftKeys.includes(rightKey) || rightKeys.includes(leftKey)
}

/** A growing set of words, compared by `isSameWord`. */
export interface SameWordSet {
  add(term: string): void
  has(term: string): boolean
}

export function createSameWordSet(): SameWordSet {
  /** Own answer keys of the added words. */
  const keys = new Set<string>()
  /** Every form of the added words, own keys included. */
  const forms = new Set<string>()
  return {
    add(term) {
      const [key, ...rest] = sameWordKeys(term)
      if (key === undefined) return
      keys.add(key)
      forms.add(key)
      for (const form of rest) forms.add(form)
    },
    has(term) {
      const termKeys = sameWordKeys(term)
      const [key] = termKeys
      if (key === undefined) return false
      return forms.has(key) || termKeys.some((form) => keys.has(form))
    },
  }
}

/** Finds which of a fixed list of words a term names. */
export interface SameWordIndex<T> {
  /**
   * The first word with `term`'s own answer key, else the first one `term`
   * names by an inflection (see `isSameWord`), else undefined.
   */
  find(term: string): T | undefined
}

const INDEXES = new WeakMap<readonly object[], SameWordIndex<object>>()

/** Memoized per (immutable) array, like a room's pool. */
export function sameWordIndex<T extends { readonly term: string }>(
  words: readonly T[],
): SameWordIndex<T> {
  const cached = INDEXES.get(words)
  if (cached !== undefined) return cached as SameWordIndex<T>
  const byKey = new Map<string, T>()
  const byForm = new Map<string, T>()
  for (const word of words) {
    const [key, ...rest] = sameWordKeys(word.term)
    if (key === undefined) continue
    if (!byKey.has(key)) byKey.set(key, word)
    for (const form of rest) if (!byForm.has(form)) byForm.set(form, word)
  }
  const index: SameWordIndex<T> = {
    find(term) {
      const [key, ...rest] = sameWordKeys(term)
      if (key === undefined) return undefined
      const exact = byKey.get(key) ?? byForm.get(key)
      if (exact !== undefined) return exact
      for (const form of rest) {
        const word = byKey.get(form)
        if (word !== undefined) return word
      }
      return undefined
    },
  }
  INDEXES.set(words, index as SameWordIndex<object>)
  return index
}
