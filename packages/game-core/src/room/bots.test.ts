import { isStrokeId, type DrawingAction } from '@drawing-games/drawing-model'
import { describe, expect, it } from 'vitest'

import { botStrokeOps } from './bot-runner'
import { BOT_STROKE_STYLE } from './constants'
import { getNextWakeAtMs } from './engine'
import { RoomDriver } from './test-driver'
import type { WordDifficulty } from '../types'
import type { RoomEffect, TeamRoundState } from './types'

function soloRoom(seed: number, rounds = 4): RoomDriver {
  const driver = new RoomDriver({ seed })
  driver.join('solo', 'Solo', { team: 'A', accountId: 'solo-acct' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'A' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'B' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'B' })
  driver.settings('solo', { rounds })
  driver.ok({ type: 'match.start', actorId: 'solo' })
  return driver
}

/** Each difficulty's solve window, as a share of the round (bots.ts). */
const SOLVE_WINDOWS: Record<WordDifficulty, readonly [number, number]> = {
  easy: [0.2, 0.6],
  medium: [0.3, 0.7],
  hard: [0.4, 0.85],
}

function chosenDifficulty(teamRound: TeamRoundState): WordDifficulty {
  return teamRound.options.find(
    (option) => option.wordId === teamRound.chosenWordId,
  )!.difficulty
}

/** A straight human stroke with `points` points, `step` apart. */
function humanStroke(
  strokeId: string,
  points: number,
  step: number,
): DrawingAction[] {
  const line = Array.from({ length: points }, (_, index) => ({
    x: 0.1 + ((index * step) % 0.8),
    y: 0.2 + Math.floor((index * step) / 0.8) * 0.05,
  }))
  return [
    {
      type: 'stroke.begin',
      strokeId,
      point: line[0]!,
      style: { color: '#000000', width: 0.01, opacity: 1 },
    },
    ...(line.length > 1
      ? [
          {
            type: 'stroke.append' as const,
            strokeId,
            startPointIndex: 1,
            points: line.slice(1),
          },
        ]
      : []),
    { type: 'stroke.end', strokeId, pointCount: line.length },
  ]
}

/** The human draws eight solid strokes over the first ten seconds. */
function drawPicture(driver: RoomDriver): void {
  for (let index = 0; index < 8; index += 1) {
    driver.advanceBy(1_200)
    if (driver.state.phase !== 'drawing') return
    driver.ok({
      type: 'drawing.ops',
      actorId: driver.drawer('A'),
      ops: humanStroke(`p${index}`, 20, 0.04),
    })
  }
}

function playOutRound(driver: RoomDriver): void {
  while (driver.state.phase === 'drawing') driver.wake()
}

/**
 * A plausible solo player: picks the medium card and draws a real picture;
 * as a guesser, solves the bot's puzzle once two letters are showing.
 */
function playAsHuman(driver: RoomDriver, lettersNeeded = 2): void {
  let revealed = 0
  let canvasId: string | null = null
  for (
    let step = 0;
    step < 5_000 && driver.state.phase !== 'stats';
    step += 1
  ) {
    const phase = driver.state.phase
    if (phase === 'word-draft' && driver.drawer('A') === 'solo') {
      const teamRound = driver.teamRound('A')
      if (teamRound.chosenWordId === null) {
        const card =
          teamRound.options.find((option) => option.difficulty === 'medium') ??
          teamRound.options[0]!
        driver.ok({
          type: 'draft.select',
          actorId: 'solo',
          wordId: card.wordId,
        })
        continue
      }
    }
    if (phase === 'drawing' && driver.teamRound('A').solution === null) {
      const teamRound = driver.teamRound('A')
      if (teamRound.drawerId === 'solo' && teamRound.strokeCount === 0) {
        drawPicture(driver)
        continue
      }
      if (teamRound.drawerId !== 'solo') {
        if (canvasId !== teamRound.canvasId) {
          canvasId = teamRound.canvasId
          revealed = 0
        }
        if (revealed >= lettersNeeded) {
          driver.ok({
            type: 'guess.submit',
            actorId: 'solo',
            text: driver.term('A'),
          })
          continue
        }
      }
    }
    if (phase === 'showdown') {
      const teamState = driver.state.match!.showdown!.teams.A
      if (teamState.drawerId === 'solo' && teamState.strokeCount === 0) {
        for (let index = 0; index < 8; index += 1) {
          driver.advanceBy(1_000)
          if (driver.state.match!.showdown!.teams.A.drawerId !== 'solo') break
          driver.ok({
            type: 'drawing.ops',
            actorId: 'solo',
            ops: humanStroke(`s${step}-${index}`, 20, 0.04),
          })
        }
        continue
      }
      if (teamState.drawerId !== null && teamState.drawerId !== 'solo') {
        if (canvasId !== teamState.canvasId) {
          canvasId = teamState.canvasId
          revealed = 0
        }
        if (revealed >= lettersNeeded) {
          driver.ok({
            type: 'guess.submit',
            actorId: 'solo',
            text: driver.showdownTerm('A'),
          })
          continue
        }
      }
    }
    if (!driver.wake()) break
    for (const effect of driver.effects) {
      if (
        effect.type === 'canvas.ops' &&
        effect.canvasId === canvasId &&
        effect.origin === 'bot' &&
        effect.ops.filter((op) => op.type === 'stroke.begin').length > 0 &&
        isLetterBatch(effect)
      ) {
        revealed += 1
      }
    }
  }
}

