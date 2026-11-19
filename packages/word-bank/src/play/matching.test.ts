import { describe, expect, it } from 'vitest'

import {
  MAX_GUESS_LENGTH,
  closeThreshold,
  editDistance,
  letterCount,
  matchGuess,
  wordPattern,
} from './matching'
import { pluralForms, singularForms } from './inflection'
import { answerTokens, normalizeAnswer } from './text'
import type { GuessMatchTarget, GuessMatchVerdict } from './types'

type Case = readonly [
  guess: string,
  target: GuessMatchTarget,
  GuessMatchVerdict,
]

const cat = { term: 'cat' }
const iceCream = { term: 'ice cream' }
const hermitCrab = { term: 'hermit crab' }

describe('normalizeAnswer', () => {
  it.each([
    ['Ice Cream', 'icecream'],
    ['ice-cream', 'icecream'],
    ['  ice   cream  ', 'icecream'],
    ['icecream', 'icecream'],
    ['Crème Brûlée', 'cremebrulee'],
    ['PIÑATA!', 'pinata'],
    ["Jack-o'-lantern", 'jackolantern'],
    ['jack o lantern', 'jackolantern'],
    ['The Moon', 'moon'],
    ['a cat', 'cat'],
    ['the', 'the'],
    ['mac & cheese', 'macandcheese'],
    ['Straße', 'strasse'],
    ['ｃａｔ', 'cat'],
    ['🐱', ''],
    ['   ', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected)
  })

  it('keeps non-Latin letters so custom words still match', () => {
    expect(answerTokens('猫 です')).toEqual(['猫', 'です'])
    expect(normalizeAnswer('Кошка')).toBe('кошка')
  })
})

describe('plural forms', () => {
  it.each([
    ['cat', 'cats'],
    ['box', 'boxes'],
    ['bus', 'buses'],
    ['dish', 'dishes'],
    ['berry', 'berries'],
    ['tomato', 'tomatoes'],
    ['leaf', 'leaves'],
    ['knife', 'knives'],
    ['mouse', 'mice'],
    ['snowman', 'snowmen'],
    ['woman', 'women'],
    ['tooth', 'teeth'],
    ['hermitcrab', 'hermitcrabs'],
  ])('%s → %s', (singular, plural) => {
    expect(pluralForms(singular)).toContain(plural)
  })

  it('never offers a non-plural for monkey or key', () => {
    expect(pluralForms('monkey')).not.toContain('monkies')
    expect(pluralForms('key')).toEqual(['keys'])
  })

  it.each([
    ['cats', 'cat'],
    ['boxes', 'box'],
    ['glasses', 'glass'],
    ['berries', 'berry'],
    ['shoes', 'shoe'],
    ['leaves', 'leaf'],
    ['mice', 'mouse'],
    ['fireworks', 'firework'],
  ])('singular of %s includes %s', (plural, singular) => {
    expect(singularForms(plural)).toContain(singular)
  })

  it.each(['bus', 'gas', 'glass', 'iris', 'cactus', 'chaos', 'atlas', 'cat'])(
    'does not shorten the singular word %s',
    (word) => {
      expect(singularForms(word)).toEqual([])
    },
  )

  it('never shortens a plural to a stub', () => {
    expect(singularForms('boxes')).not.toContain('boxe')
    expect(singularForms('berries')).not.toContain('berrie')
    expect(singularForms('ants')).toEqual(['ant'])
    expect(singularForms('as')).toEqual([])
  })
})

describe('editDistance', () => {
  it.each([
    ['cat', 'cat', 0],
    ['cat', 'cut', 1],
    ['cat', 'act', 1],
    ['rabbit', 'rabit', 1],
    ['kangaroo', 'kanagroo', 1],
    ['kangaroo', 'kangeroos', 2],
    ['', 'abc', 3],
  ])('%s vs %s = %i', (a, b, expected) => {
    expect(editDistance(a, b, 3)).toBe(expected)
    expect(editDistance(b, a, 3)).toBe(expected)
  })

  it('caps at max + 1 without computing the full distance', () => {
    expect(editDistance('abcdefgh', 'zyxwvuts', 2)).toBe(3)
    expect(editDistance('a', 'abcdefghij', 2)).toBe(3)
    expect(editDistance('abc', 'xyz', 1)).toBe(2)
  })
})

describe('closeThreshold', () => {
  it.each([
    ['cat', 0],
    ['bike', 1],
    ['octopus', 1],
    ['kangaroo', 2],
    ['hermitcrab', 2],
  ])('%s allows %i edits', (key, expected) => {
    expect(closeThreshold(key)).toBe(expected)
  })
})

