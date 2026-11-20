import { describe, expect, it } from 'vitest'

import { pluralForms, singularForms, verbFormKeys } from '../play/inflection'
import { acceptedGuessKeys } from '../play/matching'
import { getAllPlayableWords, playableWordsForPack } from '../play/pool'
import { answerTokens, normalizeAnswer } from '../play/text'
import type { PlayableWord, WordPackData } from '../play/types'
import { WORD_DIFFICULTIES, type WordDifficulty } from '../types'
import {
  CURATED_PACKS,
  CUSTOM_PACK_ID,
  WORD_PACKS,
  getWordPackInfo,
  getWordPackName,
} from './index'

/*
 * Editorial quality gates for curated packs. Each test collects every
 * offender so a failure lists all words to fix at once.
 */

const PLAYABLE_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/
const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TERM_CHARS = /^[\p{Ll}' -]+$/u
const MIN_TERM_LENGTH = 2
const MAX_TERM_LENGTH = 28
const MAX_TERM_WORDS = 3
const MIN_DEFINITION_LENGTH = 12
const MAX_DEFINITION_LENGTH = 140
const MIN_PACK_WORDS = 60
const MIN_DIFFICULTY_SHARE = 0.15
/**
 * Enough of every difficulty that a pack used alone keeps dealing Balanced
 * hands (one easy, one medium, one hard per team, and same-difficulty
 * swaps) round after round, instead of running out of one difficulty after
 * the first round (as Phrases & Idioms once did with two easy words).
 */
const MIN_WORDS_PER_DIFFICULTY = 15

/** Per-pack overrides of the minimum share of each difficulty. */
const DIFFICULTY_SHARE_OVERRIDES: Readonly<
  Record<string, Partial<Record<WordDifficulty, number>>>
> = {
  // Idioms need a real medium tier too.
  phrases: { medium: 0.2 },
}

/** Brands and characters: drawable, but not ours to put in a word list. */
const BRAND_BLOCKLIST = [
  'adidas',
  'barbie',
  'batman',
  'coca cola',
  'disney',
  'fortnite',
  'google',
  'harry potter',
  'iphone',
  'lego',
  'marvel',
  'mcdonalds',
  'mickey mouse',
  'minecraft',
  'nike',
  'nintendo',
  'pepsi',
  'pikachu',
  'playstation',
  'pokemon',
  'spider man',
  'starbucks',
  'superman',
  'xbox',
]

/** Not for a family party game. Kept deliberately short and mild. */
const CONTENT_BLOCKLIST = [
  'cigarette',
  'cocaine',
  'crap',
  'damn',
  'drunk',
  'heroin',
  'marijuana',
  'murder',
  'naked',
  'nazi',
  'nude',
  'porn',
  'sex',
  'sexy',
  'suicide',
  'vodka',
  'whiskey',
]

const BLOCKED_KEYS = new Set(
  [...BRAND_BLOCKLIST, ...CONTENT_BLOCKLIST].map(normalizeAnswer),
)

interface PackWord {
  readonly pack: WordPackData
  readonly word: PlayableWord
}

const PACK_WORDS: readonly PackWord[] = CURATED_PACKS.flatMap((pack) =>
  playableWordsForPack(pack).map((word) => ({ pack, word })),
)

function label({ word }: PackWord): string {
  return `${word.id} (${JSON.stringify(word.term)})`
}

/** Every spelling `matchGuess` treats as the same answer as `key`. */
function equivalentKeys(key: string): string[] {
  return [key, ...pluralForms(key), ...singularForms(key)]
}

/** Joined keys of every run of 1–4 consecutive tokens in `text`. */
function tokenWindows(text: string): string[] {
  const tokens = answerTokens(text)
  const windows: string[] = []
  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = 1; size <= 4 && start + size <= tokens.length; size += 1) {
      windows.push(tokens.slice(start, start + size).join(''))
    }
  }
  return windows
}

function containsBlocked(text: string): string | null {
  for (const window of tokenWindows(text)) {
    const hit = equivalentKeys(window).find((key) => BLOCKED_KEYS.has(key))
    if (hit !== undefined) return hit
  }
  return null
}

/**
 * Problems with a term or alias spelling, or null if it is fine. Aliases may
 * be longer phrasings (`corn on the cob`), so only terms cap the word count.
 */
