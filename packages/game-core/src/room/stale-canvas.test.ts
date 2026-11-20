import type { DrawingAction } from '@drawing-games/drawing-model'
import { describe, expect, it } from 'vitest'

import { startHumanRoom } from './test-driver'
import type { RoomEffect } from './types'

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
      points: [{ x: 0.3, y: 0.3 }],
    },
    { type: 'stroke.end', strokeId: id, pointCount: 2 },
  ]
}

const canvasOps = (effects: readonly RoomEffect[]) =>
  effects.filter((effect) => effect.type === 'canvas.ops')

describe('drawing batches tagged with a canvas', () => {
  it('drops ink sent for a showdown card that has since ended', () => {
    // Four rounds give each team four showdown cards; Sun's relay goes
    // Ana, Ben, Ana, so Ana draws again two cards later.
    const driver = startHumanRoom({ settings: { rounds: 4 } })
    for (let round = 0; round < 4; round += 1) {
      driver.pickWords()
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
      driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    }
    expect(driver.state.phase).toBe('showdown')
    const firstCard = driver.state.match!.showdown!.teams.A.canvasId
    expect(driver.state.match!.showdown!.teams.A.drawerId).toBe('ana')
    driver.ok({
      type: 'drawing.ops',
      actorId: 'ana',
      canvasId: firstCard,
      ops: stroke('card0'),
    })

    driver.solve('A', 'ben')
    driver.solve('A', 'ana')
    const thirdCard = driver.state.match!.showdown!.teams.A
    expect(thirdCard).toMatchObject({ drawerId: 'ana', strokeCount: 0 })
    expect(thirdCard.canvasId).not.toBe(firstCard)

    // A batch Ana drew on the first card arrives late (e.g. resent after a
    // reconnect): refused as stale, so the new card stays blank.
    expect(
      driver.fail({
        type: 'drawing.ops',
        actorId: 'ana',
        canvasId: firstCard,
        ops: stroke('late'),
      }),
    ).toEqual({
      code: 'STALE_CLIENT',
      message: 'That drawing was for a canvas that has ended.',
    })
    expect(canvasOps(driver.effects)).toEqual([])
    expect(driver.state.match!.showdown!.teams.A).toMatchObject({
      strokeCount: 0,
      firstStrokeAtMs: null,
    })

    // Tagged with the current card, the batch is drawn as usual.
    driver.ok({
      type: 'drawing.ops',
      actorId: 'ana',
      canvasId: thirdCard.canvasId,
      ops: stroke('card2'),
    })
    expect(canvasOps(driver.effects)).toEqual([
      expect.objectContaining({
        canvasId: thirdCard.canvasId,
        team: 'A',
        actorId: 'ana',
      }),
    ])
    expect(driver.state.match!.showdown!.teams.A.strokeCount).toBe(1)
  })

  it('drops ink sent for last round once the next round is drawing', () => {
    const driver = startHumanRoom({ settings: { rounds: 4 } })
    driver.pickWords()
    const oldCanvas = driver.teamRound('A').canvasId
    const oldDrawer = driver.drawer('A')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)

    // During results, and again during the next draft, it is stale too.
    expect(
      driver.fail({
        type: 'drawing.ops',
        actorId: oldDrawer,
        canvasId: oldCanvas,
        ops: stroke('late1'),
      }).code,
    ).toBe('STALE_CLIENT')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('word-draft')
    expect(
      driver.fail({
        type: 'drawing.ops',
        actorId: oldDrawer,
        canvasId: oldCanvas,
        ops: stroke('late2'),
      }).code,
    ).toBe('STALE_CLIENT')

    driver.pickWords()
    const newCanvas = driver.teamRound('A').canvasId
    expect(newCanvas).not.toBe(oldCanvas)
    const newDrawer = driver.drawer('A')
    expect(
      driver.fail({
        type: 'drawing.ops',
        actorId: newDrawer,
        canvasId: oldCanvas,
        ops: stroke('late3'),
      }).code,
    ).toBe('STALE_CLIENT')
    expect(driver.teamRound('A').strokeCount).toBe(0)
  })

  it('keeps accepting untagged batches from older clients', () => {
    const driver = startHumanRoom()
    driver.pickWords()
    const drawer = driver.drawer('A')
    driver.ok({ type: 'drawing.ops', actorId: drawer, ops: stroke('legacy') })
    expect(driver.teamRound('A').strokeCount).toBe(1)
    // Untagged, a non-drawer is still refused as before.
    const guesser = driver.guesser('A')
    expect(
      driver.fail({ type: 'drawing.ops', actorId: guesser, ops: stroke('x') })
        .code,
    ).toBe('NOT_ALLOWED')
  })
})