/** Letter reveals come after the blanks; blanks are single short strokes. */
function isLetterBatch(effect: Extract<RoomEffect, { type: 'canvas.ops' }>) {
  const begin = effect.ops.find((op) => op.type === 'stroke.begin')
  const append = effect.ops.find((op) => op.type === 'stroke.append')
  const flat =
    begin !== undefined &&
    append !== undefined &&
    append.type === 'stroke.append' &&
    begin.type === 'stroke.begin' &&
    effect.ops.filter((op) => op.type === 'stroke.begin').length === 1 &&
    append.points.length === 1 &&
    append.points[0]!.y === begin.point.y
  return !flat
}

/** Advances only by time, checking that pending work always has a wake. */
function runByTime(driver: RoomDriver, limit = 5_000): number {
  let wakes = 0
  for (; wakes < limit; wakes += 1) {
    const next = getNextWakeAtMs(driver.state)
    const pending =
      driver.state.phaseDeadlineAtMs !== null ||
      driver.state.bots.schedule.length > 0
    expect(next !== null).toBe(pending)
    const firstBot = driver.state.bots.schedule[0]
    if (next !== null && firstBot !== undefined) {
      expect(next).toBeLessThanOrEqual(firstBot.atMs)
    }
    if (next === null) break
    driver.advanceTo(next)
  }
  return wakes
}