function spellingProblem(
  text: string,
  maxWords = Number.POSITIVE_INFINITY,
): string | null {
  const length = Array.from(text).length
  if (length < MIN_TERM_LENGTH || length > MAX_TERM_LENGTH) {
    return `length ${length} outside ${MIN_TERM_LENGTH}-${MAX_TERM_LENGTH}`
  }
  if (text !== text.normalize('NFC')) return 'not NFC-normalized'
  if (!TERM_CHARS.test(text)) {
    return 'only lowercase letters, spaces, hyphens, apostrophes'
  }
  if (/^[ '-]|[ -]$/.test(text)) return 'starts or ends with a separator'
  if (/ {2}|--|- | -/.test(text)) return 'doubled separator'
  if (text.split(' ').length > maxWords) return `more than ${maxWords} words`
  if (normalizeAnswer(text).length < MIN_TERM_LENGTH) return 'too few letters'
  return null
}

function definitionProblem(word: PlayableWord): string | null {
  const definition = word.definition
  // Only host custom words go without one.
  if (definition === null) return 'missing definition'
  const length = Array.from(definition).length
  if (length < MIN_DEFINITION_LENGTH || length > MAX_DEFINITION_LENGTH) {
    return `length ${length} outside ${MIN_DEFINITION_LENGTH}-${MAX_DEFINITION_LENGTH}`
  }
  if (definition !== definition.trim()) return 'surrounding whitespace'
  if (!/^\p{Lu}/u.test(definition)) return 'must start with a capital letter'
  if (!/[^.]\.$/.test(definition)) return 'must end with a single period'
  if (/[!?]|\.\s/.test(definition)) return 'must be exactly one sentence'
  const termKeys = new Set([
    ...equivalentKeys(normalizeAnswer(word.term)),
    ...verbFormKeys(answerTokens(word.term)),
  ])
  if (tokenWindows(definition).some((window) => termKeys.has(window))) {
    return 'gives away the term'
  }
  return null
}

describe('pack metadata', () => {
  it('lists curated packs in the same order as WORD_PACKS', () => {
    expect(CURATED_PACKS.map((pack) => pack.id)).toEqual(
      WORD_PACKS.map((pack) => pack.id),
    )
  })

  it('has unique, slug-safe pack ids that never use the custom id', () => {
    const ids = WORD_PACKS.map((pack) => pack.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(PACK_ID)
      expect(id).not.toBe(CUSTOM_PACK_ID)
    }
  })

  it('names and describes every pack', () => {
    for (const pack of WORD_PACKS) {
      expect(pack.name.trim()).toBe(pack.name)
      expect(pack.name.length).toBeGreaterThan(0)
      expect(pack.description).toMatch(/^\p{Lu}.{10,}\.$/u)
      expect(getWordPackInfo(pack.id)).toBe(pack)
      expect(getWordPackName(pack.id)).toBe(pack.name)
    }
    expect(getWordPackName(CUSTOM_PACK_ID)).toBe('Custom')
    expect(getWordPackName('unknown-pack')).toBe('unknown-pack')
  })

  it('enables at least one pack by default', () => {
    expect(WORD_PACKS.some((pack) => pack.defaultEnabled)).toBe(true)
  })
})

describe('playable ids', () => {
  it('are unique and match <pack>/<slug>', () => {
    const seen = new Map<string, string>()
    const problems: string[] = []
    for (const entry of PACK_WORDS) {
      const { word, pack } = entry
      if (!PLAYABLE_ID.test(word.id)) problems.push(`${label(entry)}: bad id`)
      if (word.packId !== pack.id) problems.push(`${label(entry)}: pack id`)
      const previous = seen.get(word.id)
      if (previous !== undefined) {
        problems.push(`${label(entry)}: duplicates ${previous}`)
      }
      seen.set(word.id, label(entry))
    }
    expect(problems).toEqual([])
  })

  it('match the catalog index', () => {
    expect(getAllPlayableWords().map((word) => word.id)).toEqual(
      PACK_WORDS.map(({ word }) => word.id),
    )
  })
})

describe('answers across all packs', () => {
  it('never share an answer key', () => {
    const owners = new Map<string, string>()
    const problems: string[] = []
    for (const entry of PACK_WORDS) {
      const key = normalizeAnswer(entry.word.term)
      const owner = owners.get(key)
      if (owner !== undefined) {
        problems.push(`${label(entry)} repeats ${owner}`)
      }
      owners.set(key, label(entry))
    }
    expect(problems).toEqual([])
  })

  it('are never just a plural or singular of another word', () => {
    const owners = new Map(
      PACK_WORDS.map((entry) => [normalizeAnswer(entry.word.term), entry]),
    )
    const problems: string[] = []
    for (const entry of PACK_WORDS) {
      const key = normalizeAnswer(entry.word.term)
      for (const form of [...pluralForms(key), ...singularForms(key)]) {
        const other = owners.get(form)
        if (other !== undefined && other !== entry) {
          problems.push(`${label(entry)} ~ ${label(other)}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('are never accepted as a guess for another word', () => {
    const owners = new Map<string, PackWord>()
    for (const entry of PACK_WORDS) {
      for (const answer of [entry.word.term, ...entry.word.aliases]) {
        owners.set(normalizeAnswer(answer), entry)
      }
    }
    const problems: string[] = []
    for (const entry of PACK_WORDS) {
      for (const key of acceptedGuessKeys(entry.word)) {
        const other = owners.get(key)
        if (other !== undefined && other !== entry) {
          problems.push(`${label(entry)} accepts ${key} of ${label(other)}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('have aliases that belong to exactly one word', () => {
    const termOwners = new Map(
      PACK_WORDS.map((entry) => [normalizeAnswer(entry.word.term), entry]),
    )
    const aliasOwners = new Map<string, PackWord>()
    const problems: string[] = []
    for (const entry of PACK_WORDS) {
      const ownKey = normalizeAnswer(entry.word.term)
      const ownAliases = new Set<string>()
      for (const alias of entry.word.aliases) {
        const aliasKey = normalizeAnswer(alias)
        const where = `${label(entry)} alias ${JSON.stringify(alias)}`
        const spelling = spellingProblem(alias)
        if (spelling !== null) problems.push(`${where}: ${spelling}`)
        if (equivalentKeys(ownKey).includes(aliasKey)) {
          problems.push(`${where}: already accepted as the term`)
        }
        if (ownAliases.has(aliasKey)) problems.push(`${where}: repeated`)
        ownAliases.add(aliasKey)
        for (const form of equivalentKeys(aliasKey)) {
          const term = termOwners.get(form)
          if (term !== undefined && term !== entry) {
            problems.push(`${where}: is the answer of ${label(term)}`)
          }
          const other = aliasOwners.get(form)
          if (other !== undefined && other !== entry) {
            problems.push(`${where}: also an alias of ${label(other)}`)
          }
        }
        aliasOwners.set(aliasKey, entry)
      }
    }
    expect(problems).toEqual([])
  })
})

describe('terms', () => {
  it('are 2-28 lowercase letters with at most 3 words', () => {
    const problems = PACK_WORDS.flatMap((entry) => {
      const problem = spellingProblem(entry.word.term, MAX_TERM_WORDS)
      return problem === null ? [] : [`${label(entry)}: ${problem}`]
    })
    expect(problems).toEqual([])
  })

  it('use a known difficulty', () => {
    const problems = PACK_WORDS.filter(
      ({ word }) => !WORD_DIFFICULTIES.includes(word.difficulty),
    ).map(label)
    expect(problems).toEqual([])
  })
})

describe('definitions', () => {
  it('are one 12-140 character sentence that does not give the term away', () => {
    const problems = PACK_WORDS.flatMap((entry) => {
      const problem = definitionProblem(entry.word)
      return problem === null ? [] : [`${label(entry)}: ${problem}`]
    })
    expect(problems).toEqual([])
  })
})

describe('blocklist', () => {
  it('keeps brands and inappropriate words out of terms, aliases, and definitions', () => {
    const problems: string[] = []
    for (const entry of PACK_WORDS) {
      const texts = [
        entry.word.term,
        ...entry.word.aliases,
        entry.word.definition ?? '',
      ]
      for (const text of texts) {
        const hit = containsBlocked(text)
        if (hit !== null) problems.push(`${label(entry)}: ${hit}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('matches blocked words however they are spaced or pluralized', () => {
    expect(containsBlocked('A Spider-Man costume.')).toBe('spiderman')
    expect(containsBlocked('two cigarettes')).toBe('cigarette')
    expect(containsBlocked('LEGO bricks')).toBe('lego')
    expect(containsBlocked('a seashell from Sussex')).toBeNull()
    expect(containsBlocked('a snowman')).toBeNull()
  })
})

describe.each(CURATED_PACKS.map((pack) => [pack.id, pack] as const))(
  'pack %s',
  (packId, pack) => {
    it(`has at least ${MIN_PACK_WORDS} words`, () => {
      expect(pack.words.length).toBeGreaterThanOrEqual(MIN_PACK_WORDS)
    })

    it('spreads its words across difficulties', () => {
      const total = pack.words.length
      const overrides = DIFFICULTY_SHARE_OVERRIDES[packId] ?? {}
      const shortfalls: string[] = []
      for (const difficulty of WORD_DIFFICULTIES) {
        const count = pack.words.filter(
          (word) => word.difficulty === difficulty,
        ).length
        const minimum = overrides[difficulty] ?? MIN_DIFFICULTY_SHARE
        if (total === 0 || count / total < minimum) {
          shortfalls.push(
            `${difficulty}: ${count}/${total} < ${Math.round(minimum * 100)}%`,
          )
        }
      }
      expect(shortfalls).toEqual([])
    })

    it(`can deal Balanced hands on its own (${MIN_WORDS_PER_DIFFICULTY}+ of each difficulty)`, () => {
      const thin = WORD_DIFFICULTIES.flatMap((difficulty) => {
        const count = pack.words.filter(
          (word) => word.difficulty === difficulty,
        ).length
        return count < MIN_WORDS_PER_DIFFICULTY
          ? [`${difficulty}: ${count}`]
          : []
      })
      expect(thin).toEqual([])
    })
  },
)
