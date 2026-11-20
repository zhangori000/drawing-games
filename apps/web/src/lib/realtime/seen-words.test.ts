import { expect, test } from 'vitest'

import { makeView } from '../testing/fake-socket'
import { SeenWordsTracker } from './seen-words'

const me = {
  memberId: 'm1',
  team: 'A',
  isHost: true,
  role: 'drawer',
  accountId: null,
  matchCredit: null,
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
  ).toEqual({ avoid: [], soft: [] })
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
  // The word they drew is strict memory; the other cards they saw are soft.
  expect(tracker.observe(results)).toEqual({
    avoid: ['animals/cat'],
    soft: ['food/pizza', 'nature/volcano'],
  })
  expect(tracker.observe(results)).toEqual({ avoid: [], soft: [] })
})

test('the drawer named in the results drew the word; one whose turn was taken over did not', () => {
  const resultsDrawnBy = (drawerId: string) =>
    makeView({
      phase: 'round-results',
      me,
      match,
      results: {
        roundNumber: 2,
        teams: {
          A: { term: 'cat', wordId: 'animals/cat', drawerId },
          B: { term: 'kite', wordId: 'everyday/kite', drawerId: 'cy' },
        },
      },
    })
  const picked = () => {
    const tracker = new SeenWordsTracker()
    tracker.observe(
      draftView([{ wordId: 'animals/cat' }, { wordId: 'food/pizza' }]),
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
    return tracker
  }
  expect(picked().observe(resultsDrawnBy('m1'))).toEqual({
    avoid: ['animals/cat'],
    soft: ['food/pizza', 'everyday/kite'],
  })
  // Lost connection after picking; a teammate drew it: only seen.
  expect(picked().observe(resultsDrawnBy('ben'))).toEqual({
    avoid: [],
    soft: ['animals/cat', 'food/pizza', 'everyday/kite'],
  })
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
  expect(tracker.observe(results)).toEqual({
    avoid: [],
    soft: ['everyday/kite'],
  })
})

test('the other team’s word, revealed in the results, is remembered last', () => {
  const tracker = new SeenWordsTracker()
  tracker.observe(
    draftView([{ wordId: 'animals/cat' }, { wordId: 'food/pizza' }]),
  )
  const results = makeView({
    phase: 'round-results',
    me,
    match,
    results: {
      roundNumber: 2,
      teams: {
        A: { term: 'cat', wordId: 'animals/cat' },
        B: { term: 'mermaid', wordId: 'fantasy/mermaid' },
      },
    },
  })
  expect(tracker.observe(results)).toEqual({
    avoid: [],
    soft: ['animals/cat', 'food/pizza', 'fantasy/mermaid'],
  })
})

test('a guesser on the other team remembers both revealed words, own first', () => {
  const tracker = new SeenWordsTracker()
  const moonGuesser = { ...me, team: 'B', role: 'guesser' }
  const results = makeView({
    phase: 'round-results',
    me: moonGuesser,
    match,
    results: {
      roundNumber: 1,
      teams: {
        A: { term: 'kite', wordId: 'everyday/kite' },
        B: { term: 'oasis', wordId: 'places/oasis' },
      },
    },
  })
  expect(tracker.observe(results)).toEqual({
    avoid: [],
    soft: ['places/oasis', 'everyday/kite'],
  })
})
