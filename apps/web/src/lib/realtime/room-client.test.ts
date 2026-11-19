import { expect, test } from 'vitest'

import { makeView } from '../testing/fake-socket'
import { drawableCanvasId } from './room-client'

test('drawing batches only target the canvas the view says this member may draw on', () => {
  expect(drawableCanvasId(null)).toBeNull()
  expect(drawableCanvasId(makeView({ phase: 'lobby' }))).toBeNull()

  const round = (canDraw: boolean) => ({
    number: 1,
    mine: { canvasId: 'm1-r1-A', canDraw },
  })
  expect(
    drawableCanvasId(makeView({ phase: 'drawing', round: round(true) })),
  ).toBe('m1-r1-A')
  expect(
    drawableCanvasId(makeView({ phase: 'drawing', round: round(false) })),
  ).toBeNull()
  // Picking a word is not drawing yet.
  expect(
    drawableCanvasId(makeView({ phase: 'word-draft', round: round(true) })),
  ).toBeNull()

  const showdown = (canDraw: boolean) => ({
    mine: { canvasId: 'm1-sd-B-2', canDraw },
  })
  expect(
    drawableCanvasId(makeView({ phase: 'showdown', showdown: showdown(true) })),
  ).toBe('m1-sd-B-2')
  expect(
    drawableCanvasId(
      makeView({ phase: 'showdown', showdown: showdown(false) }),
    ),
  ).toBeNull()
  expect(
    drawableCanvasId(makeView({ phase: 'round-results', round: round(true) })),
  ).toBeNull()
})
