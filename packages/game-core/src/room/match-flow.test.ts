import type { DrawingAction } from '@drawing-games/drawing-model'
import { matchGuess } from '@drawing-games/word-bank'
import { describe, expect, it } from 'vitest'

import { DIFFICULTY_BONUSES } from '../scoring'
import type { TeamId } from '../types'
import { getCanvasAccess, getNextWakeAtMs } from './engine'
import { customWordList, RoomDriver, startHumanRoom } from './test-driver'
import type { RoomEffect } from './types'

function ofType<T extends RoomEffect['type']>(
  effects: readonly RoomEffect[],
  type: T,
): Extract<RoomEffect, { type: T }>[] {
  return effects.filter(
    (effect): effect is Extract<RoomEffect, { type: T }> =>
      effect.type === type,
  )
}

function stroke(id: string): DrawingAction[] {
  return [
    {
      type: 'stroke.begin',
      strokeId: id,
      point: { x: 0.1, y: 0.1 },
      style: { color: '#112233', width: 0.01, opacity: 1 },
    },
    {
      type: 'stroke.append',
      strokeId: id,
      startPointIndex: 1,
      points: [{ x: 0.2, y: 0.2 }],
    },
    { type: 'stroke.end', strokeId: id, pointCount: 2 },
  ]
}

/** Two-word made-up phrases so close/partial verdicts are predictable. */
function phraseRoom(
  settings: Parameters<typeof startHumanRoom>[0] = {},
): RoomDriver {
  const words = customWordList(40)
  const phrases = Array.from(
    { length: 20 },
    (_, index) => `${words[2 * index]} ${words[2 * index + 1]}`,
  )
  return startHumanRoom({
    ...settings,
    settings: {
      customWordsMode: 'only',
      customWords: phrases,
      ...settings.settings,
    },
  })
}

function drawingStart(driver: RoomDriver): number {
  const start = driver.state.match?.round?.drawingStartedAtMs
  if (start == null) throw new Error('drawing has not started')
  return start
}

describe('server time', () => {
  it('advances expired deadlines even when the command is rejected', () => {
    const driver = startHumanRoom()
    const deadline = driver.state.phaseDeadlineAtMs!
    driver.now = deadline + 1
    const result = driver.run({
      type: 'draft.select',
      actorId: 'ana',
      wordId: driver.teamRound('A').options[0]!.wordId,
    })
    expect(result.ok).toBe(false)
    expect(result.state.phase).toBe('drawing')
    expect(result.state.match?.round?.drawingStartedAtMs).toBe(deadline)
    expect(result.state.seq).toBeGreaterThan(0)
  })

  it('treats a guess at the drawing deadline as too late', () => {
    const driver = startHumanRoom()
    driver.pickWords()
    const term = driver.term('A')
    driver.now = driver.state.phaseDeadlineAtMs!
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ben', text: term }).message,
    ).toBe("Time's up for this round.")
    expect(driver.state.phase).toBe('round-results')
    expect(driver.state.match?.round?.teams.A.solution).toBeNull()
  })
})

