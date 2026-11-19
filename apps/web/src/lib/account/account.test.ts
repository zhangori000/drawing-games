import { EMPTY_ACCOUNT_STATS } from '@drawing-games/game-core'
import { expect, test } from '@playwright/test'

import { parseProfile } from './profile'
import {
  describeWordResult,
  formatRelativeTime,
  lifetimeStatCards,
  matchesRoleFilter,
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
})

test('relative times read naturally', () => {
  const now = 10 * 24 * 60 * 60 * 1000
  expect(formatRelativeTime(now - 10_000, now)).toBe('just now')
  expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
  expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago')
  expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago')
})
