import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { DIFFICULTY_BONUSES } from './scoring'
import { DEFAULT_GAME_SETTINGS, type GameSettings } from './settings'
import {
  applySimulationCommand,
  assertSimulationInvariants,
  createFakeRoom,
  runSeededRounds,
  SimulationInvariantError,
  SimulationRuleError,
  type SimulationRoomState,
} from './simulation'

describe('headless room construction and sequencing', () => {
  it('creates two teams with a drawer and guessers without global state', () => {
    const room = createFakeRoom({ seed: 42 })

    expect(room).toMatchObject({
      phase: 'ready',
      roomSeq: 0,
      completedRounds: 0,
      scores: { A: 0, B: 0 },
      rosters: {
        A: ['a1', 'a2', 'a3'],
        B: ['b1', 'b2', 'b3'],
      },
    })
    expect(room.players).toHaveLength(6)
    expect(() => assertSimulationInvariants(room)).not.toThrow()
  })

  it('requires contiguous command sequences and monotonic server time', () => {
    const initial = createFakeRoom({ seed: 7 })

    expect(() =>
      applySimulationCommand(initial, {
        type: 'round.start',
        seq: 2,
        serverTimeMs: 1_000,
      }),
    ).toThrow('command seq must be exactly roomSeq + 1')

    const started = applySimulationCommand(initial, {
      type: 'round.start',
      seq: 1,
      serverTimeMs: 1_000,
    })
    expect(started.roomSeq).toBe(1)
    expect(started.history).toEqual([
      { seq: 1, serverTimeMs: 1_000, commandType: 'round.start' },
    ])

    expect(() =>
      applySimulationCommand(started, {
        type: 'word.select',
        seq: 2,
        serverTimeMs: 999,
        team: 'A',
        actorId: 'a1',
        optionIndex: 0,
      }),
    ).toThrow('command server time must be monotonic')
    expect(initial).toMatchObject({ roomSeq: 0, phase: 'ready' })
  })

  it('rejects rooms without at least one guesser per team', () => {
    expect(() =>
      createFakeRoom({ seed: 1, teamSizes: { A: 1, B: 2 } }),
    ).toThrow('Team A size must be at least 2')
  })
})