describe('word draft', () => {
  it('deals cards, swaps them for both reasons within the allowance, and auto-picks', () => {
    const driver = startHumanRoom({ settings: { replacementsPerDrawer: 2 } })
    expect(driver.state.phase).toBe('word-draft')
    expect(
      ofType(driver.effects, 'canvas.reset').map((effect) => effect.canvasId),
    ).toEqual(['m1-r1-A', 'm1-r1-B'])
    expect(driver.drawer('A')).toBe('ana')
    expect(driver.drawer('B')).toBe('cy')
    expect(driver.state.phaseDeadlineAtMs).toBe(driver.now + 15_000)

    const options = driver.teamRound('A').options
    expect(
      driver.fail({
        type: 'draft.select',
        actorId: 'ben',
        wordId: options[0]!.wordId,
      }).code,
    ).toBe('NOT_ALLOWED')
    expect(
      driver.fail({
        type: 'draft.select',
        actorId: 'ana',
        wordId: 'not/a-card',
      }).code,
    ).toBe('BAD_COMMAND')

    const counter = driver.state.wordMemory.draftCounter
    const seen = options[0]!
    driver.ok({
      type: 'draft.replace',
      actorId: 'ana',
      wordId: seen.wordId,
      reason: 'seen-before',
    })
    const afterSeen = driver.teamRound('A')
    expect(afterSeen.options[0]?.wordId).not.toBe(seen.wordId)
    expect(afterSeen.options[0]?.difficulty).toBe(seen.difficulty)
    expect(afterSeen.replacements).toEqual([
      expect.objectContaining({
        reason: 'seen-before',
        actorId: 'ana',
        replacedWordId: seen.wordId,
      }),
    ])
    expect(driver.state.wordMemory.draftCounter).toBe(counter + 1)
    expect(driver.state.members[0]?.memory.avoid).toContain(seen.wordId)

    const unknown = afterSeen.options[1]!
    driver.ok({
      type: 'draft.replace',
      actorId: 'ana',
      wordId: unknown.wordId,
      reason: 'unknown-definition',
    })
    expect(driver.state.members[0]?.memory.soft).toContain(unknown.wordId)
    const live = driver.teamRound('A').options.map((option) => option.wordId)
    expect(live).not.toContain(seen.wordId)
    expect(live).not.toContain(unknown.wordId)
    expect(
      driver.fail({
        type: 'draft.replace',
        actorId: 'ana',
        wordId: live[2]!,
        reason: 'seen-before',
      }).message,
    ).toBe('You have used all your word swaps.')

    const anaView = driver.view('ana').round?.mine
    expect(anaView?.replacementsLeft).toBe(0)
    expect(anaView?.options?.map((option) => option.bonus)).toEqual(
      driver
        .teamRound('A')
        .options.map((option) => DIFFICULTY_BONUSES[option.difficulty]),
    )
    expect(driver.view('cy').round?.opponent?.actions).toEqual([
      { reason: 'seen-before' },
      { reason: 'unknown-definition' },
    ])

    driver.ok({ type: 'draft.select', actorId: 'ana', wordId: live[2]! })
    expect(driver.state.phase).toBe('word-draft')
    expect(
      driver.fail({ type: 'draft.select', actorId: 'ana', wordId: live[0]! })
        .message,
    ).toBe('Your word is already locked in.')

    const deadline = driver.state.phaseDeadlineAtMs!
    driver.advanceTo(deadline + 3_000)
    const round = driver.state.match!.round!
    expect(driver.state.phase).toBe('drawing')
    expect(round.teams.A.chosenBy).toBe('drawer')
    expect(round.teams.B.chosenBy).toBe('auto')
    expect(round.drawingStartedAtMs).toBe(deadline)
    expect(driver.state.phaseDeadlineAtMs).toBe(deadline + 90_000)
    expect(driver.state.wordMemory.usedWordIds).toEqual([
      round.teams.A.chosenWordId,
      round.teams.B.chosenWordId,
    ])
  })

  it('starts drawing immediately when both drawers have chosen', () => {
    const driver = startHumanRoom()
    driver.now += 2_000
    driver.pickWords()
    expect(driver.state.phase).toBe('drawing')
    expect(driver.state.phaseStartedAtMs).toBe(driver.now)
  })
})

