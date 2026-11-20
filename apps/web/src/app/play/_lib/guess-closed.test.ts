import { expect, test } from 'vitest'

import {
  roundGuessClosedReason,
  showdownGuessClosedReason,
} from './guess-closed'

test('a drawer whose turn was taken over is told why they sit the word out', () => {
  const round = (
    overrides: Partial<Parameters<typeof roundGuessClosedReason>[0]>,
  ) =>
    roundGuessClosedReason(
      { canGuess: false, solved: false, sittingOut: null, ...overrides },
      'Moon',
    )
  expect(round({ canGuess: true })).toBeNull()
  expect(round({ sittingOut: 'former-drawer' })).toBe(
    'You saw this word as the drawer. Guess next round!',
  )
  // Solving wins over sitting out: the round is over for the whole team.
  expect(round({ solved: true, sittingOut: 'former-drawer' })).toBe(
    'Solved! Now watch Moon scramble.',
  )
  expect(round({})).toBe('Guessing is closed.')
})

test('a Showdown relay drawer who was replaced waits for the next card', () => {
  const card = (
    overrides: Partial<Parameters<typeof showdownGuessClosedReason>[0]>,
  ) =>
    showdownGuessClosedReason({
      canGuess: false,
      finished: false,
      sittingOut: null,
      ...overrides,
    })
  expect(card({ canGuess: true })).toBeNull()
  expect(card({ sittingOut: 'former-drawer' })).toBe(
    'You saw this card as the drawer. Guess the next one!',
  )
  expect(card({ finished: true })).toBe('Your team is done. Cheer them on!')
  expect(card({})).toBe('Guessing is closed.')
})
