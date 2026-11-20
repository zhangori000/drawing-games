import { describe, expect, it } from 'vitest'

import { CURATED_PACKS, CUSTOM_PACK_ID, WORD_PACKS } from '../packs'
import {
  answerKeyForWordId,
  buildWordPool,
  canonicalWordId,
  customPlayableWords,
  getAllPlayableWords,
  getPackWordCount,
  getPlayableWordById,
  LEGACY_WORD_IDS,
  playableWordsForPack,
  slugifyTerm,
} from './pool'
import { selectDraftOptions } from './selection'
import { normalizeAnswer } from './text'

const ALL_PACK_IDS = WORD_PACKS.map((pack) => pack.id)

describe('slugifyTerm', () => {
  it.each([
    ['cat', 'cat'],
    ['Hermit Crab', 'hermit-crab'],
    ["Jack-o'-Lantern", 'jack-o-lantern'],
    ["dragon's egg", 'dragons-egg'],
    ['Crème Brûlée', 'creme-brulee'],
    ['R&B', 'r-and-b'],
    ['  hello   world  ', 'hello-world'],
    ['Straße', 'strasse'],
    ['🎉', ''],
  ])('%j → %j', (term, slug) => {
    expect(slugifyTerm(term)).toBe(slug)
  })
})

describe('customPlayableWords', () => {
  it('turns host words into unrated medium custom words with custom/<slug> ids', () => {
    expect(customPlayableWords(['  Eiffel   Tower ', 'Grandma'])).toEqual([
      {
        id: 'custom/eiffel-tower',
        term: 'Eiffel Tower',
        difficulty: 'medium',
        packId: CUSTOM_PACK_ID,
        definition: null,
        aliases: [],
        unrated: true,
      },
      expect.objectContaining({ id: 'custom/grandma', term: 'Grandma' }),
    ])
  })

  it('gives tagged words their difficulty, with the id of the bare term', () => {
    const words = customPlayableWords([
      'paper shredder|hard',
      'kite | Easy',
      'pizza night|medium',
      'Grandma',
    ])
    expect(
      words.map((word) => [word.id, word.term, word.difficulty, word.unrated]),
    ).toEqual([
      ['custom/paper-shredder', 'paper shredder', 'hard', undefined],
      ['custom/kite', 'kite', 'easy', undefined],
      ['custom/pizza-night', 'pizza night', 'medium', undefined],
      ['custom/grandma', 'Grandma', 'medium', true],
    ])
    expect(words.every((word) => word.definition === null)).toBe(true)
    // Re-tagging keeps the id, so no-repeat memory still knows the word.
    expect(customPlayableWords(['kite'])[0]?.id).toBe('custom/kite')
  })

  it('drops entries with a malformed tag and keeps the first of a re-tagged word', () => {
    const words = customPlayableWords([
      'kite|huge',
      'kite|',
      'a|b|hard',
      'kite|hard',
      'Kite|easy',
    ])
    expect(words.map((word) => [word.term, word.difficulty])).toEqual([
      ['kite', 'hard'],
    ])
  })

  it('keeps the first of words that share a slug or an answer key', () => {
    const words = customPlayableWords([
      'ice cream',
      'Ice-Cream',
      'ICE  CREAM',
      'icecream',
      'the ice cream',
      'pizza',
    ])
    expect(words.map((word) => word.id)).toEqual([
      'custom/ice-cream',
      'custom/pizza',
    ])
    expect(words[0]?.term).toBe('ice cream')
  })

  it('drops words without letters or digits and strips control characters', () => {
    const words = customPlayableWords([
      '',
      '   ',
      '🎉🎉',
      '!!',
      'tab\there\u0007',
    ])
    expect(words.map((word) => [word.id, word.term])).toEqual([
      ['custom/tab-here', 'tab here'],
    ])
  })

  it('gives non-Latin words stable, distinct ids', () => {
    const first = customPlayableWords(['猫', '犬', 'café 猫'])
    const again = customPlayableWords(['猫', '犬', 'café 猫'])
    expect(first.map((word) => word.id)).toEqual(again.map((word) => word.id))
    expect(new Set(first.map((word) => word.id)).size).toBe(3)
    for (const word of first) {
      expect(word.id).toMatch(/^custom\/[a-z0-9-]+$/)
    }
    expect(first[2]?.id.startsWith('custom/cafe--')).toBe(true)
  })

  it('scores untagged words at an explicit default difficulty', () => {
    expect(customPlayableWords(['kite'], 'hard')[0]).toMatchObject({
      difficulty: 'hard',
      unrated: true,
    })
  })
})

