import { isStrokeId } from '@drawing-games/drawing-model'
import { describe, expect, it } from 'vitest'

import { botStrokeOps } from './bot-runner'
import { BOT_STROKE_STYLE } from './constants'
import { getNextWakeAtMs } from './engine'
import { RoomDriver } from './test-driver'
import type { RoomEffect } from './types'

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
    // The all-bot team solves every round its bot drew.
    for (const round of match.history) {
      expect(round.teams.B.solution).not.toBeNull()
      const botGuesses = round.teams.B.guesses
      expect(botGuesses.at(-1)?.verdict).toBe('correct')
      expect(
        botGuesses.slice(0, -1).every((guess) => guess.verdict === 'wrong'),
      ).toBe(true)
      expect(botGuesses.length).toBeGreaterThanOrEqual(2)
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

  it('answer a human drawer only after three strokes, within 35–85 % of the round', () => {
    const driver = soloRoom(5)
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.drawer('A')).toBe('solo')
    const start = driver.state.match!.round!.drawingStartedAtMs!
    const deadline = driver.state.phaseDeadlineAtMs!
    for (let index = 0; index < 3; index += 1) {
      driver.now += 200
      driver.ok({
        type: 'drawing.ops',
        actorId: 'solo',
        ops: [
          {
            type: 'stroke.begin',
            strokeId: `h${index}`,
            point: { x: 0.2, y: 0.2 },
            style: { color: '#000000', width: 0.01, opacity: 1 },
          },
          { type: 'stroke.end', strokeId: `h${index}`, pointCount: 1 },
        ],
      })
    }
    while (
      driver.state.phase === 'drawing' &&
      driver.teamRound('A').solution === null
    ) {
      driver.wake()
    }
    const solution = driver.state.match!.round!.teams.A.solution
    expect(solution?.guesserId).toBe('bot_1')
    const share = (solution!.atMs - start) / (deadline - start)
    expect(share).toBeGreaterThanOrEqual(0.35)
    expect(share).toBeLessThanOrEqual(0.85)
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