describe('practice bots', () => {
  it('play a full match with one human purely by time', () => {
    const driver = soloRoom(11)
    expect(driver.state.match?.withBots).toBe(true)
    const wakes = runByTime(driver)
    expect(driver.state.phase).toBe('stats')
    expect(wakes).toBeGreaterThan(10)

    const match = driver.state.match!
    expect(match.history).toHaveLength(4)
    // Bot guessers make 1–4 clearly wrong guesses; when they solve, the
    // correct guess is their last one.
    for (const round of match.history) {
      const botGuesses = round.teams.B.guesses
      expect(botGuesses.length).toBeGreaterThanOrEqual(1)
      const solved = round.teams.B.solution !== null
      const wrong = solved ? botGuesses.slice(0, -1) : botGuesses
      expect(wrong.every((guess) => guess.verdict === 'wrong')).toBe(true)
      if (solved) expect(botGuesses.at(-1)?.verdict).toBe('correct')
    }
    // Bot drawers picked their own cards 2–5 s into the draft.
    for (const round of match.history) {
      expect(round.teams.B.chosenBy).toBe('drawer')
    }
    // The human never drew, so their bot teammate never answered.
    const humanRounds = match.history.filter(
      (round) => round.teams.A.drawerId === 'solo',
    )
    expect(humanRounds.length).toBeGreaterThan(0)
    for (const round of humanRounds) {
      expect(round.teams.A.solution).toBeNull()
      expect(round.teams.A.chosenBy).toBe('auto')
    }
    expect(driver.state.match?.showdown).not.toBeNull()

    const effects = driver.history
    const forBots = (effect: RoomEffect) =>
      (effect.type === 'guess.feedback' &&
        effect.memberId.startsWith('bot_')) ||
      (effect.type === 'canvas.ops' &&
        effect.origin === 'bot' &&
        !effect.actorId.startsWith('bot_'))
    expect(effects.filter(forBots)).toEqual([])
    const accountEffects = effects.filter(
      (effect) =>
        effect.type === 'account.words' || effect.type === 'account.match',
    )
    expect(
      accountEffects.every(
        (effect) => 'accountId' in effect && effect.accountId === 'solo-acct',
      ),
    ).toBe(true)
    for (const effect of effects) {
      if (effect.type !== 'canvas.ops' || effect.origin !== 'bot') continue
      for (const op of effect.ops) {
        if ('strokeId' in op) {
          expect(isStrokeId(op.strokeId)).toBe(true)
          expect(op.strokeId.startsWith(`b-${effect.canvasId}-`)).toBe(true)
        }
        if (op.type === 'stroke.begin')
          expect(op.style).toEqual(BOT_STROKE_STYLE)
      }
    }
  })

  it('answer a human drawer only once the ink looks like a real attempt', () => {
    let scribbled = 0
    let drew = 0
    for (let seed = 1; seed <= 12; seed += 1) {
      // Three dots: never enough ink, so the bot keeps looking.
      const dots = soloRoom(seed)
      dots.advanceTo(dots.state.phaseDeadlineAtMs!)
      for (let index = 0; index < 3; index += 1) {
        dots.now += 200
        dots.ok({
          type: 'drawing.ops',
          actorId: 'solo',
          ops: humanStroke(`d${index}`, 1, 0.01),
        })
      }
      playOutRound(dots)
      expect(dots.state.match!.history[0]!.teams.A.solution).toBeNull()
      scribbled += 1

      // A real drawing: the bot answers in its window for the difficulty,
      // or (sometimes) never.
      const real = soloRoom(seed)
      real.advanceTo(real.state.phaseDeadlineAtMs!)
      const start = real.state.match!.round!.drawingStartedAtMs!
      const budget = real.state.phaseDeadlineAtMs! - start
      drawPicture(real)
      playOutRound(real)
      const round = real.state.match!.history[0]!
      const solution = round.teams.A.solution
      if (solution === null) continue
      drew += 1
      expect(solution.guesserId).toBe('bot_1')
      const window = SOLVE_WINDOWS[chosenDifficulty(round.teams.A)]
      const share = (solution.atMs - start) / budget
      expect(share).toBeGreaterThanOrEqual(window[0])
      expect(share).toBeLessThanOrEqual(window[1] + 0.05)
    }
    expect(scribbled).toBe(12)
    expect(drew).toBeGreaterThanOrEqual(8)
  })

  it('give both teams the same clock, whoever draws', () => {
    const human: number[] = []
    const bot: number[] = []
    let humanMisses = 0
    let botMisses = 0
    for (let seed = 1; seed <= 80; seed += 1) {
      const driver = soloRoom(seed, 2)
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      const start = driver.state.match!.round!.drawingStartedAtMs!
      const budget = driver.state.phaseDeadlineAtMs! - start
      drawPicture(driver)
      playOutRound(driver)
      const round = driver.state.match!.history[0]!
      const share = (solution: { atMs: number } | null) =>
        solution === null ? null : (solution.atMs - start) / budget
      // Same difficulty on both sides keeps the comparison fair.
      if (chosenDifficulty(round.teams.A) !== chosenDifficulty(round.teams.B)) {
        continue
      }
      const a = share(round.teams.A.solution)
      const b = share(round.teams.B.solution)
      if (a === null) humanMisses += 1
      else human.push(a)
      if (b === null) botMisses += 1
      else bot.push(b)
    }
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length
    expect(human.length).toBeGreaterThan(10)
    expect(bot.length).toBeGreaterThan(10)
    expect(Math.abs(mean(human) - mean(bot))).toBeLessThan(0.1)
    expect(Math.abs(humanMisses - botMisses)).toBeLessThanOrEqual(6)
  })

  it('let a solo human with one bot teammate win, depending on how well they play', () => {
    const results = (lettersNeeded: number) => {
      const tally = { A: 0, B: 0, tie: 0 }
      for (let seed = 1; seed <= 16; seed += 1) {
        const driver = soloRoom(seed, 4)
        playAsHuman(driver, lettersNeeded)
        expect(driver.state.phase).toBe('stats')
        tally[driver.state.match!.winner ?? 'tie'] += 1
      }
      return tally
    }
    // Solving the bot's puzzle at its 2nd, 3rd, or 5th letter.
    const quick = results(2)
    const average = results(3)
    const slow = results(5)
    expect(quick.A).toBeGreaterThanOrEqual(10)
    expect(average.A).toBeGreaterThanOrEqual(6)
    expect(average.B).toBeGreaterThanOrEqual(3)
    expect(slow.B).toBeGreaterThanOrEqual(9)
  })

  it('never vote on hints or surrender', () => {
    const driver = soloRoom(21, 6)
    runByTime(driver)
    for (const round of driver.state.match!.history) {
      for (const team of ['A', 'B'] as const) {
        expect(Object.keys(round.teams[team].hint.votes)).toEqual([])
      }
    }
  })
})

describe('bot stroke batches', () => {
  it('are begin + chunked appends + end with valid ids', () => {
    const points = Array.from({ length: 300 }, (_, index) => ({
      x: index / 300,
      y: 0.5,
    }))
    const ops = botStrokeOps('b-m1-r1-A-0', points)
    expect(ops[0]).toMatchObject({
      type: 'stroke.begin',
      point: points[0],
      style: BOT_STROKE_STYLE,
    })
    expect(
      ops
        .slice(1, -1)
        .map((op) => (op.type === 'stroke.append' ? op.startPointIndex : -1)),
    ).toEqual([1, 129, 257])
    expect(ops.at(-1)).toEqual({
      type: 'stroke.end',
      strokeId: 'b-m1-r1-A-0',
      pointCount: 300,
    })
    expect(
      botStrokeOps('b-x-0', [{ x: 0.5, y: 0.5 }]).map((op) => op.type),
    ).toEqual(['stroke.begin', 'stroke.end'])
    expect(botStrokeOps('b-x-0', [])).toEqual([])
  })
})
