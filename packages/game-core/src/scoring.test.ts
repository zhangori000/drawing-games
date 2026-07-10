import { describe, expect, it } from 'vitest'

import {
  calculateGuessScore,
  calculateShowdownScore,
  calculateShutdownBounty,
  getGuessScoreBreakdown,
  updateWinStreak,
} from './scoring'

describe('guess scoring', () => {
  it.each([
    { secondsRemaining: 90, expected: 100 },
    { secondsRemaining: 45, expected: 75 },
    { secondsRemaining: 0, expected: 50 },
  ])(
    'awards $expected easy points with $secondsRemaining seconds left',
    ({ secondsRemaining, expected }) => {
      expect(
        calculateGuessScore({
          secondsRemaining,
          roundSeconds: 90,
          difficulty: 'easy',
        }),
      ).toBe(expected)
    },
  )

  it('rounds the time component before applying bonuses', () => {
    expect(
      getGuessScoreBreakdown({
        secondsRemaining: 44,
        roundSeconds: 90,
        difficulty: 'medium',
      }),
    ).toEqual({
      secondsRemaining: 44,
      roundSeconds: 90,
      speedScore: 74,
      difficultyBonus: 20,
      hintCost: 0,
      total: 94,
    })
  })

  it.each([
    { difficulty: 'easy' as const, expected: 75 },
    { difficulty: 'medium' as const, expected: 95 },
    { difficulty: 'hard' as const, expected: 115 },
  ])('adds the $difficulty difficulty bonus', ({ difficulty, expected }) => {
    expect(
      calculateGuessScore({
        secondsRemaining: 45,
        roundSeconds: 90,
        difficulty,
      }),
    ).toBe(expected)
  })

  it('deducts ten points when the team used the word-length hint', () => {
    expect(
      calculateGuessScore({
        secondsRemaining: 45,
        roundSeconds: 90,
        difficulty: 'hard',
        usedWordLengthHint: true,
      }),
    ).toBe(105)
  })

  it('clamps time above and below the authoritative round bounds', () => {
    expect(
      calculateGuessScore({
        secondsRemaining: 500,
        roundSeconds: 90,
        difficulty: 'easy',
      }),
    ).toBe(100)
    expect(
      calculateGuessScore({
        secondsRemaining: -5,
        roundSeconds: 90,
        difficulty: 'easy',
      }),
    ).toBe(50)
  })

  it('normalizes non-finite and non-positive clock inputs safely', () => {
    expect(
      getGuessScoreBreakdown({
        secondsRemaining: Number.POSITIVE_INFINITY,
        roundSeconds: 0,
        difficulty: 'easy',
      }),
    ).toMatchObject({ secondsRemaining: 1, roundSeconds: 1, total: 100 })
    expect(
      calculateGuessScore({
        secondsRemaining: Number.NaN,
        roundSeconds: Number.NaN,
        difficulty: 'easy',
      }),
    ).toBe(50)
  })
})

describe('shutdown bounty', () => {
  it.each([
    { wins: 1, expected: 0 },
    { wins: 2, expected: 10 },
    { wins: 3, expected: 20 },
    { wins: 4, expected: 30 },
    { wins: 9, expected: 30 },
  ])(
    'returns $expected after an opponent streak of $wins',
    ({ wins, expected }) => {
      expect(
        calculateShutdownBounty({
          roundWinner: 'A',
          scoresBeforeRound: { A: 100, B: 300 },
          activeStreakBeforeRound: { team: 'B', wins },
        }),
      ).toBe(expected)
    },
  )

  it('does not award a tied or leading team', () => {
    expect(
      calculateShutdownBounty({
        roundWinner: 'A',
        scoresBeforeRound: { A: 300, B: 300 },
        activeStreakBeforeRound: { team: 'B', wins: 4 },
      }),
    ).toBe(0)
    expect(
      calculateShutdownBounty({
        roundWinner: 'A',
        scoresBeforeRound: { A: 301, B: 300 },
        activeStreakBeforeRound: { team: 'B', wins: 4 },
      }),
    ).toBe(0)
  })

  it("only awards a team that actually breaks the opponent's active streak", () => {
    expect(
      calculateShutdownBounty({
        roundWinner: 'A',
        scoresBeforeRound: { A: 100, B: 300 },
        activeStreakBeforeRound: { team: 'A', wins: 4 },
      }),
    ).toBe(0)
    expect(
      calculateShutdownBounty({
        roundWinner: 'A',
        scoresBeforeRound: { A: 100, B: 300 },
        activeStreakBeforeRound: null,
      }),
    ).toBe(0)
  })

  it('updates consecutive wins deterministically', () => {
    expect(updateWinStreak(null, 'A')).toEqual({ team: 'A', wins: 1 })
    expect(updateWinStreak({ team: 'A', wins: 2 }, 'A')).toEqual({
      team: 'A',
      wins: 3,
    })
    expect(updateWinStreak({ team: 'A', wins: 3 }, 'B')).toEqual({
      team: 'B',
      wins: 1,
    })
    expect(updateWinStreak({ team: 'B', wins: 4 }, null)).toBeNull()
  })
})

describe('showdown scoring', () => {
  it('keeps the relay score simple and bounded by cards completed', () => {
    expect(
      calculateShowdownScore({ cardsGuessed: 6, firstToClear: true }),
    ).toBe(80)
    expect(
      calculateShowdownScore({ cardsGuessed: 4, firstToClear: false }),
    ).toBe(40)
    expect(
      calculateShowdownScore({ cardsGuessed: -2, firstToClear: true }),
    ).toBe(20)
  })
})
