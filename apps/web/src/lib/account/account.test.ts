import { EMPTY_ACCOUNT_STATS } from '@drawing-games/game-core'
import { expect, test } from 'vitest'

import { parseProfile } from './profile'
import {
  WORD_ROLE_LABELS,
  describeWordResult,
  formatRelativeTime,
  lifetimeStatCards,
  matchesRoleFilter,
  wordEventContext,
} from './stats'

test('profiles need identity fields and get safe defaults for the rest', () => {
  expect(parseProfile(null)).toBeNull()
  expect(parseProfile({ username: 'mina' })).toBeNull()

  const profile = parseProfile({
    accountId: 'mina',
    username: 'mina',
    stats: { wins: 3, losses: 'many', fastestCorrectMs: 4200 },
    recentWords: [
      { wordId: 'animals/cat', term: 'cat', role: 'drew', atMs: 1 },
      { term: 42 },
    ],
  })
  expect(profile).toMatchObject({
    displayName: 'mina',
    avoidedWordCount: 0,
    recentMatches: [],
    stats: { ...EMPTY_ACCOUNT_STATS, wins: 3, fastestCorrectMs: 4200 },
  })
  expect(profile?.recentWords).toHaveLength(1)
})

test('lifetime cards show rates and averages without dividing by zero', () => {
  const empty = lifetimeStatCards(EMPTY_ACCOUNT_STATS)
  expect(empty.find((card) => card.id === 'win-rate')?.value).toBe('—')
  expect(empty.find((card) => card.id === 'fastest')?.value).toBe('—')

  const cards = lifetimeStatCards({
    ...EMPTY_ACCOUNT_STATS,
    matchesPlayed: 4,
    wins: 3,
    roundsDrawn: 5,
    drawingsSolved: 4,
    drawerSolveMsTotal: 100_000,
    guessesSubmitted: 20,
    correctGuesses: 5,
    timeToCorrectMsTotal: 42_000,
    fastestCorrectMs: 3_450,
  })
  const value = (id: string) => cards.find((card) => card.id === id)?.value
  expect(value('win-rate')).toBe('75%')
  expect(value('drawings-solved')).toBe('80%')
  expect(value('drawer-solve-time')).toBe('25 s')
  expect(value('accuracy')).toBe('25%')
  expect(value('time-to-correct')).toBe('8.4 s')
  expect(value('fastest')).toBe('3.5 s')
})

test('lifetime cards show every tracked total in plain words', () => {
  const card = (stats: Partial<typeof EMPTY_ACCOUNT_STATS>, id: string) =>
    lifetimeStatCards({ ...EMPTY_ACCOUNT_STATS, ...stats }).find(
      (entry) => entry.id === id,
    )
  expect(card({ pointsWon: 190 }, 'points-won')).toMatchObject({
    label: 'Points won',
    value: '190',
  })
  expect(card({ distinctWordsDrawn: 3 }, 'distinct-words-drawn')).toMatchObject(
    { label: 'Words drawn', value: '3' },
  )
  expect(card({ matchesPlayed: 1, wins: 1 }, 'win-rate')?.detail).toBe('1 win')
  expect(card({ matchesPlayed: 2, wins: 2 }, 'win-rate')?.detail).toBe('2 wins')
  expect(card({ matchesPlayed: 1 }, 'win-rate')?.detail).toBe('0 wins')
  expect(card({ guessesSubmitted: 1 }, 'accuracy')?.detail).toBe('1 guess sent')
  expect(card({ closeGuesses: 1 }, 'correct-guesses')?.detail).toBe(
    '1 so-close call',
  )
  // Guess timing runs from the start of drawing (guess.ts), not a stroke.
  expect(card({}, 'time-to-correct')?.detail).toBe(
    'From the start of drawing to your answer',
  )
  const ids = lifetimeStatCards(EMPTY_ACCOUNT_STATS).map((entry) => entry.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('word rows describe their outcome and filter by role', () => {
  const base = {
    wordId: 'animals/cat',
    term: 'cat',
    packId: 'animals',
    difficulty: 'easy',
    atMs: 0,
    roomCode: 'ABCDE',
  } as const
  const drew = {
    ...base,
    role: 'drew',
    solved: true,
    solveMs: 12_000,
    points: 84,
  } as const
  const seen = {
    ...base,
    role: 'seen-report',
    solved: null,
    solveMs: null,
    points: null,
  } as const
  const unknown = {
    ...base,
    role: 'unknown-report',
    solved: null,
    solveMs: null,
    points: null,
  } as const
  expect(describeWordResult(drew)).toBe('Solved in 12 s · +84')
  expect(describeWordResult(seen)).toBe('Swapped: seen it')
  expect(matchesRoleFilter(seen, 'seen')).toBe(true)
  expect(matchesRoleFilter(unknown, 'offered')).toBe(true)
  expect(matchesRoleFilter(drew, 'guessed')).toBe(false)
  expect(matchesRoleFilter(drew, 'all')).toBe(true)
  expect(wordEventContext(drew)).toBeNull()
  const relay = { ...drew, points: 10, showdown: true } as const
  expect(wordEventContext(relay)).toBe('Showdown')
  expect(describeWordResult(relay)).toBe('Solved in 12 s · +10')
})

test('a word a teammate solved reads as theirs, not as the player’s own solve', () => {
  const missed = {
    wordId: 'maps/treasure-map',
    term: 'treasure map',
    packId: 'adventure',
    difficulty: 'medium',
    role: 'missed',
    solved: true,
    solveMs: 12_000,
    points: 87,
    atMs: 0,
    roomCode: 'ABCDE',
  } as const
  expect(describeWordResult(missed)).toBe('Teammate got it in 12 s · team +87')
  expect(describeWordResult({ ...missed, solveMs: 1_000 })).toBe(
    'Teammate got it in 1.0 s · team +87',
  )
  expect(describeWordResult({ ...missed, points: null })).toBe(
    'Teammate got it in 12 s',
  )
  // Never the player's own "Solved … +points" wording.
  expect(describeWordResult(missed)).not.toMatch(/^Solved|· \+/)
  expect(
    describeWordResult({
      ...missed,
      solved: false,
      solveMs: null,
      points: null,
    }),
  ).toBe('Nobody got it')
  expect(
    describeWordResult({
      ...missed,
      role: 'guessed',
    }),
  ).toBe('Solved in 12 s · +87')
  expect(
    describeWordResult({
      ...missed,
      role: 'drew',
      solved: false,
      solveMs: null,
      points: null,
    }),
  ).toBe('Not solved')
  expect(WORD_ROLE_LABELS.missed).toBe('Missed')
})

test('profiles keep the Showdown tag on relay card words', () => {
  const profile = parseProfile({
    accountId: 'mina',
    username: 'mina',
    recentWords: [
      {
        wordId: 'w-attic',
        term: 'attic',
        role: 'drew',
        atMs: 2,
        showdown: true,
      },
      { wordId: 'w-attic', term: 'attic', role: 'drew', atMs: 1 },
    ],
  })
  expect(profile?.recentWords.map(wordEventContext)).toEqual(['Showdown', null])
})

test('relative times read naturally', () => {
  const now = 10 * 24 * 60 * 60 * 1000
  expect(formatRelativeTime(now - 10_000, now)).toBe('just now')
  expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
  expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago')
  expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago')
})
