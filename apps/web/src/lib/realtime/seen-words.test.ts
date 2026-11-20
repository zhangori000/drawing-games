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

function drawingView(wordId: string, roundNumber = 2) {
  return makeView({
    phase: 'drawing',
    me,
    match,
    round: {
      number: roundNumber,
      mine: { amDrawer: true, options: null, word: { wordId } },
    },
  })
}

test('the drawer remembers every card shown plus the chosen word, once per round', () => {
  const tracker = new SeenWordsTracker()
  // Cards are remembered as soon as they are dealt, each once.
  expect(
    tracker.observe(
      draftView([{ wordId: 'animals/cat' }, { wordId: 'food/pizza' }]),
    ),
  ).toEqual({ avoid: [], soft: ['animals/cat', 'food/pizza'] })
  expect(
    tracker.observe(
      draftView([{ wordId: 'animals/cat' }, { wordId: 'food/pizza' }]),
    ),
  ).toEqual({ avoid: [], soft: [] })
  // A replacement swaps one card: only the new card is new.
  expect(
    tracker.observe(
      draftView([{ wordId: 'animals/cat' }, { wordId: 'nature/volcano' }]),
    ),
  ).toEqual({ avoid: [], soft: ['nature/volcano'] })
  expect(tracker.observe(drawingView('animals/cat'))).toEqual({
    avoid: [],
    soft: [],
  })

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

test('draft cards survive a reload or a match abandoned before the results', () => {
  // Before the reload: the draft is recorded straight away.
  const before = new SeenWordsTracker()
  expect(
    before.observe(
      draftView([
        { wordId: 'vehicles/motorcycle' },
        { wordId: 'everyday/coat-hanger' },
        { wordId: 'food/brain-freeze' },
      ]),
    ),
  ).toEqual({
    avoid: [],
    soft: ['vehicles/motorcycle', 'everyday/coat-hanger', 'food/brain-freeze'],
  })
  // After the reload a new tracker only sees the drawing phase: the word
  // being drawn is remembered at once, and is strict after the results.
  const after = new SeenWordsTracker()
  expect(after.observe(drawingView('everyday/coat-hanger'))).toEqual({
    avoid: [],
    soft: ['everyday/coat-hanger'],
  })
  expect(after.observe(drawingView('everyday/coat-hanger'))).toEqual({
    avoid: [],
    soft: [],
  })
  expect(
    after.observe(
      makeView({
        phase: 'round-results',
        me,
        match,
        results: {
          roundNumber: 2,
          teams: {
            A: {
              term: 'coat hanger',
              wordId: 'everyday/coat-hanger',
              drawerId: 'm1',
            },
            B: { term: 'kite', wordId: 'everyday/kite', drawerId: 'cy' },
          },
        },
      }),
    ),
  ).toEqual({ avoid: ['everyday/coat-hanger'], soft: ['everyday/kite'] })
})

test('a new round starts a new set of cards', () => {
  const tracker = new SeenWordsTracker()
  tracker.observe(draftView([{ wordId: 'animals/cat' }]))
  expect(
    tracker.observe(
      makeView({
        phase: 'word-draft',
        me,
        match,
        round: {
          number: 3,
          mine: {
            amDrawer: true,
            options: [{ wordId: 'animals/cat' }, { wordId: 'food/pizza' }],
            word: null,
          },
        },
      }),
    ),
  ).toEqual({ avoid: [], soft: ['animals/cat', 'food/pizza'] })
})
