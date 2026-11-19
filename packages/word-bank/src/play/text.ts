const LEADING_ARTICLES = new Set(['a', 'an', 'the'])

/** Function words that never identify a word family or a "partial" hit. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'onto',
  'or',
  'the',
  'to',
  'was',
  'with',
])

/** Latin letters that NFKD does not decompose into a base letter + mark. */
const LETTER_FOLDS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
}

/**
 * Case- and accent-insensitive form: lowercase, compatibility-decomposed
 * (fullwidth letters and ligatures become plain letters), Latin diacritics
 * removed. Other scripts are recomposed and kept so custom words match.
 */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßæœøłđðþı]/g, (char) => LETTER_FOLDS[char] ?? char)
    .normalize('NFC')
}

/**
 * Folded word tokens. Apostrophes vanish (`dragon's` → `dragons`), `&` reads
 * as `and`, and any other non-letter/digit splits words. Leading articles are
 * dropped unless they are the only token.
 */
export function answerTokens(text: string): string[] {
  const tokens = foldText(text)
    .replace(/&/g, ' and ')
    .replace(/['’‘`ʼ]/g, '')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => token.length > 0)
  while (tokens.length > 1 && LEADING_ARTICLES.has(tokens[0] as string)) {
    tokens.shift()
  }
  return tokens
}

/**
 * Canonical comparison key: tokens joined without separators, so `ice cream`,
 * `ice-cream`, `Ice  Cream`, and `icecream` all share the key `icecream`.
 */
export function normalizeAnswer(text: string): string {
  return answerTokens(text).join('')
}