describe('headless word draft boundaries', () => {
  it('rotates drawers and generates deterministic candidate pools', () => {
    const first = startRoom(123, 10_000)
    const repeated = startRoom(123, 10_000)
    const different = startRoom(124, 10_000)

    expect(first.round?.drawers).toEqual({ A: 'a1', B: 'b1' })
    expect(first.round?.drafts).toEqual(repeated.round?.drafts)
    expect(first.round?.drafts).not.toEqual(different.round?.drafts)
    expect(first.round?.drafts.A.options).toHaveLength(3)
    expect(
      new Set(first.round?.drafts.A.options.map((word) => word.id)),
    ).toHaveProperty('size', 3)
  })

  it('allows only the active drawer to select before the absolute deadline', () => {
    const started = startRoom(10, 0)
    const deadline = started.round?.draftDeadlineAtMs as number

    expect(() =>
      applySimulationCommand(started, {
        type: 'word.select',
        seq: 2,
        serverTimeMs: deadline - 1,
        team: 'A',
        actorId: 'a2',
        optionIndex: 0,
      }),
    ).toThrow('only the active team drawer')
    expect(() =>
      applySimulationCommand(started, {
        type: 'word.select',
        seq: 2,
        serverTimeMs: deadline,
        team: 'A',
        actorId: 'a1',
        optionIndex: 0,
      }),
    ).toThrow('at or after draft deadline')

    const selected = applySimulationCommand(started, {
      type: 'word.select',
      seq: 2,
      serverTimeMs: deadline - 1,
      team: 'A',
      actorId: 'a1',
      optionIndex: 0,
    })
    expect(selected.round?.drafts.A.chosenOptionId).toBe(
      selected.round?.drafts.A.options[0]?.id,
    )
  })

  it('auto-selects missing words exactly at the draft deadline', () => {
    const started = startRoom(11, 0)
    const deadline = started.round?.draftDeadlineAtMs as number

    expect(() =>
      applySimulationCommand(started, {
        type: 'drawing.start',
        seq: 2,
        serverTimeMs: deadline - 1,
      }),
    ).toThrow('before both selections or the draft deadline')

    const drawing = applySimulationCommand(started, {
      type: 'drawing.start',
      seq: 2,
      serverTimeMs: deadline,
    })
    expect(drawing.phase).toBe('drawing')
    expect(drawing.round?.drafts.A.chosenOptionId).not.toBeNull()
    expect(drawing.round?.drafts.B.chosenOptionId).not.toBeNull()
    expect(drawing.round?.drawingDeadlineAtMs).toBe(
      deadline + DEFAULT_GAME_SETTINGS.drawingSeconds * 1_000,
    )
  })

  it('keeps legacy Seen replacement bounded by the shared cap', () => {
    const started = startRoom(12, 0)
    const originalIds = started.round?.drafts.A.options.map((word) => word.id)
    const seen = applySimulationCommand(started, {
      type: 'word.seen',
      seq: 2,
      serverTimeMs: 1,
      team: 'A',
      actorId: 'a1',
      optionIndex: 1,
    })

    expect(seen.round?.drafts.A.seenOptionIds).toEqual([originalIds?.[1]])
    expect(seen.round?.drafts.A.options[1]?.id).not.toBe(originalIds?.[1])
    expect(
      new Set(seen.round?.drafts.A.options.map((word) => word.id)).size,
    ).toBe(3)
    expect(() =>
      applySimulationCommand(seen, {
        type: 'word.seen',
        seq: 3,
        serverTimeMs: 2,
        team: 'A',
        actorId: 'a1',
        optionIndex: 0,
      }),
    ).toThrow('Word replacement limit reached')
  })

  it('audits unknown-definition separately and shares the anti-abuse cap', () => {
    const settings = settingsWith({ seenRerollsPerDrawer: 2 })
    let state = applySimulationCommand(createFakeRoom({ seed: 13, settings }), {
      type: 'round.start',
      seq: 1,
      serverTimeMs: 10_000,
    })

    state = applySimulationCommand(state, {
      type: 'word.replace',
      seq: 2,
      serverTimeMs: 10_001,
      team: 'A',
      actorId: 'a1',
      optionIndex: 0,
      reason: 'unknown-definition',
    })
    state = applySimulationCommand(state, {
      type: 'word.replace',
      seq: 3,
      serverTimeMs: 10_002,
      team: 'A',
      actorId: 'a1',
      optionIndex: 1,
      reason: 'seen-before',
    })

    expect(state.round?.drafts.A.replacementActions).toMatchObject([
      {
        reason: 'unknown-definition',
        actorId: 'a1',
        serverTimeMs: 10_001,
      },
      { reason: 'seen-before', actorId: 'a1', serverTimeMs: 10_002 },
    ])
    expect(state.round?.drafts.A.seenOptionIds).toHaveLength(1)
    expect(() =>
      applySimulationCommand(state, {
        type: 'word.replace',
        seq: 4,
        serverTimeMs: 10_003,
        team: 'A',
        actorId: 'a1',
        optionIndex: 2,
        reason: 'unknown-definition',
      }),
    ).toThrow('Word replacement limit reached')
  })

  it('rejects an unknown-definition replacement at the draft deadline', () => {
    const started = startRoom(14, 0)

    expect(() =>
      applySimulationCommand(started, {
        type: 'word.replace',
        seq: 2,
        serverTimeMs: started.round?.draftDeadlineAtMs as number,
        team: 'A',
        actorId: 'a1',
        optionIndex: 0,
        reason: 'unknown-definition',
      }),
    ).toThrow('at or after draft deadline')
  })
})