describe('drawing operations', () => {
  it('accepts only the current drawer and counts completed strokes', () => {
    const driver = startHumanRoom()
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: stroke('s1') })
        .message,
    ).toBe('Drawing starts once both words are picked.')
    driver.pickWords()
    driver.now += 1_000
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ben', ops: stroke('s1') })
        .code,
    ).toBe('NOT_ALLOWED')
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: [] }).code,
    ).toBe('BAD_COMMAND')
    const tooMany = Array.from(
      { length: 65 },
      () => ({ type: 'drawing.undo' }) as const,
    )
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: tooMany }).code,
    ).toBe('BAD_COMMAND')
    const malformed = [
      {
        type: 'stroke.begin',
        strokeId: 'bad id!',
        point: { x: 0, y: 0 },
        style: { color: '#000000', width: 0.01, opacity: 1 },
      },
    ] as const
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: malformed }).code,
    ).toBe('BAD_COMMAND')
    const outOfRange = stroke('s0').map((op) =>
      op.type === 'stroke.append' ? { ...op, points: [{ x: 2, y: 0 }] } : op,
    )
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: outOfRange })
        .code,
    ).toBe('BAD_COMMAND')

    const ops = [
      ...stroke('s1'),
      ...stroke('s2'),
      { type: 'drawing.undo' } as const,
    ]
    const effects = driver.ok({ type: 'drawing.ops', actorId: 'ana', ops })
    expect(ofType(effects, 'canvas.ops')).toEqual([
      {
        type: 'canvas.ops',
        canvasId: 'm1-r1-A',
        team: 'A',
        ops,
        origin: 'member',
        actorId: 'ana',
      },
    ])
    expect(driver.teamRound('A')).toMatchObject({
      strokeCount: 2,
      firstStrokeAtMs: driver.now,
    })
    driver.now += 1_000
    driver.ok({ type: 'drawing.ops', actorId: 'ana', ops: stroke('s3') })
    expect(driver.teamRound('A')).toMatchObject({
      strokeCount: 3,
      firstStrokeAtMs: driver.now - 1_000,
    })
  })
})

describe('guessing', () => {
  it('gives private verdicts, rate limits, and hides guesses from opponents', () => {
    const driver = phraseRoom()
    driver.pickWords()
    const term = driver.term('A')
    const [first] = term.split(' ')
    driver.now += 1_000

    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ana', text: term }).message,
    ).toBe("The drawer can't guess.")
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ben', text: '   ' }).code,
    ).toBe('BAD_COMMAND')
    expect(
      driver.fail({
        type: 'guess.submit',
        actorId: 'ben',
        text: 'x'.repeat(61),
      }).code,
    ).toBe('BAD_COMMAND')

    const cases: [string, string][] = [
      ['wrong', 'totally unrelated'],
      ['partial', first!],
      ['close', `${term.slice(0, -1)}${term.endsWith('a') ? 'e' : 'a'}`],
    ]
    for (const [verdict, text] of cases) {
      expect(matchGuess(text, { term })).toBe(verdict)
      driver.now += 500
      const effects = driver.ok({ type: 'guess.submit', actorId: 'ben', text })
      expect(ofType(effects, 'guess.feedback')).toEqual([
        { type: 'guess.feedback', memberId: 'ben', text, verdict },
      ])
    }
    driver.now += 100
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ben', text: 'again' })
        .message,
    ).toBe('Slow down a little.')

    const mine = driver.view('ana').round?.mine
    expect(
      mine?.guesses.map((guess) => [
        guess.memberName,
        guess.text,
        guess.verdict,
      ]),
    ).toEqual([
      ['Ben', 'totally unrelated', 'wrong'],
      ['Ben', first, 'partial'],
      ['Ben', cases[2]![1], 'close'],
    ])
    expect(
      driver.view('ben').round?.mine?.guesses.every((guess) => guess.mine),
    ).toBe(true)
    const opponent = driver.view('cy').round?.opponent
    expect(opponent?.guessCount).toBe(3)
    expect(JSON.stringify(driver.view('cy'))).not.toContain('totally unrelated')
    expect(driver.state.match?.stats.ben).toMatchObject({
      guessesSubmitted: 3,
      closeGuesses: 1,
    })
  })

  it('caps guesses per round', () => {
    const driver = phraseRoom()
    driver.pickWords()
    for (let index = 0; index < 50; index += 1) {
      driver.now += 400
      driver.ok({ type: 'guess.submit', actorId: 'ben', text: `nope ${index}` })
    }
    driver.now += 400
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ben', text: 'one more' })
        .message,
    ).toBe("You're out of guesses for this round.")
    expect(driver.teamRound('A').guesses).toHaveLength(50)
  })

  it('locks a correct guess, hides its text, and ends early when both solve', () => {
    const driver = phraseRoom()
    driver.pickWords()
    const start = drawingStart(driver)
    driver.now = start + 9_000
    const term = driver.term('A')
    driver.ok({
      type: 'guess.submit',
      actorId: 'ben',
      text: `  ${term.toUpperCase()}  `,
    })
    const solution = driver.teamRound('A').solution
    expect(solution).toMatchObject({ guesserId: 'ben', atMs: start + 9_000 })
    expect(solution?.breakdown).toMatchObject({
      speedScore: 95,
      difficultyBonus: 20,
      hintCost: 0,
    })
    expect(solution?.points).toBe(115)

    const benView = driver.view('ben').round?.mine
    expect(benView?.solved).toBe(true)
    expect(benView?.guesses.at(-1)).toMatchObject({
      text: null,
      verdict: 'correct',
    })
    expect(JSON.stringify(driver.view('ben').round)).not.toContain(term)
    driver.now += 500
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'ben', text: term }).message,
    ).toBe('Your team already solved it.')
    expect(driver.view('ben').round?.opponent?.canvasAccess).toBe('full')
    expect(driver.view('cy').round?.opponent?.canvasAccess).toBe('preview')
    expect(getCanvasAccess(driver.state, 'ben')).toEqual({
      full: ['m1-r1-A', 'm1-r1-B'],
      preview: [],
    })
    expect(getCanvasAccess(driver.state, 'cy')).toEqual({
      full: ['m1-r1-B'],
      preview: ['m1-r1-A'],
    })
    expect(driver.state.phase).toBe('drawing')

    driver.solve('B', 'di')
    expect(driver.state.phase).toBe('round-results')
    expect(driver.state.match?.round?.endedAtMs).toBe(driver.now)
    const results = driver.view('ana').results
    expect(results).toMatchObject({
      roundNumber: 1,
      winner: 'A',
      nextPhase: 'word-draft',
      canContinue: true,
    })
    expect(results?.teams.A).toMatchObject({
      term,
      solved: true,
      solverName: 'Ben',
      solveSeconds: 9,
    })
    expect(driver.view('ben').results?.canContinue).toBe(false)
  })
})

