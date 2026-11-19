import { describe, expect, it } from 'vitest'

import { sharesWordStem, wordStems } from './stems'

describe('wordStems', () => {
  it.each([
    ['cat', ['cat']],
    ['cats', ['cat']],
    ['berries', ['berry']],
    ['boxes', ['box']],
    ['the moon', ['moon']],
    ['fire truck', ['fire', 'truck']],
    ['break the ice', ['break', 'ice']],
    ['ox', []],
    ['juggling', ['juggling', 'juggle']],
    ['running', ['running', 'run']],
    ['tightrope walking', ['tightrope', 'walking', 'walk']],
    ['lying', ['lying', 'lie']],
    // Words that merely end in -ing, and -ing nouns, keep one stem.
    ['king', ['king']],
    ['spring', ['spring']],
    ['thing', ['thing']],
    ['wedding ring', ['wedding', 'ring']],
    ['ceiling', ['ceiling']],
    ['pudding', ['pudding']],
    ['stocking', ['stocking']],
    // `light` is a known compound head (lighthouse), not a verb stem.
    ['lightning', ['lightning', 'light']],
  ])('%j → %j', (term, expected) => {
    expect(wordStems(term).sort()).toEqual([...expected].sort())
  })

  it('adds known compound parts', () => {
    expect(wordStems('snowman')).toEqual(
      expect.arrayContaining(['snowman', 'snow', 'man']),
    )
    expect(wordStems('Cupcake')).toEqual(
      expect.arrayContaining(['cupcake', 'cup', 'cake']),
    )
  })
})

describe('sharesWordStem', () => {
  it.each([
    ['snowman', 'snowball'],
    ['fire truck', 'fire'],
    ['fireworks', 'campfire'],
    ['cupcake', 'cup'],
    ['pancake', 'cupcake'],
    ['sunflower', 'sun'],
    ['starfish', 'jellyfish'],
    ['football', 'basketball'],
    ['cat', 'cats'],
    ['berry', 'strawberries'],
    ['raining cats and dogs', 'hot dog'],
    ['lighthouse', 'flashlight'],
    ['Ice Cream', 'ice-cream cone'],
    ['running', 'home run'],
    ['jumping', 'jump rope'],
    ['waving', 'wave'],
    ['whistling', 'whistle'],
    ['tap dancing', 'dance'],
    ['skiing', 'water skiing'],
  ])('%j and %j are one family', (left, right) => {
    expect(sharesWordStem(left, right)).toBe(true)
    expect(sharesWordStem(right, left)).toBe(true)
  })

  it.each([
    ['cat', 'dog'],
    ['praying mantis', 'snowman'],
    ['balloon', 'football'],
    ['sandwich', 'sandcastle'],
    ['police', 'ice'],
    ['unicorn', 'popcorn'],
    ['seal', 'seahorse'],
    ['brain', 'rainbow'],
    ['break the ice', 'the moon'],
    ['king', 'kite'],
    ['wedding', 'bed'],
    ['wedding ring', 'rink'],
    ['wedding', 'wed'],
    ['pudding', 'pug'],
    ['ceiling', 'seal'],
    ['stocking', 'stock pot'],
    ['spring', 'sprinkles'],
    ['icing', 'ice'],
  ])('%j and %j are unrelated', (left, right) => {
    expect(sharesWordStem(left, right)).toBe(false)
  })
})