describe('headless drawing, scoring, and round completion', () => {
  it('accepts a guess at the exact deadline and rejects it afterward', () => {
    const drawing = startDrawingWithAutomaticWords(99)
    const deadline = drawing.round?.drawingDeadlineAtMs as number
    const atDeadline = applySimulationCommand(drawing, {
      type: 'guess.correct',
      seq: drawing.roomSeq + 1,
      serverTimeMs: deadline,
      team: 'A',
      actorId: 'a2',
    })

    const difficulty = drawing.round?.drafts.A.options.find(
      (option) => option.id === drawing.round?.drafts.A.chosenOptionId,
    )?.difficulty
    expect(atDeadline.round?.solutions.A?.points).toBe(
      difficulty === 'easy' ? 50 : difficulty === 'medium' ? 70 : 90,
    )

    expect(() =>
      applySimulationCommand(drawing, {
        type: 'guess.correct',
        seq: drawing.roomSeq + 1,
        serverTimeMs: deadline + 1,
        team: 'A',
        actorId: 'a2',
      }),
    ).toThrow('after drawing deadline')
  })

  it('never lets the drawer score as their own guesser', () => {
    const drawing = startDrawingWithAutomaticWords(100)

    expect(() =>
      applySimulationCommand(drawing, {
        type: 'guess.correct',
        seq: drawing.roomSeq + 1,
        serverTimeMs: (drawing.round?.drawingStartedAtMs as number) + 1,
        team: 'A',
        actorId: drawing.round?.drawers.A as string,
      }),
    ).toThrow('active drawer cannot submit')
  })

  it('keeps the round open so the second team can redeem later points', () => {
    let state = startDrawingWithAutomaticWords(101)
    const drawingStart = state.round?.drawingStartedAtMs as number
    const deadline = state.round?.drawingDeadlineAtMs as number

    state = applySimulationCommand(state, {
      type: 'guess.correct',
      seq: state.roomSeq + 1,
      serverTimeMs: drawingStart + 1_000,
      team: 'A',
      actorId: 'a2',
    })
    const scoreAfterA = state.scores.A
    expect(state.phase).toBe('drawing')
    expect(state.round?.solutions.B).toBeNull()
    expect(state.scores.B).toBe(0)
    expect(() =>
      applySimulationCommand(state, {
        type: 'round.finish',
        seq: state.roomSeq + 1,
        serverTimeMs: drawingStart + 1_001,
      }),
    ).toThrow('unsolved team still has time')

    state = applySimulationCommand(state, {
      type: 'guess.correct',
      seq: state.roomSeq + 1,
      serverTimeMs: deadline,
      team: 'B',
      actorId: 'b2',
    })
    const aDifficulty = chosenDifficulty(state, 'A')
    const bDifficulty = chosenDifficulty(state, 'B')
    const aSpeedPoints = scoreAfterA - DIFFICULTY_BONUSES[aDifficulty]
    const bSpeedPoints =
      (state.round?.solutions.B?.points as number) -
      DIFFICULTY_BONUSES[bDifficulty]

    expect(state.scores.A).toBe(scoreAfterA)
    expect(state.scores.B).toBeGreaterThan(0)
    expect(aSpeedPoints).toBeGreaterThan(bSpeedPoints)
    state = applySimulationCommand(state, {
      type: 'round.finish',
      seq: state.roomSeq + 1,
      serverTimeMs: deadline,
    })

    expect(state.phase).toBe('round-results')
    expect(state.completedRounds).toBe(1)
    expect(state.round?.solutions.A).not.toBeNull()
    expect(state.round?.solutions.B).not.toBeNull()
    expect(() => assertSimulationInvariants(state)).not.toThrow()
  })

  it('cannot double-score a retried or repeated correct guess', () => {
    const drawing = startDrawingWithAutomaticWords(102)
    const atMs = (drawing.round?.drawingStartedAtMs as number) + 1_000
    const command = {
      type: 'guess.correct' as const,
      seq: drawing.roomSeq + 1,
      serverTimeMs: atMs,
      team: 'A' as const,
      actorId: 'a2',
    }
    const solved = applySimulationCommand(drawing, command)
    const scoreAfterFirstApplication = solved.scores.A

    expect(() => applySimulationCommand(solved, command)).toThrow(
      'command seq must be exactly roomSeq + 1',
    )
    expect(() =>
      applySimulationCommand(solved, {
        ...command,
        seq: solved.roomSeq + 1,
        serverTimeMs: atMs + 1,
      }),
    ).toThrow('team already solved this round')
    expect(solved.scores.A).toBe(scoreAfterFirstApplication)
  })
})