describe('scoring across rounds', () => {
  it('applies hint cost, ends at the deadline, and pays a shutdown bounty', () => {
    const driver = startHumanRoom({ settings: { rounds: 4, showdown: false } })
    driver.pickWords('hard')
    const start = drawingStart(driver)
    const hardA = driver
      .teamRound('A')
      .options.find(
        (option) => option.wordId === driver.teamRound('A').chosenWordId,
      )

    driver.now = start + 10_000
    expect(
      driver.fail({ type: 'hint.vote', actorId: 'ben', approve: true }).message,
    ).toBe('The hint vote has not opened yet.')
    expect(driver.view('ben').round?.mine?.hint).toMatchObject({
      mode: 'hidden-vote',
      canVote: false,
      unlocksAtMs: start + 30_000,
      votesNeeded: 1,
      cost: 10,
    })
    driver.now = start + 30_000
    expect(
      driver.fail({ type: 'hint.vote', actorId: 'ana', approve: true }).code,
    ).toBe('NOT_ALLOWED')
    expect(driver.view('ben').round?.mine?.pattern).toBeNull()
    driver.ok({ type: 'hint.vote', actorId: 'ben', approve: true })
    const benMine = driver.view('ben').round?.mine
    expect(benMine?.hint.revealed).toBe(true)
    expect(benMine?.pattern).toMatch(/^[_ '\-]+$/)
    expect(benMine?.letterCount).toBeGreaterThan(0)
    expect(driver.view('ana').round?.mine?.pattern).toBeNull()
    expect(driver.view('di').round?.mine?.pattern).toBeNull()

    driver.now = start + 40_000
    driver.ok({ type: 'guess.submit', actorId: 'ben', text: driver.term('A') })
    const bonus = DIFFICULTY_BONUSES[hardA!.difficulty]
    expect(driver.teamRound('A').solution?.breakdown).toEqual({
      secondsRemaining: 50,
      roundSeconds: 90,
      speedScore: 78,
      difficultyBonus: bonus,
      hintCost: 10,
      total: 78 + bonus - 10,
    })

    driver.advanceTo(start + 90_000)
    expect(driver.state.phase).toBe('round-results')
    const round1 = driver.state.match!.round!
    expect(round1).toMatchObject({
      endedAtMs: start + 90_000,
      winner: 'A',
      shutdownBonus: 0,
    })
    const scoreA = 78 + bonus - 10
    expect(driver.state.match?.scores).toEqual({ A: scoreA, B: 0 })
    expect(driver.view('ana').results?.teams.A.hintUsed).toBe(true)

    // Results: host may skip; others may not.
    expect(driver.fail({ type: 'round.continue', actorId: 'ben' }).code).toBe(
      'NOT_ALLOWED',
    )
    driver.ok({ type: 'round.continue', actorId: 'ana' })
    expect(driver.state.phase).toBe('word-draft')
    expect([driver.drawer('A'), driver.drawer('B')]).toEqual(['ben', 'di'])

    // Round 2: A wins again (streak 2).
    driver.pickWords('easy')
    driver.solve('A', 'ana')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.match?.winStreak).toEqual({ team: 'A', wins: 2 })
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)

    // Round 3: trailing B breaks the streak and collects 10.
    expect([driver.drawer('A'), driver.drawer('B')]).toEqual(['ana', 'cy'])
    const before = driver.state.match!.scores
    driver.pickWords('easy')
    driver.solve('B', 'di')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    const round3 = driver.state.match!.round!
    expect(round3.winner).toBe('B')
    expect(round3.shutdownBonus).toBe(10)
    const pointsB = round3.teams.B.solution!.points
    expect(driver.state.match?.scores).toEqual({
      A: before.A,
      B: before.B + pointsB + 10,
    })
    expect(driver.state.match?.winStreak).toEqual({ team: 'B', wins: 1 })
    expect(driver.view('cy').results?.shutdownBonus).toBe(10)

    // Round 4 then final stats (showdown off).
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    driver.pickWords()
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.view('ana').results?.nextPhase).toBe('stats')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('stats')
    expect(getNextWakeAtMs(driver.state)).toBeNull()
    const final = driver.view('ana').final
    expect(final?.winner).toBe('A')
    expect(final?.endedReason).toBe('completed')
    expect(final?.rounds).toHaveLength(4)
    expect(final?.roundsWon).toEqual({ A: 2, B: 1 })
    expect(final?.showdown).toBeNull()
    expect(final?.members.map((member) => member.displayName)).toEqual([
      'Ana',
      'Ben',
      'Cy',
      'Di',
    ])
    expect(
      final?.members.find((member) => member.memberId === 'ben')?.stats,
    ).toMatchObject({
      roundsDrawn: 2,
      drawingsSolved: 1,
      correctGuesses: 1,
      hardWordsSolved: 1,
      pointsWon: scoreA,
      timeToCorrectMsTotal: 40_000,
      fastestCorrectMs: 40_000,
    })
    expect(
      final?.members.find((member) => member.memberId === 'ana')?.stats,
    ).toMatchObject({
      roundsDrawn: 2,
      drawingsSolved: 1,
      drawerSolveMsTotal: 40_000,
      hardWordsSolved: 1,
    })
    expect(final?.canRematch).toBe(true)
    expect(driver.view('ben').final?.canRematch).toBe(false)
    expect(getCanvasAccess(driver.state, null).full).toHaveLength(8)
  })
})

