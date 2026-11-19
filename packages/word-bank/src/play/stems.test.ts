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
  ])('%j and %j are unrelated', (left, right) => {
    expect(sharesWordStem(left, right)).toBe(false)
  })
})