describe('answerKeyForWordId', () => {
  it('resolves curated ids through the catalog', () => {
    const word = getAllPlayableWords()[0]
    expect(word).toBeDefined()
    if (word === undefined) return
    expect(answerKeyForWordId(word.id)).toBe(normalizeAnswer(word.term))
  })

  it('resolves plain custom ids from their slug', () => {
    expect(answerKeyForWordId('custom/ice-cream')).toBe('icecream')
    expect(answerKeyForWordId('custom/cat')).toBe('cat')
  })

  it('returns null for hashed, empty, or unknown ids', () => {
    const [hashed] = customPlayableWords(['猫'])
    expect(answerKeyForWordId(hashed?.id ?? '')).toBeNull()
    expect(answerKeyForWordId('custom/')).toBeNull()
    expect(answerKeyForWordId('nope/whatever')).toBeNull()
  })
})

describe('curated catalog access', () => {
  it('derives ids from pack id and term slug', () => {
    const words = playableWordsForPack({
      id: 'demo',
      words: [
        { term: 'hermit crab', difficulty: 'hard', definition: 'A crab.' },
        {
          term: 'bicycle',
          difficulty: 'easy',
          definition: 'A bike.',
          aliases: ['bike'],
        },
      ],
    })
    expect(words.map((word) => word.id)).toEqual([
      'demo/hermit-crab',
      'demo/bicycle',
    ])
    expect(words[0]?.aliases).toEqual([])
    expect(words[1]?.aliases).toEqual(['bike'])
  })

  it('indexes every curated word by id and counts words per pack', () => {
    const all = getAllPlayableWords()
    expect(all.length).toBe(
      CURATED_PACKS.reduce((sum, pack) => sum + pack.words.length, 0),
    )
    for (const word of all) expect(getPlayableWordById(word.id)).toBe(word)
    for (const pack of CURATED_PACKS) {
      expect(getPackWordCount(pack.id)).toBe(pack.words.length)
    }
    expect(getPlayableWordById('animals/not-a-real-word')).toBeUndefined()
    expect(getPackWordCount('not-a-pack')).toBe(0)
  })
})

