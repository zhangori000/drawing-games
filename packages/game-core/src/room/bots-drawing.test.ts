import { describe, expect, it } from 'vitest'

import { renderLetterPuzzle, renderTextStrokes } from './bot-font'
import { RoomDriver } from './test-driver'
import type { RoomEffect } from './types'

type CanvasOps = Extract<RoomEffect, { type: 'canvas.ops' }>

/** Solo (joined first, so draws round 1) and a bot on A; two bots on B. */
function soloRoom(seed: number, term?: string): RoomDriver {
  const driver = new RoomDriver({ seed })
  driver.join('solo', 'Solo', { team: 'A' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'A' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'B' })
  driver.ok({ type: 'lobby.add-bot', actorId: 'solo', team: 'B' })
  driver.settings('solo', {
    rounds: 2,
    showdown: false,
    ...(term === undefined
      ? {}
      : {
          customWordsMode: 'only' as const,
          customWords: [term, ...FILLER],
          packIds: [],
        }),
  })
  driver.ok({ type: 'match.start', actorId: 'solo' })
  return driver
}

const FILLER = [
  'kettle',
  'pumpkin',
  'giraffe',
  'trumpet',
  'volcano',
  'lantern',
  'compass',
  'walrus',
  'blender',
  'anchor',
  'cactus',
  'pretzel',
]

/** Plays round 1 out by time and opens round 2, where A's bot draws. */
function toBotDrawnRound(driver: RoomDriver): void {
  driver.advanceTo(driver.state.phaseDeadlineAtMs!)
  driver.advanceTo(driver.state.phaseDeadlineAtMs!)
  driver.advanceTo(driver.state.phaseDeadlineAtMs!)
  expect(driver.state.phase).toBe('word-draft')
  expect(driver.drawer('A')).toMatch(/^bot_/)
}

/** Every batch the bot drew on `canvasId` until the round ended. */
function botBatches(driver: RoomDriver, canvasId: string) {
  const batches: { atMs: number; effect: CanvasOps }[] = []
  while (
    driver.state.phase === 'word-draft' ||
    driver.state.phase === 'drawing'
  ) {
    if (!driver.wake()) break
    for (const effect of driver.effects) {
      if (effect.type === 'canvas.ops' && effect.canvasId === canvasId) {
        batches.push({ atMs: driver.now, effect })
      }
    }
  }
  return batches
}

describe('bot drawers', () => {
  it('draw a letter puzzle and reveal some letters, never writing the word', () => {
    const driver = soloRoom(8, 'shooting star')
    toBotDrawnRound(driver)
    const bot = driver.drawer('A')
    while (driver.state.phase === 'word-draft') driver.wake()
    const drawnTerm = driver.term('A')
    const canvasId = driver.teamRound('A').canvasId
    const start = driver.state.match!.round!.drawingStartedAtMs!
    const budget = driver.state.phaseDeadlineAtMs! - start
    const batches = botBatches(driver, canvasId)

    const puzzle = renderLetterPuzzle(drawnTerm)
    const letters = puzzle.slots.length
    const outline = puzzle.marks.length + letters
    expect(batches.length).toBeGreaterThan(outline)
    for (const { effect } of batches) {
      expect(effect).toMatchObject({ origin: 'bot', actorId: bot })
    }
    // First the blanks: one short flat stroke each, quickly.
    const blanks = batches.slice(0, outline)
    blanks.forEach(({ effect }) => {
      expect(effect.ops.map((op) => op.type)).toEqual([
        'stroke.begin',
        'stroke.append',
        'stroke.end',
      ])
    })
    expect(blanks.at(-1)!.atMs - start).toBeLessThanOrEqual(outline * 450)
    // Then a few letters over the round: at most 60 %, never all of them.
    const reveals = batches.slice(outline)
    expect(reveals.length).toBe(
      Math.min(letters - 1, Math.floor(letters * 0.6)),
    )
    expect(reveals.length).toBeLessThan(letters)
    expect(reveals[0]!.atMs - start).toBeGreaterThanOrEqual(
      budget * 0.15 - 1_500,
    )
    expect(reveals.at(-1)!.atMs - start).toBeLessThanOrEqual(
      budget * 0.75 + 1_500,
    )
    // Stroke ids stay unique on the canvas.
    const ids = batches.flatMap(({ effect }) =>
      effect.ops.flatMap((op) =>
        op.type === 'stroke.begin' ? [op.strokeId] : [],
      ),
    )
    expect(new Set(ids).size).toBe(ids.length)
    // Fewer strokes than writing the word out, let alone the blanks too.
    expect(ids.length).toBeLessThan(
      outline + puzzle.slots.flatMap((slot) => slot.glyph).length,
    )
    expect(ids.length - outline).toBeLessThan(
      renderTextStrokes(drawnTerm).length,
    )
    expect(driver.teamRound('A').solution).toBeNull()
  })

  it('lays out equal blanks, so their widths give nothing away', () => {
    const puzzle = renderLetterPuzzle("jack-o'-lantern")
    expect(puzzle.slots.map((slot) => slot.char).join('')).toBe('JACKOLANTERN')
    expect(puzzle.marks.length).toBe(3)
    const widths = puzzle.slots.map((slot) =>
      Number((slot.blank[1]!.x - slot.blank[0]!.x).toFixed(3)),
    )
    expect(new Set(widths).size).toBe(1)
    for (const slot of puzzle.slots) {
      const blankY = slot.blank[0]!.y
      for (const point of slot.glyph.flat()) {
        expect(point.y).toBeLessThan(blankY)
        expect(point.x).toBeGreaterThanOrEqual(slot.blank[0]!.x - 0.02)
        expect(point.x).toBeLessThanOrEqual(slot.blank[1]!.x + 0.02)
      }
    }
    expect(renderLetterPuzzle('')).toEqual({ slots: [], marks: [] })
  })
})
