import type { GuessMatchTarget, GuessMatchVerdict } from './types'

const LEADING_ARTICLES = new Set(['a', 'an', 'the'])

/** Lowercase, accent-free tokens; punctuation and hyphens split words. */
export function answerTokens(text: string): string[] {
  const tokens = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
  while (tokens.length > 1 && LEADING_ARTICLES.has(tokens[0] as string)) {
    tokens.shift()
  }
  return tokens
}

/** Canonical comparison key: tokens joined without separators. */
export function normalizeAnswer(text: string): string {
  return answerTokens(text).join('')
}

function pluralVariants(key: string): string[] {
  const variants = [key]
  if (key.endsWith('ies') && key.length > 4)
    variants.push(`${key.slice(0, -3)}y`)
  if (key.endsWith('es') && key.length > 3) variants.push(key.slice(0, -2))
  if (key.endsWith('s') && key.length > 2) variants.push(key.slice(0, -1))
  variants.push(`${key}s`, `${key}es`)
  if (key.endsWith('y')) variants.push(`${key.slice(0, -1)}ies`)
  return variants
}

/** Damerau–Levenshtein (optimal string alignment) distance, early exit. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  )
  for (let i = 0; i < rows; i += 1) d[i]![0] = i
  for (let j = 0; j < cols; j += 1) d[0]![j] = j
  for (let i = 1; i < rows; i += 1) {
    let rowMin = Number.POSITIVE_INFINITY
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, d[i - 2]![j - 2]! + 1)
      }
      d[i]![j] = value
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length]![b.length]!
}

function closeThreshold(answerKey: string): number {
  if (answerKey.length <= 3) return 0
  if (answerKey.length <= 7) return 1
  return 2
}

/**
 * Server-side guess matching. Case, accents, spacing, hyphens, punctuation,
 * leading articles, and simple plurals never cost a player a correct answer.
 */
export function matchGuess(
  guess: string,
  target: GuessMatchTarget,
): GuessMatchVerdict {
  const guessKey = normalizeAnswer(guess)
  if (guessKey.length === 0) return 'wrong'

  const answers = [target.term, ...(target.aliases ?? [])]
  const answerKeys = answers
    .map(normalizeAnswer)
    .filter((key) => key.length > 0)

  for (const key of answerKeys) {
    if (pluralVariants(key).includes(guessKey)) return 'correct'
    if (pluralVariants(guessKey).includes(key)) return 'correct'
  }

  for (const key of answerKeys) {
    const threshold = closeThreshold(key)
    if (threshold > 0 && editDistance(guessKey, key, threshold) <= threshold) {
      return 'close'
    }
  }

  const answerWordSet = new Set(
    answers.flatMap((answer) => {
      const tokens = answerTokens(answer)
      return tokens.length > 1 ? tokens.filter((token) => token.length > 2) : []
    }),
  )
  if (answerWordSet.size > 0) {
    const guessTokens = answerTokens(guess)
    if (guessTokens.some((token) => answerWordSet.has(token))) return 'partial'
  }

  return 'wrong'
}

/**
 * Length hint shown to guessers: one underscore per letter or digit, spaces
 * between letters, and three spaces between words. Hyphens/apostrophes stay.
 */
export function wordPattern(term: string): string {
  return term
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
  return Array.from(term).filter((char) => /[\p{L}\p{N}]/u.test(char)).length
}
