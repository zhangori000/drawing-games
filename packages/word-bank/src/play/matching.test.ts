import { describe, expect, it } from 'vitest'

import {
  MAX_GUESS_LENGTH,
  acceptedGuessKeys,
  closeThreshold,
  editDistance,
  letterCount,
  matchGuess,
  wordPattern,
} from './matching'
import { customPlayableWords } from './pool'
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

describe('matchGuess with verb forms', () => {
  const cases: readonly Case[] = [
    // Base verb for an -ing answer, including spelling changes.
    ['juggle', { term: 'juggling' }, 'correct'],
    ['surf', { term: 'surfing' }, 'correct'],
    ['run', { term: 'running' }, 'correct'],
    ['dance', { term: 'dancing' }, 'correct'],
    ['Dance!', { term: 'dancing' }, 'correct'],
    ['lie', { term: 'lying' }, 'correct'],
    ['ski', { term: 'skiing' }, 'correct'],
    ['swim', { term: 'swimming' }, 'correct'],
    ['sleepwalk', { term: 'sleepwalking' }, 'correct'],
    ['sleep walk', { term: 'sleepwalking' }, 'correct'],
    ['eavesdrop', { term: 'eavesdropping' }, 'correct'],
    ['tiptoe', { term: 'tiptoeing' }, 'correct'],
    ['recycle', { term: 'recycling' }, 'correct'],
    ['sunbathe', { term: 'sunbathing' }, 'correct'],
    // The last word of a multi-word answer.
    ['tightrope walk', { term: 'tightrope walking' }, 'correct'],
    ['tightrope-walk', { term: 'tightrope walking' }, 'correct'],
    ['tap dance', { term: 'tap dancing' }, 'correct'],
    ['bungee jump', { term: 'bungee jumping' }, 'correct'],
    ['rock climb', { term: 'rock climbing' }, 'correct'],
    ['scuba dive', { term: 'scuba diving' }, 'correct'],
    ['water ski', { term: 'water skiing' }, 'correct'],
    ['arm wrestle', { term: 'arm wrestling' }, 'correct'],
    // A leading verb before an article, preposition, or plural object.
    ['fly a kite', { term: 'flying a kite' }, 'correct'],
    ['make the bed', { term: 'making the bed' }, 'correct'],
    ['build a sandcastle', { term: 'building a sandcastle' }, 'correct'],
    ['walk on eggshells', { term: 'walking on eggshells' }, 'correct'],
    ['brush teeth', { term: 'brushing teeth' }, 'correct'],
    ['breaking the ice', { term: 'break the ice' }, 'correct'],
    // -ing guesses for base-verb answers (custom words, nothing else in play).
    ['juggling', { term: 'juggle', otherWords: [] }, 'correct'],
    ['running', { term: 'run', otherWords: [] }, 'correct'],
    ['dancing', { term: 'dance' }, 'correct'],
    ['lying', { term: 'lie' }, 'correct'],
    ['ice skating', { term: 'ice skate' }, 'correct'],
    ['skateboarding', { term: 'skateboard' }, 'correct'],
    ['swinging', { term: 'swing set', aliases: ['swing'] }, 'correct'],
    // Words that only end in -ing letters are never shortened.
    ['k', { term: 'king' }, 'wrong'],
    ['rin', { term: 'ring' }, 'close'],
    ['th', { term: 'thing' }, 'wrong'],
    ['spr', { term: 'spring' }, 'wrong'],
    ['wedding r', { term: 'wedding ring' }, 'partial'],
    // -ing nouns are not verbs.
    ['wed', { term: 'wedding' }, 'wrong'],
    ['bed', { term: 'bedding' }, 'wrong'],
    ['ceil', { term: 'ceiling' }, 'wrong'],
    ['pud', { term: 'pudding' }, 'wrong'],
    ['stock', { term: 'stocking' }, 'wrong'],
    ['ice', { term: 'icing' }, 'wrong'],
    ['even', { term: 'evening' }, 'wrong'],
    ['silver line', { term: 'silver lining' }, 'partial'],
    ['moon land', { term: 'moon landing' }, 'partial'],
    ['bedding', { term: 'bed' }, 'wrong'],
    ['dressing', { term: 'dress' }, 'wrong'],
    // A leading -ing modifier of a noun compound is not a verb.
    ['swim pool', { term: 'swimming pool' }, 'partial'],
    ['shoot star', { term: 'shooting star' }, 'partial'],
    // A verb form that is another curated word is that word, not this one,
    // but the guesser clearly has the idea: close, never correct.
    ['wave', { term: 'waving' }, 'close'],
    ['waving', { term: 'wave' }, 'close'],
    ['whistle', { term: 'whistling' }, 'close'],
    ['whistling', { term: 'whistle' }, 'close'],
    ['cook', { term: 'cooking' }, 'close'],
    ['cooking', { term: 'chef', aliases: ['cook'] }, 'close'],
    ['sneeze', { term: 'sneezing' }, 'close'],
    // Unrelated words stay wrong, verb-shaped or not.
    ['sneezing', { term: 'waving' }, 'wrong'],
    ['cook', { term: 'waving' }, 'wrong'],
    // Close and partial feedback keep their rules.
    ['jugglin', { term: 'juggling' }, 'close'],
    ['dancng', { term: 'dancing' }, 'close'],
    ['walk', { term: 'tightrope walking' }, 'partial'],
    ['tightrope', { term: 'tightrope walking' }, 'partial'],
    ['brush', { term: 'brushing teeth' }, 'partial'],
    ['jumping', { term: 'jump rope' }, 'partial'],
    ['big juggle', { term: 'juggling' }, 'wrong'],
  ]

  it.each(cases)('%j vs %j → %s', (guess, target, verdict) => {
    expect(matchGuess(guess, target)).toBe(verdict)
  })

  it('never accepts a verb form that names another word in play', () => {
    const pool = customPlayableWords(['dig', 'digging', 'juggling'])
    const otherWords = pool
    // Close (the guesser has the idea), never correct.
    expect(matchGuess('dig', { term: 'digging', otherWords })).toBe('close')
    expect(matchGuess('digging', { term: 'dig', otherWords })).toBe('close')
    expect(matchGuess('juggle', { term: 'juggling', otherWords })).toBe(
      'correct',
    )
    // Without the room's custom words only the curated catalog guards it.
    expect(matchGuess('dig', { term: 'digging' })).toBe('correct')
  })

  it('defaults to the curated catalog as the words in play', () => {
    // `juggling` and `running` are curated actions, so they stay distinct
    // (close, not correct).
    expect(matchGuess('juggling', { term: 'juggle' })).toBe('close')
    expect(matchGuess('running', { term: 'run' })).toBe('close')
    // A curated word's own aliases are never "another word".
    expect(matchGuess('tap dance', { term: 'tap dancing' })).toBe('correct')
  })

  it('treats the target itself inside otherWords as its own answer', () => {
    const otherWords = customPlayableWords(['juggling', 'surfing'])
    expect(matchGuess('juggle', { term: 'juggling', otherWords })).toBe(
      'correct',
    )
    expect(matchGuess('surf', { term: 'surfing', otherWords })).toBe('correct')
  })

  it('reuses keys per otherWords array and picks up a new array', () => {
    const first = customPlayableWords(['surf'])
    expect(matchGuess('surf', { term: 'surfing', otherWords: first })).toBe(
      'close',
    )
    expect(matchGuess('surf', { term: 'surfing', otherWords: first })).toBe(
      'close',
    )
    const second = customPlayableWords(['kite'])
    expect(matchGuess('surf', { term: 'surfing', otherWords: second })).toBe(
      'correct',
    )
  })

  it('lists the accepted keys', () => {
    expect([...acceptedGuessKeys({ term: 'juggling' })].sort()).toEqual(
      ['juggle', 'juggling', 'jugglings'].sort(),
    )
    expect([...acceptedGuessKeys({ term: 'waving' })].sort()).toEqual(
      ['waving', 'wavings'].sort(),
    )
    expect(acceptedGuessKeys({ term: '!!!' }).size).toBe(0)
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

describe('matchGuess with "X of Y" phrases', () => {
  const cases: [string, GuessMatchTarget, string][] = [
    // The plural goes on X, the head noun.
    ['pots of gold', { term: 'pot of gold' }, 'correct'],
    ['bags of chips', { term: 'bag of chips' }, 'correct'],
    ['cups of tea', { term: 'cup of tea' }, 'correct'],
    ['pot of gold', { term: 'pots of gold' }, 'correct'],
    // Not on Y: a near miss, not the answer.
    ['pot of golds', { term: 'pot of gold' }, 'close'],
    ['bag of chip', { term: 'bag of chips' }, 'close'],
    // Other phrases keep the plural on the last word.
    ['hermit crabs', { term: 'hermit crab' }, 'correct'],
  ]

  it.each(cases)('%j vs %j → %s', (guess, target, verdict) => {
    expect(matchGuess(guess, target)).toBe(verdict)
  })
})