describe('surrender', () => {
  it('needs three rounds, a 100-point deficit, and two thirds of the team', () => {
    const driver = startHumanRoom({ settings: { showdown: false } })
    const playRoundASolves = () => {
      driver.pickWords('hard')
      driver.solve('A')
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    playRoundASolves()
    expect(
      driver.fail({ type: 'surrender.vote', actorId: 'cy', approve: true })
        .message,
    ).toBe('Surrender opens after 3 rounds when your team trails by 100+.')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    playRoundASolves()
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    playRoundASolves()
    expect(driver.state.match?.completedRounds).toBe(3)
    expect(driver.view('cy').surrender).toMatchObject({
      team: 'B',
      eligible: true,
      votesFor: 0,
      votesNeeded: 2,
      canVote: true,
    })
    expect(driver.view('ana').surrender?.eligible).toBe(false)
    expect(
      driver.fail({ type: 'surrender.vote', actorId: 'ana', approve: true })
        .code,
    ).toBe('NOT_ALLOWED')
    driver.ok({ type: 'surrender.vote', actorId: 'cy', approve: true })
    expect(driver.view('di').surrender).toMatchObject({
      votesFor: 1,
      myVote: null,
    })
    expect(driver.state.phase).toBe('round-results')
    const scores = driver.state.match!.scores
    driver.ok({ type: 'surrender.vote', actorId: 'di', approve: true })
    expect(driver.state.phase).toBe('stats')
    expect(driver.state.match).toMatchObject({
      endedReason: 'surrender',
      winner: 'A',
      scores,
    })
  })
})

describe('showdown relay', () => {
  it('clears cards for +10, rotates drawers, resets canvases, and pays +20 first', () => {
    const driver = startHumanRoom({
      settings: { rounds: 2, showdownSeconds: 120 },
    })
    for (let round = 0; round < 2; round += 1) {
      driver.pickWords()
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      expect(driver.view('ana').results?.nextPhase).toBe(
        round === 0 ? 'word-draft' : 'showdown',
      )
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    expect(driver.state.phase).toBe('showdown')
    expect(
      ofType(driver.effects, 'canvas.reset').map((effect) => effect.canvasId),
    ).toEqual(['m1-sd-A-0', 'm1-sd-B-0'])
    const showdown = driver.state.match!.showdown!
    const chosenA = driver.state.match!.history.map(
      (round) => round.teams.A.chosenWordId,
    )
    expect(showdown.teams.A.cards.map((card) => card.wordId).sort()).toEqual(
      [...chosenA].sort(),
    )
    expect(showdown.teams.A.drawerId).toBe('ana')
    expect(driver.view('ana').showdown?.mine?.word?.term).toBe(
      driver.showdownTerm('A'),
    )
    expect(driver.view('ben').showdown?.mine).toMatchObject({
      word: null,
      canGuess: true,
      cardCount: 2,
    })
    expect(JSON.stringify(driver.view('ben').showdown)).not.toContain(
      driver.showdownTerm('A'),
    )
    expect(getCanvasAccess(driver.state, 'ben')).toEqual({
      full: ['m1-sd-A-0'],
      preview: ['m1-sd-B-0'],
    })

    driver.solve('A', 'ben')
    expect(ofType(driver.effects, 'canvas.reset')).toEqual([
      { type: 'canvas.reset', canvasId: 'm1-sd-A-1', team: 'A' },
    ])
    expect(driver.state.match!.showdown!.teams.A).toMatchObject({
      cardIndex: 1,
      drawerId: 'ben',
    })
    expect(driver.state.match!.showdownPoints.A).toBe(10)
    driver.ok({ type: 'drawing.ops', actorId: 'ben', ops: stroke('sd1') })
    expect(
      driver.fail({ type: 'drawing.ops', actorId: 'ana', ops: stroke('sd2') })
        .code,
    ).toBe('NOT_ALLOWED')

    driver.solve('A', 'ana')
    const afterA = driver.state.match!
    expect(afterA.showdown!.teams.A.finishedAtMs).toBe(driver.now)
    expect(afterA.showdown!.firstClearTeam).toBe('A')
    expect(afterA.showdownPoints.A).toBe(40)
    expect(driver.view('ana').showdown?.opponent?.canvasAccess).toBe('full')

    driver.solve('B', 'di')
    driver.solve('B', 'cy')
    expect(driver.state.phase).toBe('stats')
    const final = driver.view('cy').final!
    expect(final.showdown).toEqual({
      cleared: { A: 2, B: 2 },
      cardCounts: { A: 2, B: 2 },
      firstClearTeam: 'A',
      points: { A: 40, B: 20 },
    })
    expect(final.scores).toEqual({ A: 40, B: 20 })
    expect(final.winner).toBe('A')
    expect(
      final.members.find((member) => member.memberId === 'ben')?.stats,
    ).toMatchObject({
      showdownCardsDrawn: 1,
      showdownCardsGuessed: 1,
    })
  })

  it('ends at the deadline with partial credit only', () => {
    const driver = startHumanRoom({
      settings: { rounds: 2, showdownSeconds: 60 },
    })
    for (let round = 0; round < 2; round += 1) {
      driver.pickWords()
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    driver.solve('B', 'di')
    driver.advanceTo(driver.state.match!.showdown!.deadlineAtMs)
    expect(driver.state.phase).toBe('stats')
    expect(driver.state.match?.showdownPoints).toEqual({ A: 0, B: 10 })
    expect(driver.state.match?.winner).toBe('B')
  })
})

describe('rematch and membership mid-match', () => {
  function finishQuickMatch(driver: RoomDriver): void {
    while (driver.state.phase !== 'stats') {
      if (driver.state.phase === 'word-draft') driver.pickWords()
      else driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
  }

  it('runs it back with the same settings or returns to the lobby', () => {
    const driver = startHumanRoom({ settings: { rounds: 2, showdown: false } })
    finishQuickMatch(driver)
    expect(
      driver.fail({
        type: 'match.rematch',
        actorId: 'ben',
        mode: 'same-settings',
      }).code,
    ).toBe('NOT_ALLOWED')
    driver.ok({ type: 'match.rematch', actorId: 'ana', mode: 'same-settings' })
    expect(driver.state.phase).toBe('word-draft')
    expect(driver.state.match).toMatchObject({
      number: 2,
      scores: { A: 0, B: 0 },
      completedRounds: 0,
    })
    expect(driver.teamRound('A').canvasId).toBe('m2-r1-A')
    expect(driver.state.wordMemory.usedWordIds).toHaveLength(4)

    finishQuickMatch(driver)
    driver.ok({
      type: 'match.rematch',
      actorId: 'ana',
      mode: 'change-settings',
    })
    expect(driver.state.phase).toBe('lobby')
    expect(driver.state.members.filter((member) => member.ready)).toEqual([])
    expect(driver.view('ana').match).toBeNull()
    expect(driver.view('ana').lobby?.blockers).toContain(
      'Waiting for Ben to ready up',
    )
  })

  it('keeps leavers in history, lets newcomers guess, and falls back to the lobby', () => {
    const driver = startHumanRoom({ settings: { rounds: 2, showdown: false } })
    driver.pickWords()
    driver.ok({ type: 'member.leave', memberId: 'di' })
    expect(driver.view('cy').members.map((member) => member.id)).toEqual([
      'ana',
      'ben',
      'cy',
    ])
    expect(driver.view('di').me).toBeNull()
    expect(
      driver.fail({ type: 'guess.submit', actorId: 'di', text: 'hi' }).code,
    ).toBe('NOT_ALLOWED')

    driver.join('eve', 'Eve', { team: 'B' })
    expect(driver.state.match?.stats.eve).toBeDefined()
    driver.solve('B', 'eve')
    expect(driver.teamRound('B').solution?.guesserId).toBe('eve')

    // Ana leaves after drawing round 1 (a drawer leaving mid-turn hands the
    // turn over instead; see drawer-handoff.test.ts).
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('round-results')
    driver.ok({ type: 'member.leave', memberId: 'ana' })
    expect(driver.state.hostId).toBe('ben')
    finishQuickMatch(driver)
    const final = driver.view('ben').final!
    expect(final.members.map((member) => member.displayName)).toEqual([
      'Ana',
      'Ben',
      'Cy',
      'Di',
      'Eve',
    ])
    expect(final.rounds[0]?.teams.A.drawerName).toBe('Ana')

    driver.ok({ type: 'match.rematch', actorId: 'ben', mode: 'same-settings' })
    expect(driver.state.phase).toBe('lobby')
    expect(driver.state.members.map((member) => member.id)).toEqual([
      'ben',
      'cy',
      'eve',
    ])
    expect(driver.view('ben').lobby?.blockers).toContain(
      'Sun needs at least 2 players',
    )
  })

  it('skips drawers past their reconnect grace', () => {
    const driver = startHumanRoom({ settings: { rounds: 4, showdown: false } })
    driver.pickWords()
    driver.ok({ type: 'member.presence', memberId: 'ben', connected: false })
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.drawer('A')).toBe('ana')
    expect(driver.drawer('B')).toBe('di')
  })
})

describe('account effects', () => {
  it('emits word history for account members and match summaries at the end', () => {
    const driver = new RoomDriver({ seed: 3 })
    driver.join('ana', 'Ana', { team: 'A', accountId: 'ana-acct' })
    driver.join('ben', 'Ben', { team: 'A', accountId: 'ben-acct' })
    driver.join('cy', 'Cy', { team: 'B' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'ana', team: 'B' })
    driver.settings('ana', { rounds: 2, showdown: false })
    driver.readyAll()
    driver.ok({ type: 'match.start', actorId: 'ana' })

    const replaced = driver.teamRound('A').options[0]!
    driver.ok({
      type: 'draft.replace',
      actorId: 'ana',
      wordId: replaced.wordId,
      reason: 'seen-before',
    })
    driver.pickWords()
    driver.solve('A', 'ben')
    const roundEnd = driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    const words = ofType(roundEnd, 'account.words')
    expect(words.map((effect) => effect.accountId)).toEqual([
      'ana-acct',
      'ben-acct',
    ])
    const anaRoles = words[0]!.events.map((event) => event.role).sort()
    expect(anaRoles).toEqual(['drew', 'offered', 'offered', 'seen-report'])
    expect(
      words[0]!.events.find((event) => event.role === 'seen-report')?.wordId,
    ).toBe(replaced.wordId)
    expect(words[1]!.events).toEqual([
      expect.objectContaining({
        role: 'guessed',
        solved: true,
        roomCode: 'TEST1',
      }),
    ])

    while (driver.state.phase !== 'stats') {
      if (driver.state.phase === 'word-draft') driver.pickWords()
      else driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    const summaries = ofType(driver.effects, 'account.match')
    expect(summaries.map((effect) => effect.accountId)).toEqual([
      'ana-acct',
      'ben-acct',
    ])
    expect(summaries[0]!.summary).toMatchObject({
      matchNumber: 1,
      team: 'A',
      result: 'win',
      withBots: true,
      roundsPlayed: 2,
      endedReason: 'completed',
    })
    expect(
      driver.history.some(
        (effect) => 'accountId' in effect && effect.accountId === null,
      ),
    ).toBe(false)
  })
})

describe('canvas access table', () => {
  it('follows the contract in every phase', () => {
    const driver = startHumanRoom({ settings: { rounds: 2 } })
    const access = (id: string | null) => getCanvasAccess(driver.state, id)
    expect(access('ana')).toEqual({ full: ['m1-r1-A'], preview: ['m1-r1-B'] })
    expect(access(null)).toEqual({ full: [], preview: ['m1-r1-A', 'm1-r1-B'] })
    driver.pickWords()
    expect(access('cy')).toEqual({ full: ['m1-r1-B'], preview: ['m1-r1-A'] })
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    for (const viewer of ['ana', 'cy', null]) {
      expect(access(viewer)).toEqual({
        full: ['m1-r1-A', 'm1-r1-B'],
        preview: [],
      })
    }
    const teams: TeamId[] = ['A', 'B']
    expect(
      teams.map((team) => driver.view('ana').results?.teams[team].canvasId),
    ).toEqual(['m1-r1-A', 'm1-r1-B'])
  })
})