describe('seeded simulation properties', () => {
  it('is deeply deterministic for the same seed and differs across seeds', () => {
    const first = runSeededRounds({ seed: 987, rounds: 6 })
    const replay = runSeededRounds({ seed: 987, rounds: 6 })
    const alternate = runSeededRounds({ seed: 988, rounds: 6 })

    expect(replay).toEqual(first)
    expect(alternate).not.toEqual(first)
    expect(first.completedRounds).toBe(6)
    expect(first.phase).toBe('round-results')
  })

  it('preserves all invariants across many seeds, team sizes, and round counts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff_ffff }),
        fc.integer({ min: 1, max: 6 }),
        fc.record({
          A: fc.integer({ min: 2, max: 5 }),
          B: fc.integer({ min: 2, max: 5 }),
        }),
        (seed, rounds, teamSizes) => {
          const settings = settingsWith({ rounds })
          const state = runSeededRounds({
            seed,
            rounds,
            settings,
            teamSizes,
          })

          expect(() => assertSimulationInvariants(state)).not.toThrow()
          expect(state.completedRounds).toBe(rounds)
          expect(state.roomSeq).toBe(state.history.length)
          expect(state.players).toHaveLength(teamSizes.A + teamSizes.B)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('allows both teams to score once in either server-received order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 90_000 }),
        fc.integer({ min: 0, max: 90_000 }),
        (aOffsetMs, bOffsetMs) => {
          let state = startDrawingWithAutomaticWords(103)
          const startedAtMs = state.round?.drawingStartedAtMs as number
          const solves = [
            { team: 'A' as const, actorId: 'a2', offsetMs: aOffsetMs },
            { team: 'B' as const, actorId: 'b2', offsetMs: bOffsetMs },
          ].sort(
            (left, right) =>
              left.offsetMs - right.offsetMs ||
              left.team.localeCompare(right.team),
          )

          for (const solve of solves) {
            state = applySimulationCommand(state, {
              type: 'guess.correct',
              seq: state.roomSeq + 1,
              serverTimeMs: startedAtMs + solve.offsetMs,
              team: solve.team,
              actorId: solve.actorId,
            })
          }

          expect(state.phase).toBe('drawing')
          expect(state.round?.solutions.A?.points).toBeGreaterThan(0)
          expect(state.round?.solutions.B?.points).toBeGreaterThan(0)

          state = applySimulationCommand(state, {
            type: 'round.finish',
            seq: state.roomSeq + 1,
            serverTimeMs: startedAtMs + Math.max(aOffsetMs, bOffsetMs),
          })
          expect(state.phase).toBe('round-results')
          expect(() => assertSimulationInvariants(state)).not.toThrow()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('detects corrupted state instead of blessing it', () => {
    const valid = runSeededRounds({ seed: 5, rounds: 1 })
    const corrupted: SimulationRoomState = {
      ...valid,
      roomSeq: valid.roomSeq + 1,
    }

    expect(() => assertSimulationInvariants(corrupted)).toThrow(
      SimulationInvariantError,
    )
  })

  it('uses focused rule errors for invalid commands', () => {
    const room = createFakeRoom({ seed: 1 })
    expect(() =>
      applySimulationCommand(room, {
        type: 'drawing.start',
        seq: 1,
        serverTimeMs: 0,
      }),
    ).toThrow(SimulationRuleError)
  })
})

function startRoom(seed: number, serverTimeMs: number): SimulationRoomState {
  return applySimulationCommand(createFakeRoom({ seed }), {
    type: 'round.start',
    seq: 1,
    serverTimeMs,
  })
}

function startDrawingWithAutomaticWords(seed: number): SimulationRoomState {
  const started = startRoom(seed, 0)
  return applySimulationCommand(started, {
    type: 'drawing.start',
    seq: 2,
    serverTimeMs: started.round?.draftDeadlineAtMs as number,
  })
}

function settingsWith(overrides: Partial<GameSettings>): GameSettings {
  return { ...DEFAULT_GAME_SETTINGS, ...overrides }
}

function chosenDifficulty(state: SimulationRoomState, team: 'A' | 'B') {
  const draft = state.round?.drafts[team]
  const chosen = draft?.options.find(
    (option) => option.id === draft.chosenOptionId,
  )
  if (chosen === undefined) throw new Error(`Team ${team} has no chosen word`)
  return chosen.difficulty
}
