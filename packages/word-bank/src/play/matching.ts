import { pluralForms, singularForms } from './inflection'
import { STOP_WORDS, answerTokens, normalizeAnswer } from './text'
import type { GuessMatchTarget, GuessMatchVerdict } from './types'

/** Longest guess (trimmed, in UTF-16 units) that is evaluated at all. */
export const MAX_GUESS_LENGTH = 60

/** Shortest answer word that earns `partial` feedback on its own. */
const MIN_PARTIAL_WORD_LENGTH = 3

/**
 * Damerau–Levenshtein (optimal string alignment) distance. Returns `max + 1`
 * as soon as the distance is known to exceed `max`, so callers only pay for
 * the band they care about.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let before: number[] = []
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (before[j - 2] as number) + 1)
      }
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    // Row minima never decrease, so the band is already exceeded for good.
    if (rowMin > max) return max + 1
    before = previous
    previous = current
  }
  return Math.min(previous[b.length] as number, max + 1)
}

/** Allowed typos: none for 1–3 letters, 1 up to 7 letters, 2 for 8+. */
export function closeThreshold(answerKey: string): number {
  if (answerKey.length <= 3) return 0
  if (answerKey.length <= 7) return 1
  return 2
}

function isExactMatch(guessKey: string, answerKey: string): boolean {
  return (
    guessKey === answerKey ||
    pluralForms(answerKey).includes(guessKey) ||
    singularForms(answerKey).includes(guessKey)
  )
}

function isCloseMatch(guessKey: string, answerKey: string): boolean {
  const threshold = closeThreshold(answerKey)
  if (threshold === 0) return false
  return [answerKey, ...pluralForms(answerKey)].some(
    (form) => editDistance(guessKey, form, threshold) <= threshold,
  )
}

/** Meaningful words of multi-word answers, e.g. `hermit`, `crab`. */
function partialWords(answers: readonly string[]): string[] {
  return answers.flatMap((answer) => {
    const tokens = answerTokens(answer)
    if (tokens.length < 2) return []
    return tokens.filter(
      (token) =>
        token.length >= MIN_PARTIAL_WORD_LENGTH && !STOP_WORDS.has(token),
    )
  })
}

/**
 * Server-side guess verdict. Case, accents, spacing (including none),
 * hyphens, punctuation, leading articles, simple plurals, and aliases never
 * cost a player a correct answer. A guess that merely contains the answer
 * among other words is not correct; it earns `partial` for a multi-word
 * answer and `wrong` otherwise.
 */
export function matchGuess(
  guess: string,
  target: GuessMatchTarget,
): GuessMatchVerdict {
  const trimmed = guess.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_GUESS_LENGTH) return 'wrong'
  const guessKey = normalizeAnswer(trimmed)
  if (guessKey.length === 0) return 'wrong'

  const answers = [target.term, ...(target.aliases ?? [])]
  const answerKeys = answers
    .map(normalizeAnswer)
    .filter((key) => key.length > 0)

  if (answerKeys.some((key) => isExactMatch(guessKey, key))) return 'correct'
  if (answerKeys.some((key) => isCloseMatch(guessKey, key))) return 'close'

  const words = partialWords(answers)
  if (words.length > 0) {
    const hit = answerTokens(trimmed).some(
      (token) =>
        token.length >= MIN_PARTIAL_WORD_LENGTH &&
        words.some((word) => isExactMatch(token, word)),
    )
    if (hit) return 'partial'
  }

  return 'wrong'
}

/**
 * Length hint shown to guessers: one underscore per letter or digit, spaces
 * between letters, and three spaces between words. Hyphens/apostrophes stay.
 */
export function wordPattern(term: string): string {
  return term
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .map((word) =>
      Array.from(word)
        .map((char) => (/[\p{L}\p{N}]/u.test(char) ? '_' : char))
        .join(' '),
    )
    .join('   ')
}

/** Count of letters and digits (what the length hint reveals). */
export function letterCount(term: string): number {
  return Array.from(term.normalize('NFC')).filter((char) =>
    /[\p{L}\p{N}]/u.test(char),
  ).length
}
