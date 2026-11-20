import {
  nounPluralKeys,
  nounSingularKeys,
  pluralForms,
  singularForms,
  verbFormKeys,
} from './inflection'
import { getAllPlayableWords } from './pool'
import { STOP_WORDS, answerTokens, normalizeAnswer } from './text'
import type {
  GuessMatchTarget,
  GuessMatchVerdict,
  GuessMatchWord,
} from './types'

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

/**
 * Every key accepted as exactly `answer`: itself, simple plurals/singulars
 * (on X in an "X of Y" phrase, see `nounPluralKeys`), and `-ing` ↔ base
 * verb spellings (`juggling` ↔ `juggle`, `tightrope walking` ↔ `tightrope
 * walk`, see `verbFormKeys`). A verb spelling is dropped when
 * `namesOtherWord` says it is a different playable word.
 */
function exactKeys(
  answer: string,
  namesOtherWord: (key: string) => boolean = () => false,
): Set<string> {
  const tokens = answerTokens(answer)
  const key = tokens.join('')
  const keys = new Set<string>()
  if (key.length === 0) return keys
  keys.add(key)
  for (const form of nounPluralKeys(tokens)) keys.add(form)
  for (const form of nounSingularKeys(tokens)) keys.add(form)
  for (const form of verbFormKeys(tokens)) {
    if (!namesOtherWord(form)) keys.add(form)
  }
  return keys
}

/** For every answer key of a word list: all keys of the words that own it. */
type KeyIndex = ReadonlyMap<string, readonly string[]>

const KEY_INDEXES = new WeakMap<readonly GuessMatchWord[], KeyIndex>()

function keyIndex(words: readonly GuessMatchWord[]): KeyIndex {
  const cached = KEY_INDEXES.get(words)
  if (cached !== undefined) return cached
  const index = new Map<string, string[]>()
  for (const word of words) {
    const keys = [word.term, ...(word.aliases ?? [])]
      .map(normalizeAnswer)
      .filter((key) => key.length > 0)
    for (const key of keys) {
      const siblings = index.get(key) ?? []
      for (const sibling of keys) {
        if (!siblings.includes(sibling)) siblings.push(sibling)
      }
      index.set(key, siblings)
    }
  }
  KEY_INDEXES.set(words, index)
  return index
}

/**
 * True when `key` (or its plural/singular) is an answer key of a different
 * word in play: one of `otherWords`, or of the curated catalog when none are
 * given. A word sharing any key with the target is the target itself (the
 * curated `tap dancing` with its alias `tap dance`).
 */
function otherWordChecker(
  ownKeys: ReadonlySet<string>,
  otherWords: readonly GuessMatchWord[] | undefined,
): (key: string) => boolean {
  const index = keyIndex(otherWords ?? getAllPlayableWords())
  const own = new Set(ownKeys)
  for (const key of ownKeys) {
    for (const sibling of index.get(key) ?? []) own.add(sibling)
  }
  return (key) =>
    [key, ...pluralForms(key), ...singularForms(key)].some(
      (form) => !own.has(form) && index.has(form),
    )
}

/**
 * Every guess key (`normalizeAnswer` of a guess) that `matchGuess` accepts as
 * `correct` for `target`: the term and aliases, their simple plurals and
 * singulars, and verb forms that do not name another word.
 */
export function acceptedGuessKeys(target: GuessMatchTarget): Set<string> {
  const answers = [target.term, ...(target.aliases ?? [])]
  const ownKeys = new Set(
    answers.map(normalizeAnswer).filter((key) => key.length > 0),
  )
  const namesOtherWord = otherWordChecker(ownKeys, target.otherWords)
  const accepted = new Set<string>()
  for (const answer of answers) {
    for (const key of exactKeys(answer, namesOtherWord)) accepted.add(key)
  }
  return accepted
}

function isCloseMatch(guessKey: string, answer: string): boolean {
  const tokens = answerTokens(answer)
  const answerKey = tokens.join('')
  const threshold = closeThreshold(answerKey)
  if (threshold === 0) return false
  return [answerKey, ...nounPluralKeys(tokens)].some(
    (form) => editDistance(guessKey, form, threshold) <= threshold,
  )
}

/**
 * Verb spellings of the answers that are not accepted only because they
 * name another word in play (`sneeze` for `sneezing` beside a `sneeze`
 * card). The guesser clearly has the idea, so they hear "close".
 */
function isBlockedVerbForm(
  guessKey: string,
  answers: readonly string[],
): boolean {
  return answers.some((answer) =>
    verbFormKeys(answerTokens(answer)).includes(guessKey),
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
 * hyphens, punctuation, leading articles, simple plurals (on X of an "X of
 * Y" phrase: `pots of gold`, not `pot of golds`), `-ing` ↔ base verb forms
 * of the last word (or of a leading verb before an article or preposition),
 * and aliases never cost a player a correct answer. A verb form that is
 * itself a different word in play (`otherWords`, else the curated catalog)
 * is not accepted (`wave` for `waving`) but earns `close`. A guess that
 * merely contains the answer among other words is not correct; it earns
 * `partial` for a multi-word answer and `wrong` otherwise. `close` otherwise
 * compares only against the answer and its plurals.
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
  if (answerKeys.length === 0) return 'wrong'

  if (acceptedGuessKeys(target).has(guessKey)) return 'correct'
  if (isBlockedVerbForm(guessKey, answers)) return 'close'
  if (
    answers.some(
      (answer) =>
        normalizeAnswer(answer).length > 0 && isCloseMatch(guessKey, answer),
    )
  ) {
    return 'close'
  }

  // One right word is feedback, not an answer, so no other-word check here.
  const words = partialWords(answers).map((word) => exactKeys(word))
  if (words.length > 0) {
    const hit = answerTokens(trimmed).some(
      (token) =>
        token.length >= MIN_PARTIAL_WORD_LENGTH &&
        words.some((forms) => forms.has(token)),
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
