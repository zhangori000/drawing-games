import { describe, expect, it } from 'vitest'

import { DEFAULT_GAME_SETTINGS } from './settings'
import {
  canTeamSurrender,
  canTransition,
  createDrawerSchedule,
  createPhaseState,
  getDrawersForRound,
  getPhaseMillisecondsRemaining,
  getSurrenderEligibility,
  hasPhaseDeadlineElapsed,
  nextPhaseAfterRound,
  phaseForRematchChoice,
  transitionPhase,
} from './state-machine'

describe('Dual Draw phase machine', () => {
  it('supports the complete happy-path phase sequence', () => {
    const sequence = [
      ['lobby', 'settings'],
      ['settings', 'ready'],
      ['ready', 'word-draft'],
      ['word-draft', 'drawing'],
      ['drawing', 'round-results'],
      ['round-results', 'word-draft'],
      ['round-results', 'showdown'],
      ['showdown', 'stats'],
      ['stats', 'rematch'],
      ['rematch', 'ready'],
    ] as const

    for (const [from, to] of sequence) {
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true)
    }
  })

  it('rejects phase skipping', () => {
    const lobby = createPhaseState('lobby', 1_000)

    expect(canTransition('lobby', 'drawing')).toBe(false)
    expect(() => transitionPhase(lobby, 'drawing', 2_000, 90)).toThrow(
      'Invalid phase transition: lobby -> drawing',
    )
  })

  it('stores an absolute server deadline for timed phases', () => {
    const ready = createPhaseState('ready', 1_700_000_000_000)
    const draft = transitionPhase(ready, 'word-draft', 1_700_000_001_000, 15)

    expect(draft).toEqual({
      type: 'word-draft',
      enteredAtMs: 1_700_000_001_000,
      deadlineAtMs: 1_700_000_016_000,
    })
  })

  it('derives reconnect-safe remaining time and never returns a negative value', () => {
    const drawing = createPhaseState('drawing', 10_000, 90)

    expect(getPhaseMillisecondsRemaining(drawing, 20_000)).toBe(80_000)
    expect(getPhaseMillisecondsRemaining(drawing, 100_000)).toBe(0)
    expect(getPhaseMillisecondsRemaining(drawing, 200_000)).toBe(0)
    expect(hasPhaseDeadlineElapsed(drawing, 99_999)).toBe(false)
    expect(hasPhaseDeadlineElapsed(drawing, 100_000)).toBe(true)
  })

  it('does not invent deadlines for lobby-like phases', () => {
    const lobby = createPhaseState('lobby', 10_000)

    expect(getPhaseMillisecondsRemaining(lobby, 20_000)).toBeNull()
    expect(hasPhaseDeadlineElapsed(lobby, 20_000)).toBe(false)
    expect(() => createPhaseState('lobby', 10_000, 5)).toThrow(
      'Untimed phase "lobby" cannot have a duration',
    )
  })

  it('requires valid server clock inputs', () => {
    expect(() => createPhaseState('drawing', 0, 0)).toThrow(
      'Timed phase "drawing" requires a positive duration',
    )
    expect(() => createPhaseState('lobby', Number.NaN)).toThrow(
      'enteredAtMs must be a non-negative finite timestamp',
    )
  })

  it('routes completed normal rounds to the next draft or showdown', () => {
    expect(nextPhaseAfterRound(5, DEFAULT_GAME_SETTINGS)).toBe('word-draft')
    expect(nextPhaseAfterRound(6, DEFAULT_GAME_SETTINGS)).toBe('showdown')
  })
})

describe('drawer rotation', () => {
  const rosters = {
    A: ['a1', 'a2', 'a3'],
    B: ['b1', 'b2'],
  } as const

  it("rotates independently and wraps each team's roster", () => {
    expect(createDrawerSchedule(rosters, 6)).toEqual([
      { A: 'a1', B: 'b1' },
      { A: 'a2', B: 'b2' },
      { A: 'a3', B: 'b1' },
      { A: 'a1', B: 'b2' },
      { A: 'a2', B: 'b1' },
      { A: 'a3', B: 'b2' },
    ])
  })

  it('keeps assignment counts within one turn for every teammate', () => {
    const schedule = createDrawerSchedule(rosters, 17)

    for (const team of ['A', 'B'] as const) {
      const counts = rosters[team].map(
        (player) =>
          schedule.filter((drawers) => drawers[team] === player).length,
      )
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    }
  })

  it('uses one-based round numbers and validates rotations', () => {
    expect(getDrawersForRound(rosters, 1)).toEqual({ A: 'a1', B: 'b1' })
    expect(() => getDrawersForRound(rosters, 0)).toThrow(
      'roundNumber must be a positive integer',
    )
    expect(() => getDrawersForRound({ A: [], B: ['b1'] }, 1)).toThrow(
      'Each team needs at least one player',
    )
    expect(() => getDrawersForRound({ A: ['same'], B: ['same'] }, 1)).toThrow(
      'A player may appear only once',
    )
  })
})

describe('surrender and rematch', () => {
  const surrender = DEFAULT_GAME_SETTINGS.surrender

  it('lets either trailing team surrender once the configured deficit is met', () => {
    expect(
      canTeamSurrender({
        team: 'A',
        scores: { A: 100, B: 200 },
        completedRounds: 3,
        phase: 'round-results',
        settings: surrender,
      }),
    ).toBe(true)
    expect(
      canTeamSurrender({
        team: 'B',
        scores: { A: 250, B: 100 },
        completedRounds: 3,
        phase: 'round-results',
        settings: surrender,
      }),
    ).toBe(true)
  })

  it('explains why surrender is not yet available', () => {
    expect(
      getSurrenderEligibility({
        team: 'A',
        scores: { A: 100, B: 500 },
        completedRounds: 1,
        phase: 'round-results',
        settings: surrender,
      }),
    ).toEqual({ eligible: false, deficit: 400, reason: 'too-early' })
    expect(
      getSurrenderEligibility({
        team: 'A',
        scores: { A: 200, B: 250 },
        completedRounds: 3,
        phase: 'round-results',
        settings: surrender,
      }),
    ).toEqual({
      eligible: false,
      deficit: 50,
      reason: 'deficit-too-small',
    })
    expect(
      getSurrenderEligibility({
        team: 'A',
        scores: { A: 300, B: 200 },
        completedRounds: 3,
        phase: 'round-results',
        settings: surrender,
      }),
    ).toEqual({ eligible: false, deficit: 0, reason: 'not-trailing' })

    expect(
      getSurrenderEligibility({
        team: 'A',
        scores: { A: 100, B: 500 },
        completedRounds: 3,
        phase: 'drawing',
        settings: surrender,
      }),
    ).toEqual({ eligible: false, deficit: 400, reason: 'phase-not-active' })
  })

  it('maps the two reset choices to their next configuration step', () => {
    expect(phaseForRematchChoice('same-settings')).toBe('ready')
    expect(phaseForRematchChoice('change-settings')).toBe('settings')
  })
})
