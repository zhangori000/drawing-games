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
 * Index of the head noun of an "X of Y" phrase (`pot of gold`, `bag of
 * chips`, `lord of the rings`), whose plural goes on X, or null.
 */
function ofPhraseHead(tokens: readonly string[]): number | null {
  return tokens.length >= 3 && tokens[1] === 'of' ? 0 : null
}

function nounForms(
  tokens: readonly string[],
  inflect: (key: string) => string[],
): string[] {
  const key = tokens.join('')
  if (key.length === 0) return []
  const head = ofPhraseHead(tokens)
  if (head === null) return inflect(key)
  const forms = inflect(tokens[head] as string).map((form) =>
    tokens.map((token, index) => (index === head ? form : token)).join(''),
  )
  return [...new Set(forms)].filter((form) => form !== key)
}

/**
 * Plural answer keys of a whole answer (its folded tokens): the last word
 * takes the plural (`hermit crab` → `hermitcrabs`), except in an "X of Y"
 * phrase, where X does (`pot of gold` → `potsofgold`, never `potofgolds`).
 */
export function nounPluralKeys(tokens: readonly string[]): string[] {
  return nounForms(tokens, pluralForms)
}

/** Singular answer keys of a whole answer, by the rule of `nounPluralKeys`. */
export function nounSingularKeys(tokens: readonly string[]): string[] {
  return nounForms(tokens, singularForms)
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

/*
 * Verb forms. Many action and sport answers are gerunds (`juggling`,
 * `tightrope walking`), and a guesser who types the base verb (`juggle`,
 * `tightrope walk`) clearly has the word. `ingForms`/`baseVerbForms` map one
 * token between `-ing` and base spellings; `verbFormKeys` decides which
 * token of an answer is the verb.
 *
 * Producing an `-ing` form makes the guess longer than the answer, so it is
 * always safe in the "no stubs" sense. Removing `-ing` accepts a shorter
 * guess, so `baseVerbForms` only undoes the ending when the rest still looks
 * like a verb: at least `MIN_VERB_STEM` letters with a vowel (`king`, `ring`,
 * `thing`, `spring` stay whole) and not a known `-ing` noun whose stem is a
 * different word (`wedding` is not `wed`, `icing` is not `ice`). Whether a
 * derived spelling names *another* playable word (`waving` vs. `wave`) is
 * checked by the matcher, which knows the pool. No dictionary is involved,
 * so a rare stem may also yield a harmless non-word (`sunbath` beside
 * `sunbathe`); never a shorter real word from the noun list.
 */

/** Shortest base verb accepted on its own (`run`, `ski`, `lie`). */
export const MIN_VERB_STEM = 3

/**
 * Common `-ing` nouns (and one adjective) that are not the verb their stem
 * suggests, so stripping `-ing` would accept a different word or a stub.
 */
const NON_VERB_ING_WORDS: ReadonlySet<string> = new Set([
  'awning',
  'bedding',
  'building',
  'ceiling',
  'charming',
  'clothing',
  'crossing',
  'darling',
  'dressing',
  'duckling',
  'dumpling',
  'earring',
  'evening',
  'frosting',
  'gosling',
  'herring',
  'icing',
  'inning',
  'landing',
  'lightning',
  'lining',
  'morning',
  'offspring',
  'pudding',
  'railing',
  'sapling',
  'seasoning',
  'seedling',
  'shilling',
  'sibling',
  'siding',
  'starling',
  'sterling',
  'stocking',
  'stuffing',
  'thanksgiving',
  'topping',
  'viking',
  'wedding',
])

const LATIN_WORD = /^[a-z]+$/
const HAS_VOWEL = /[aeiouy]/
/** One vowel group: `run`, `writ`, `skat`, `styl` (y counts as a vowel). */
const ONE_SYLLABLE = /^[^aeiouy]*[aeiouy]+[^aeiouy]*$/
/** Ends in a single short vowel and a single consonant: `run`, `visit`. */
const SHORT_VOWEL_CONSONANT = /(?:^|[^aeiou])[aeiou][^aeiouwxy]$/
/** The same on a stripped stem, where y may be the vowel: `styl`, `typ`. */
const STEM_VOWEL_CONSONANT = /(?:^|[^aeiouy])[aeiouy][^aeiouwxy]$/
/** Multi-syllable endings that neither double nor drop a silent e. */
const UNSTRESSED_ENDING = /(?:er|en|on|el)$/
/** Stem endings that only occur before a silent e (`juggl`, `danc`, `div`). */
const SILENT_E_ONLY = /(?:v|[^aeiouylrw]l|dg|[rl]g|c|[aeiou]z|u)$/
/** Stem endings that may or may not have had a silent e (`bath(e)`). */
const SILENT_E_MAYBE = /(?:th|[aeiou]s|[aeu]ng)$/

export interface VerbFormOptions {
  /**
   * The token is certainly a verb (it starts a verb phrase such as
   * `building a sandcastle`), so the `-ing` noun list does not apply.
   */
  readonly knownVerb?: boolean
}

/** True for tokens shaped like an `-ing` form: `running`, `king` is not. */
export function isIngForm(token: string): boolean {
  return token.endsWith('ing') && HAS_VOWEL.test(token.slice(0, -3))
}

/**
 * `-ing` spellings of a base verb token: `run` → `running`, `dance` →
 * `dancing`, `lie` → `lying`, `ski` → `skiing`, `picnic` → `picnicking`.
 * Both doubled and plain spellings are offered where English varies
 * (`visit` → `visiting`/`visitting`). Tokens that already look like an
 * `-ing` form or a plural, non-Latin words, stubs, and spellings that are
 * known `-ing` nouns (`bed` → `bedding`) get none.
 */
export function ingForms(
  token: string,
  options: VerbFormOptions = {},
): string[] {
  if (!LATIN_WORD.test(token) || token.length < MIN_VERB_STEM) return []
  if (!HAS_VOWEL.test(token) || isIngForm(token)) return []
  if (singularForms(token).length > 0) return []
  const forms = new Set<string>()
  const last = token.at(-1) as string
  if (token.endsWith('ie')) {
    forms.add(`${token.slice(0, -2)}ying`)
  } else if (/(?:ee|oe|ye)$/.test(token)) {
    forms.add(`${token}ing`)
  } else if (token.endsWith('e')) {
    forms.add(`${token.slice(0, -1)}ing`)
  } else if (token.endsWith('c')) {
    forms.add(`${token}king`)
    forms.add(`${token}ing`)
  } else if (SHORT_VOWEL_CONSONANT.test(token)) {
    const doubled = `${token}${last}ing`
    if (ONE_SYLLABLE.test(token)) {
      forms.add(doubled)
    } else {
      forms.add(`${token}ing`)
      if (!UNSTRESSED_ENDING.test(token)) forms.add(doubled)
    }
  } else {
    forms.add(`${token}ing`)
  }
  const result = [...forms]
  if (options.knownVerb === true) return result
  return result.filter((form) => !NON_VERB_ING_WORDS.has(form))
}

function stemCandidates(stem: string): string[] {
  // `lying`, `tying`, `dying`: the `ie` became `y`.
  if (/^[^aeiouy]y$/.test(stem)) return [`${stem[0]}ie`]
  const last = stem.at(-1) as string
  if (stem.length >= 2 && stem.at(-2) === last && !/[aeiouy]/.test(last)) {
    // `spill`, `kiss`, `sniff`, `buzz` keep the pair; `running` → `run`.
    return 'lsfz'.includes(last) ? [stem] : [stem.slice(0, -1)]
  }
  if (/[aeioy]$/.test(stem)) return [stem]
  if (SILENT_E_ONLY.test(stem)) return [`${stem}e`]
  if (STEM_VOWEL_CONSONANT.test(stem)) {
    // One syllable without doubling means a silent e: `writ` → `write`.
    if (ONE_SYLLABLE.test(stem)) return [`${stem}e`]
    if (UNSTRESSED_ENDING.test(stem)) return [stem]
    return [stem, `${stem}e`]
  }
  if (SILENT_E_MAYBE.test(stem)) return [stem, `${stem}e`]
  return [stem]
}

/**
 * Base-verb spellings of an `-ing` token: `running` → `run`, `dancing` →
 * `dance`, `lying` → `lie`, `juggling` → `juggle`, `skiing` → `ski`. Empty
 * for words that only end in the letters (`king`, `spring`) and for known
 * `-ing` nouns (`wedding`, `ceiling`, `pudding`).
 */
export function baseVerbForms(
  token: string,
  options: VerbFormOptions = {},
): string[] {
  if (!LATIN_WORD.test(token) || !isIngForm(token)) return []
  if (options.knownVerb !== true && NON_VERB_ING_WORDS.has(token)) return []
  return stemCandidates(token.slice(0, -3)).filter(
    (form) => form.length >= MIN_VERB_STEM && HAS_VOWEL.test(form),
  )
}

/**
 * Function words after which a leading token is certainly a verb, so a
 * phrase like `flying a kite` or `break the ice` takes the other verb form.
 */
const VERB_PHRASE_MARKERS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'at',
  'down',
  'for',
  'her',
  'his',
  'in',
  'into',
  'my',
  'off',
  'on',
  'onto',
  'our',
  'out',
  'over',
  'the',
  'their',
  'to',
  'up',
  'with',
  'your',
])

