import { describe, expect, it, vi } from 'vitest'

import { RoomDriver } from './test-driver'
import type { RoomEffect } from './types'

// A predictable font: one two-point stroke per character, so the bot
// drawing path is tested independently of the real glyph implementation.
vi.mock('./bot-font', () => ({
  renderTextStrokes: (text: string) =>
    Array.from(text).map((_, index) => [
      { x: 0.05 + (index % 10) * 0.09, y: 0.3 },
      { x: 0.1 + (index % 10) * 0.09, y: 0.6 },
    ]),
}))

describe('bot drawers', () => {
  it('draw one stroke per batch every 0.7–1.2 s, and bot guessers answer afterwards', () => {
    const driver = new RoomDriver({ seed: 8 })
    driver.join('solo', 'Solo', { team: 'A' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'A' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'B' })
    driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'B' })
    driver.ok({ type: 'match.start', actorId: 'solo' })
    const drawerB = driver.drawer('B')
    expect(drawerB.startsWith('bot_')).toBe(true)

    while (driver.state.phase === 'word-draft') driver.wake()
    const start = driver.state.match!.round!.drawingStartedAtMs!
    const term = driver.term('B')
    const strokes: {
      atMs: number
      effect: Extract<RoomEffect, { type: 'canvas.ops' }>
    }[] = []
    while (
      driver.state.phase === 'drawing' &&
      driver.teamRound('B').solution === null
    ) {
      driver.wake()
      for (const effect of driver.effects) {
        if (effect.type === 'canvas.ops' && effect.team === 'B') {
          strokes.push({ atMs: driver.now, effect })
        }
      }
    }
    const solution = driver.state.match!.round!.teams.B.solution
    expect(solution).not.toBeNull()
    expect(strokes.length).toBeGreaterThanOrEqual(
      Math.ceil(Array.from(term).length * 0.6),
    )
    strokes.forEach(({ atMs, effect }, index) => {
      expect(effect).toMatchObject({
        origin: 'bot',
        actorId: drawerB,
        canvasId: 'm1-r1-B',
      })
      expect(effect.ops.map((op) => op.type)).toEqual([
        'stroke.begin',
        'stroke.append',
        'stroke.end',
      ])
      expect(effect.ops[0]).toMatchObject({ strokeId: `b-m1-r1-B-${index}` })
      const previous = index === 0 ? start : strokes[index - 1]!.atMs
      expect(atMs - previous).toBeGreaterThanOrEqual(700)
      expect(atMs - previous).toBeLessThanOrEqual(1_200)
    })
    const recognizedAt =
      strokes[Math.ceil(Array.from(term).length * 0.6) - 1]!.atMs
    expect(solution!.atMs - recognizedAt).toBeGreaterThanOrEqual(2_000)
    expect(solution!.atMs - recognizedAt).toBeLessThanOrEqual(5_000)
    expect(driver.teamRound('B').strokeCount).toBe(strokes.length)
    // Once solved, the bot stops drawing that canvas.
    expect(
      driver.state.bots.schedule.filter(
        (item) =>
          item.action.type !== 'draft.pick' &&
          item.action.canvasId === 'm1-r1-B',
      ),
    ).toEqual([])
  })
})
