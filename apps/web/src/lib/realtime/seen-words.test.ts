import { expect, test } from '@playwright/test'

import { makeView } from '../testing/fake-socket'
import { SeenWordsTracker } from './seen-words'

const me = {
  memberId: 'm1',
  team: 'A',
  isHost: true,
  role: 'drawer',
  accountId: null,
}
const match = { number: 1 }

function draftView(options: { wordId: string }[]) {
  return makeView({
    phase: 'word-draft',
    me,
    match,
    round: { number: 2, mine: { amDrawer: true, options, word: null } },
  })
}

test('the drawer remembers every card shown plus the chosen word, once per round', () => {
  const tracker = new SeenWordsTracker()
  expect(
    tracker.observe(
      draftView([{ wordId: 'animals/cat' }, { wordId: 'food/pizza' }]),
    ),
  ).toEqual([])
  // A replacement swaps one card.
  tracker.observe(
    draftView([{ wordId: 'animals/cat' }, { wordId: 'nature/volcano' }]),
  )
  tracker.observe(
    makeView({
      phase: 'drawing',
      me,
      match,
      round: {
        number: 2,
        mine: {
          amDrawer: true,
          options: null,
          word: { wordId: 'animals/cat' },
        },
      },
    }),
  )

  const results = makeView({
    phase: 'round-results',
    me,
    match,
    results: {
      roundNumber: 2,
      teams: { A: { term: 'cat' }, B: { term: 'kite' } },
    },
  })
  expect(tracker.observe(results)).toEqual([
    'animals/cat',
    'food/pizza',
    'nature/volcano',
  ])
  expect(tracker.observe(results)).toEqual([])
})

test('a guesser records the team word when the results view carries its id', () => {
  const tracker = new SeenWordsTracker()
  const guesser = { ...me, role: 'guesser' }
  const results = makeView({
    phase: 'round-results',
    me: guesser,
    match,
    results: {
      roundNumber: 1,
      teams: {
        A: { term: 'kite', wordId: 'everyday/kite' },
        B: { term: 'cat' },
      },
    },
  })
  expect(tracker.observe(results)).toEqual(['everyday/kite'])
})