/**
 * Verb spellings of a whole answer, as answer keys (tokens joined):
 *
 * - the last word, either way: `tightrope walking` ↔ `tightrope walk`,
 *   `ice skate` → `ice skating` (base → `-ing` only when no word of the
 *   answer is already an `-ing` form, so `swimming pool` stays a noun);
 * - a leading verb of a verb phrase, either way, when the next word is an
 *   article, possessive, or preposition (`flying a kite` ↔ `fly a kite`,
 *   `break the ice` → `breaking the ice`), or for a leading `-ing` verb a
 *   plural object (`brushing teeth` → `brush teeth`).
 *
 * Callers still decide whether a spelling names some other word.
 */
export function verbFormKeys(tokens: readonly string[]): string[] {
  if (tokens.length === 0) return []
  const swapped = (index: number, form: string) =>
    tokens.map((token, at) => (at === index ? form : token)).join('')
  const lastIndex = tokens.length - 1
  const last = tokens[lastIndex] as string
  const first = tokens[0] as string
  const second = tokens[1]
  const leadingVerb =
    second !== undefined &&
    (VERB_PHRASE_MARKERS.has(second) ||
      (isIngForm(first) && singularForms(second).length > 0))
  const keys: string[] = []
  if (isIngForm(last)) {
    for (const form of baseVerbForms(last)) keys.push(swapped(lastIndex, form))
  } else if (!leadingVerb && !tokens.some(isIngForm)) {
    for (const form of ingForms(last)) keys.push(swapped(lastIndex, form))
  }
  if (leadingVerb) {
    const forms = isIngForm(first)
      ? baseVerbForms(first, { knownVerb: true })
      : ingForms(first, { knownVerb: true })
    for (const form of forms) keys.push(swapped(0, form))
  }
  return keys
}
