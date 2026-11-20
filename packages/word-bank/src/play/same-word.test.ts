import { describe, expect, it } from 'vitest'

import { matchGuess } from './matching'
import {
  buildWordPool,
  customPlayableWords,
  getPlayableWordById,
  termForWordId,
} from './pool'
import {
  createSameWordSet,
  isSameWord,
  sameWordIndex,
  sameWordKeys,
} from './same-word'
import { countFreshWords, selectDraftOptions } from './selection'
import type { PlayableWord } from './types'

const SAME: [string, string][] = [
  ['dolphin', 'dolphins'],
  ['cat', 'cats'],
  ['mouse', 'mice'],
  ['knife', 'knives'],
  ['berry', 'berries'],
  ['box', 'boxes'],
  ['snowman', 'snowmen'],
  ['hermit crab', 'Hermit-Crabs'],
  ['pot of gold', 'pots of gold'],
]

const DIFFERENT: [string, string][] = [
  ['leaf', 'leave'],
  ['wave', 'waving'],
  ['cat', 'cut'],
  ['glass', 'glas'],
  ['pot of gold', 'pot of golds'],
]

describe('isSameWord', () => {
  it.each(SAME)('%j is %j', (left, right) => {
    expect(isSameWord(left, right)).toBe(true)
    expect(isSameWord(right, left)).toBe(true)
    // The matcher agrees: each is a correct guess for the other.
    expect(matchGuess(left, { term: right })).toBe('correct')
    expect(matchGuess(right, { term: left })).toBe('correct')
  })

  it.each(DIFFERENT)('%j is not %j', (left, right) => {
    expect(isSameWord(left, right)).toBe(false)
    expect(isSameWord(right, left)).toBe(false)
  })

  it('has no keys for a term with no letters', () => {
    expect(sameWordKeys('!!!')).toEqual([])
    expect(isSameWord('!!!', '!!!')).toBe(false)
  })

  it('lists the own key first', () => {
    expect(sameWordKeys('Hermit Crab')[0]).toBe('hermitcrab')
    expect(sameWordKeys('mice')[0]).toBe('mice')
    expect(sameWordKeys('mice')).toContain('mouse')
  })
})

describe('createSameWordSet', () => {
  it('matches added words by key or inflection, either way round', () => {
    const set = createSameWordSet()
    set.add('dolphins')
    set.add('cat')
    expect(set.has('Dolphin')).toBe(true)
    expect(set.has('dolphins')).toBe(true)
    expect(set.has('cats')).toBe(true)
    expect(set.has('cut')).toBe(false)
    expect(set.has('')).toBe(false)
  })
})

describe('sameWordIndex', () => {
  it('finds the exact word first, then one by inflection', () => {
    const words = customPlayableWords(['cat', 'mouse', 'dolphins'])
    const index = sameWordIndex(words)
    expect(index.find('cat')?.term).toBe('cat')
    expect(index.find('cats')?.term).toBe('cat')
    expect(index.find('mice')?.term).toBe('mouse')
    expect(index.find('dolphin')?.term).toBe('dolphins')
    expect(index.find('waving')).toBeUndefined()
    expect(sameWordIndex(words)).toBe(index)
  })
})

describe('termForWordId', () => {
  it('reads curated ids from the catalog and custom ids from the slug', () => {
    expect(termForWordId('animals/dolphin')).toBe(
      getPlayableWordById('animals/dolphin')?.term,
    )
    expect(termForWordId('custom/mr-whiskers')).toBe('mr whiskers')
    expect(termForWordId('custom/u--abc')).toBeNull()
    expect(termForWordId('nope/cat')).toBeNull()
  })
})

describe('same words in the pool, memory, and fresh count', () => {
  it('drops custom words that are curated words by inflection', () => {
    const pool = buildWordPool({
      packIds: ['animals'],
      customWords: ['dolphins|easy', 'cats|easy', 'mice', 'garden gnome'],
      customWordsMode: 'mix',
    })
    expect(
      pool.filter((word) => word.packId === 'custom').map((word) => word.term),
    ).toEqual(['garden gnome'])
    for (const id of ['animals/dolphin', 'animals/cat', 'animals/mouse']) {
      expect(pool.some((word) => word.id === id)).toBe(true)
    }
  })

  it('keeps one of each inflected pair among custom words', () => {
    expect(
      customPlayableWords(['cat', 'cats', 'mice', 'mouse', 'Mr. Whiskers']).map(
        (word) => word.term,
      ),
    ).toEqual(['cat', 'mice', 'Mr. Whiskers'])
  })

  it('treats a drawn or remembered word as used in any inflection', () => {
    const pool = customPlayableWords([
      'dolphins',
      'cat',
      'snow angel',
      'bunk bed',
    ])
    // The guest drew the curated `dolphin`, the room drew `custom/cats`.
    const remembered = new Set(['animals/dolphin', 'custom/cats'])
    expect(countFreshWords(pool, remembered)).toBe(2)
    for (let seed = 0; seed < 50; seed += 1) {
      let state = seed
      const random = () => {
        state = (state * 1103515245 + 12345) % 2147483648
        return state / 2147483648
      }
      const picks = selectDraftOptions({
        pool,
        slots: ['medium', 'medium'],
        hardExclude: remembered,
        penalties: new Map(),
        avoidStems: new Set(),
        random,
      })
      expect(picks.map((word: PlayableWord) => word.term).sort()).toEqual([
        'bunk bed',
        'snow angel',
      ])
    }
  })
})
