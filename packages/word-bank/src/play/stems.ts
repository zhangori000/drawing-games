import { singularStem } from './inflection'
import { STOP_WORDS, answerTokens } from './text'

type CompoundPosition = 'start' | 'end' | 'either'

/**
 * Common heads and tails of English compound nouns. A token that starts or
 * ends with one of these (leaving at least `MIN_COMPOUND_REST` letters) joins
 * that family, so `cupcake` sits with `cup` and `cake`, `snowman` with `snow`
 * and `man`. Parts that often occur by accident inside unrelated words are
 * left out (`ice` in police, `corn` in unicorn, `sand` in sandwich) or only
 * count in the position where they are reliable (`man` only as a tail, since
 * mantis and mango are not men; `ball` only as a tail, since balloon).
 */
const COMPOUND_PARTS: ReadonlyMap<string, CompoundPosition> = new Map([
  ['air', 'start'],
  ['ball', 'end'],
  ['bed', 'either'],
  ['bell', 'either'],
  ['berry', 'either'],
  ['bird', 'either'],
  ['board', 'either'],
  ['boat', 'either'],
  ['book', 'either'],
  ['box', 'end'],
  ['bug', 'either'],
  ['cake', 'either'],
  ['coat', 'either'],
  ['cup', 'either'],
  ['day', 'end'],
  ['dog', 'either'],
  ['door', 'either'],
  ['fire', 'either'],
  ['fish', 'either'],
  ['flower', 'either'],
  ['fly', 'either'],
  ['foot', 'either'],
  ['fruit', 'either'],
  ['grass', 'either'],
  ['hand', 'either'],
  ['head', 'either'],
  ['horse', 'either'],
  ['house', 'either'],
  ['light', 'either'],
  ['man', 'end'],
  ['moon', 'either'],
  ['paper', 'either'],
  ['rain', 'either'],
  ['road', 'either'],
  ['sea', 'start'],
  ['ship', 'either'],
  ['shoe', 'either'],
  ['snow', 'either'],
  ['star', 'either'],
  ['stone', 'either'],
  ['sun', 'start'],
  ['tail', 'either'],
  ['tooth', 'either'],
  ['tree', 'either'],
  ['water', 'either'],
  ['wheel', 'either'],
  ['wood', 'either'],
  ['work', 'either'],
  ['worm', 'either'],
])

const MIN_COMPOUND_REST = 3
const MIN_STEM_TOKEN_LENGTH = 3

/**
 * Coarse word-family keys used to avoid offering `snowman` next to
 * `snowball`, or one team drawing `fire truck` while the other draws `fire`.
 * Tokens are singularized; compounds also contribute their known parts.
 */
export function wordStems(term: string): string[] {
  const stems = new Set<string>()
  for (const token of answerTokens(term)) {
    if (token.length < MIN_STEM_TOKEN_LENGTH || STOP_WORDS.has(token)) continue
    const singular = singularStem(token)
    stems.add(singular)
    for (const [part, position] of COMPOUND_PARTS) {
      if (singular.length - part.length < MIN_COMPOUND_REST) continue
      const atStart = position !== 'end' && singular.startsWith(part)
      const atEnd = position !== 'start' && singular.endsWith(part)
      if (atStart || atEnd) stems.add(part)
    }
  }
  return [...stems]
}

/** True when the two terms share at least one word-family stem. */
export function sharesWordStem(left: string, right: string): boolean {
  const leftStems = new Set(wordStems(left))
  return wordStems(right).some((stem) => leftStems.has(stem))
}
