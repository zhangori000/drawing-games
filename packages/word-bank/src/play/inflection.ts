/**
 * Simple English plural handling over answer keys (joined, folded tokens), so
 * the inflection always applies to the last word: `hermitcrab` ↔
 * `hermitcrabs`.
 *
 * Accepting a plural guess for a singular answer is always safe because the
 * guess is longer than the answer. Accepting a singular guess for a plural
 * answer means accepting a shorter string, so `singularForms` only undoes
 * unambiguous endings and never turns `bus` into `bu` or `glass` into `glas`.
 */

interface IrregularPlural {
  readonly singular: string
  readonly plural: string
  /** Also applies as the tail of a compound (`snowman` → `snowmen`). */
  readonly compound: boolean
}

const IRREGULAR_PLURALS: readonly IrregularPlural[] = [
  { singular: 'man', plural: 'men', compound: true },
  { singular: 'woman', plural: 'women', compound: true },
  { singular: 'mouse', plural: 'mice', compound: true },
  { singular: 'goose', plural: 'geese', compound: true },
  { singular: 'tooth', plural: 'teeth', compound: true },
  { singular: 'foot', plural: 'feet', compound: true },
  { singular: 'child', plural: 'children', compound: true },
  { singular: 'person', plural: 'people', compound: true },
  { singular: 'ox', plural: 'oxen', compound: false },
  { singular: 'die', plural: 'dice', compound: false },
  { singular: 'cactus', plural: 'cacti', compound: false },
  { singular: 'octopus', plural: 'octopi', compound: false },
  { singular: 'fungus', plural: 'fungi', compound: false },
]

/** A compound needs a real head word before the irregular tail. */
const MIN_COMPOUND_HEAD = 3
/** Shortest stem left after removing a plural ending. */
const MIN_SINGULAR_LENGTH = 3

/** Endings where a trailing `s` belongs to the singular (bus, glass, iris). */
const SINGULAR_S_ENDINGS = /(?:ss|us|is|as|os)$/
/** Plural `-es` after a sibilant; the bare `-s` strip would leave junk. */
const SIBILANT_ES = /(?:sses|xes|ches|shes|zzes)$/

function swapIrregular(
  key: string,
  from: 'singular' | 'plural',
  to: 'singular' | 'plural',
): string[] {
  const results: string[] = []
  for (const entry of IRREGULAR_PLURALS) {
    const source = entry[from]
    if (key === source) {
      results.push(entry[to])
    } else if (
      entry.compound &&
      key.endsWith(source) &&
      key.length - source.length >= MIN_COMPOUND_HEAD
    ) {
      results.push(key.slice(0, -source.length) + entry[to])
    }
  }
  return results
}

/** Plural spellings accepted for a singular answer key. */
export function pluralForms(key: string): string[] {
  if (key.length === 0) return []
  const forms = new Set<string>()
  // `bus` → `buses`, never `buss`; `tomato` takes either ending.
  if (!/(?:s|x|z|ch|sh)$/.test(key)) forms.add(`${key}s`)
  if (/(?:s|x|z|ch|sh|o)$/.test(key)) forms.add(`${key}es`)
  if (/[^aeiou]y$/.test(key)) forms.add(`${key.slice(0, -1)}ies`)
  if (key.endsWith('fe')) forms.add(`${key.slice(0, -2)}ves`)
  else if (/[^f]f$/.test(key)) forms.add(`${key.slice(0, -1)}ves`)
  for (const form of swapIrregular(key, 'singular', 'plural')) forms.add(form)
  forms.delete(key)
  return [...forms]
}

/** Singular spellings accepted for an answer key that looks plural. */
export function singularForms(key: string): string[] {
  const forms = new Set<string>(swapIrregular(key, 'plural', 'singular'))
  const add = (form: string) => {
    if (form.length >= MIN_SINGULAR_LENGTH) forms.add(form)
  }
  if (key.endsWith('ies')) {
    add(`${key.slice(0, -3)}y`)
  } else if (key.endsWith('ves')) {
    add(`${key.slice(0, -3)}f`)
    add(`${key.slice(0, -3)}fe`)
    add(key.slice(0, -1))
  } else if (SIBILANT_ES.test(key)) {
    add(key.slice(0, -2))
  } else if (key.endsWith('s') && !SINGULAR_S_ENDINGS.test(key)) {
    add(key.slice(0, -1))
  }
  forms.delete(key)
  return [...forms]
}

/**
 * One canonical singular for grouping word families (not for accepting
 * answers): `berries` → `berry`, `boxes` → `box`, `cats` → `cat`.
 */
export function singularStem(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (SIBILANT_ES.test(token)) return token.slice(0, -2)
  if (
    token.endsWith('s') &&
    !SINGULAR_S_ENDINGS.test(token) &&
    token.length > MIN_SINGULAR_LENGTH
  ) {
    return token.slice(0, -1)
  }
  return token
}