describe('buildWordPool', () => {
  const firstPack = CURATED_PACKS[0]
  const secondPack = CURATED_PACKS[1]

  it('includes only enabled packs and ignores unknown pack ids', () => {
    if (firstPack === undefined) throw new Error('no curated packs')
    const pool = buildWordPool({
      packIds: [firstPack.id, 'no-such-pack'],
      customWords: [],
      customWordsMode: 'mix',
    })
    expect(pool.length).toBe(firstPack.words.length)
    expect(new Set(pool.map((word) => word.packId))).toEqual(
      new Set([firstPack.id]),
    )
  })

  it('mixes custom words after curated words', () => {
    if (firstPack === undefined) throw new Error('no curated packs')
    const pool = buildWordPool({
      packIds: [firstPack.id],
      customWords: ['zorblax', 'quuxle'],
      customWordsMode: 'mix',
    })
    expect(pool.slice(-2).map((word) => word.id)).toEqual([
      'custom/zorblax',
      'custom/quuxle',
    ])
  })

  it('drops a custom word that repeats an enabled curated term', () => {
    const curated = getAllPlayableWords()[0]
    if (curated === undefined) throw new Error('no curated words')
    const pool = buildWordPool({
      packIds: [curated.packId],
      customWords: [curated.term.toUpperCase(), 'zorblax'],
      customWordsMode: 'mix',
    })
    const key = normalizeAnswer(curated.term)
    const matches = pool.filter((word) => normalizeAnswer(word.term) === key)
    expect(matches.map((word) => word.id)).toEqual([curated.id])
    expect(pool.some((word) => word.id === 'custom/zorblax')).toBe(true)
  })

  it('uses only custom words in only mode', () => {
    const pool = buildWordPool({
      packIds: ALL_PACK_IDS,
      customWords: ['zorblax', 'quuxle', 'zorblax'],
      customWordsMode: 'only',
    })
    expect(pool.map((word) => word.id)).toEqual([
      'custom/zorblax',
      'custom/quuxle',
    ])
  })

  it('falls back to packs when only mode has no usable custom words', () => {
    if (secondPack === undefined) throw new Error('need two packs')
    const pool = buildWordPool({
      packIds: [secondPack.id],
      customWords: ['🎉'],
      customWordsMode: 'only',
    })
    expect(pool.length).toBe(secondPack.words.length)
  })

  it('is never empty', () => {
    const pool = buildWordPool({
      packIds: ['unknown'],
      customWords: [],
      customWordsMode: 'mix',
    })
    expect(pool.length).toBe(getAllPlayableWords().length)
    expect(pool.length).toBeGreaterThan(0)
  })

  it('uses custom words alone when no known pack is enabled in mix mode', () => {
    const pool = buildWordPool({
      packIds: [],
      customWords: ['zorblax'],
      customWordsMode: 'mix',
    })
    expect(pool.map((word) => word.id)).toEqual(['custom/zorblax'])
  })

  it('never contains two words with the same id or answer key', () => {
    const pool = buildWordPool({
      packIds: ALL_PACK_IDS,
      customWords: getAllPlayableWords()
        .slice(0, 20)
        .map((word) => word.term),
      customWordsMode: 'mix',
    })
    expect(new Set(pool.map((word) => word.id)).size).toBe(pool.length)
    expect(new Set(pool.map((word) => normalizeAnswer(word.term))).size).toBe(
      pool.length,
    )
  })
})

describe('words that moved packs', () => {
  it('keep resolving under their old ids', () => {
    expect(Object.keys(LEGACY_WORD_IDS).length).toBeGreaterThan(0)
    for (const [oldId, newId] of Object.entries(LEGACY_WORD_IDS)) {
      const word = getPlayableWordById(newId)
      expect(word, newId).toBeDefined()
      // The old id is free (never reused) and names the same word.
      expect(getAllPlayableWords().some((entry) => entry.id === oldId)).toBe(
        false,
      )
      expect(canonicalWordId(oldId)).toBe(newId)
      expect(getPlayableWordById(oldId)).toBe(word)
      expect(answerKeyForWordId(oldId)).toBe(normalizeAnswer(word!.term))
    }
    expect(canonicalWordId('animals/cat')).toBe('animals/cat')
  })

  it('are still excluded when a memory holds the old id', () => {
    const pool = buildWordPool({
      packIds: ['body-health'],
      customWords: [],
      customWordsMode: 'mix',
    })
    const hand = pool.find((word) => word.id === 'body-health/hand')!
    expect(hand).toBeDefined()
    for (let seed = 0; seed < 20; seed += 1) {
      let state = seed
      const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648
        return state / 2147483648
      }
      const picks = selectDraftOptions({
        pool,
        slots: ['easy', 'easy', 'easy', 'easy', 'easy'],
        hardExclude: new Set(['space-science/hand']),
        penalties: new Map(),
        avoidStems: new Set(),
        random,
      })
      expect(picks.map((word) => word.id)).not.toContain(hand.id)
    }
  })

  it('moved the body words out of Space & Science', () => {
    const science = buildWordPool({
      packIds: ['space-science'],
      customWords: [],
      customWordsMode: 'mix',
    }).map((word) => word.term)
    for (const term of ['hand', 'sunburn', 'tooth', 'elevator', 'escalator']) {
      expect(science).not.toContain(term)
    }
  })
})