describe('matchGuess', () => {
  const cases: readonly Case[] = [
    // Formatting never costs a correct answer.
    ['cat', cat, 'correct'],
    ['CAT', cat, 'correct'],
    ['  Cat  ', cat, 'correct'],
    ['cat!', cat, 'correct'],
    ['the cat', cat, 'correct'],
    ['a cat', cat, 'correct'],
    ['ice cream', iceCream, 'correct'],
    ['icecream', iceCream, 'correct'],
    ['ice  cream', iceCream, 'correct'],
    ['Ice-Cream', iceCream, 'correct'],
    ['ice cream!!', iceCream, 'correct'],
    ['creme brulee', { term: 'crème brûlée' }, 'correct'],
    ['Crème Brûlée', { term: 'creme brulee' }, 'correct'],
    ['pinata', { term: 'piñata' }, 'correct'],
    ['jack o lantern', { term: "jack-o'-lantern" }, 'correct'],
    ['moon', { term: 'the moon' }, 'correct'],
    // Simple plurals both ways.
    ['cats', cat, 'correct'],
    ['boxes', { term: 'box' }, 'correct'],
    ['berries', { term: 'berry' }, 'correct'],
    ['strawberries', { term: 'strawberry' }, 'correct'],
    ['hermit crabs', hermitCrab, 'correct'],
    ['snowmen', { term: 'snowman' }, 'correct'],
    ['leaves', { term: 'leaf' }, 'correct'],
    ['firework', { term: 'fireworks' }, 'correct'],
    ['glass', { term: 'glasses' }, 'correct'],
    // Aliases.
    ['bike', { term: 'bicycle', aliases: ['bike'] }, 'correct'],
    ['bikes', { term: 'bicycle', aliases: ['bike'] }, 'correct'],
    ['tv', { term: 'television', aliases: ['tv'] }, 'correct'],
    ['T.V.', { term: 'television', aliases: ['tv'] }, 'correct'],
    // Never correct for a prefix or a stub.
    ['ca', cat, 'wrong'],
    ['c', cat, 'wrong'],
    ['bu', { term: 'bus' }, 'wrong'],
    ['gla', { term: 'glass' }, 'wrong'],
    ['glas', { term: 'glass' }, 'close'],
    ['rabbi', { term: 'rabbit' }, 'close'],
    // Close: none for 3 letters, 1 edit up to 7, 2 edits for 8+.
    ['bat', cat, 'wrong'],
    ['act', cat, 'wrong'],
    ['bika', { term: 'bike' }, 'close'],
    ['bkie', { term: 'bike' }, 'close'],
    ['bake', { term: 'bike' }, 'close'],
    ['buke', { term: 'bike' }, 'close'],
    ['bxkx', { term: 'bike' }, 'wrong'],
    ['octopuss', { term: 'octopus' }, 'close'],
    ['octapuss', { term: 'octopus' }, 'wrong'],
    ['kangaro', { term: 'kangaroo' }, 'close'],
    ['kangeroos', { term: 'kangaroo' }, 'close'],
    ['kangaruuu', { term: 'kangaroo' }, 'wrong'],
    ['rabbbits', { term: 'rabbit' }, 'close'],
    ['icecrem', iceCream, 'close'],
    // Partial: a whole meaningful word of a multi-word answer.
    ['crab', hermitCrab, 'partial'],
    ['crabs', hermitCrab, 'partial'],
    ['big hermit', hermitCrab, 'partial'],
    ['ice', iceCream, 'partial'],
    ['ice cube', iceCream, 'partial'],
    ['cream cheese', iceCream, 'partial'],
    ['dogs', { term: 'raining cats and dogs' }, 'partial'],
    ['and', { term: 'raining cats and dogs' }, 'wrong'],
    ['the', { term: 'break the ice' }, 'wrong'],
    ['her', hermitCrab, 'wrong'],
    // Containing a single-word answer among other words is not correct.
    ['big cat', cat, 'wrong'],
    ['cat dog', cat, 'wrong'],
    ['hermit crab shell', hermitCrab, 'partial'],
    ['crab hermit', hermitCrab, 'partial'],
    // Empty, whitespace, emoji, punctuation.
    ['', cat, 'wrong'],
    ['   ', cat, 'wrong'],
    ['🐱', cat, 'wrong'],
    ['🐱🐱🐱', { term: '🐱' }, 'wrong'],
    ['?!', cat, 'wrong'],
    // Unrelated.
    ['dog', cat, 'wrong'],
    ['house', { term: 'mouse' }, 'close'],
  ]

  it.each(cases)('%j vs %j → %s', (guess, target, verdict) => {
    expect(matchGuess(guess, target)).toBe(verdict)
  })

  it('treats an answer with no letters as never guessable', () => {
    expect(matchGuess('', { term: '!!!' })).toBe('wrong')
    expect(matchGuess('!!!', { term: '!!!' })).toBe('wrong')
  })

  it('ignores empty aliases', () => {
    expect(matchGuess('cat', { term: 'cat', aliases: ['', '  '] })).toBe(
      'correct',
    )
    expect(matchGuess('x', { term: 'cat', aliases: [''] })).toBe('wrong')
  })

  it('bounds the work for over-long guesses', () => {
    const atLimit = `cat${' '.repeat(MAX_GUESS_LENGTH - 3)}`
    expect(matchGuess(atLimit, cat)).toBe('correct')
    const long = 'cat '.repeat(200)
    const started = performance.now()
    expect(matchGuess(long, cat)).toBe('wrong')
    expect(
      matchGuess('x'.repeat(MAX_GUESS_LENGTH), { term: 'x'.repeat(28) }),
    ).toBe('wrong')
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('stays fast across many near-miss guesses', () => {
    const target = { term: 'praying mantis', aliases: ['mantis'] }
    const started = performance.now()
    for (let index = 0; index < 2000; index += 1) {
      matchGuess(`prayng mantsi ${index % 10}`.slice(0, 60), target)
    }
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('wordPattern / letterCount', () => {
  it.each([
    ['cat', '_ _ _', 3],
    ['ice cream', '_ _ _   _ _ _ _ _', 8],
    ["jack-o'-lantern", "_ _ _ _ - _ ' - _ _ _ _ _ _ _", 12],
    ['  piñata ', '_ _ _ _ _ _', 6],
    ['cafe\u0301', '_ _ _ _', 4],
  ])('%j', (term, pattern, count) => {
    expect(wordPattern(term)).toBe(pattern)
    expect(letterCount(term)).toBe(count)
  })
})
