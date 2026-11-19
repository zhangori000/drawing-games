import {
  createDrawingState,
  drawingReducer,
  type DrawingAction,
} from '@drawing-games/drawing-model'
import { expect, test } from '@playwright/test'

import {
  StrokeGesture,
  createStrokeId,
  normalizePointer,
} from './stroke-gesture'

const STYLE = { color: '#5c4cf2', width: 0.012, opacity: 1 }
const PAPER = { width: 400, height: 300 }

function apply(ops: readonly DrawingAction[]) {
  return ops.reduce(drawingReducer, createDrawingState())
}

test('a jittery tap stays one single-point stroke', () => {
  const gesture = new StrokeGesture()
  const ops = [
    ...gesture.begin(1, { x: 0.5, y: 0.5 }, STYLE, 'tap'),
    ...gesture.move(1, [{ x: 0.502, y: 0.501 }], PAPER),
    ...gesture.end(1, [{ x: 0.503, y: 0.5 }], PAPER),
  ]
  expect(ops.map((op) => op.type)).toEqual(['stroke.begin', 'stroke.end'])
  const state = apply(ops)
  expect(state.document.strokesById.tap?.points).toHaveLength(1)
})

test('a drag appends the held samples once and ends with the full count', () => {
  const gesture = new StrokeGesture()
  const ops = [
    ...gesture.begin(1, { x: 0.1, y: 0.5 }, STYLE, 'drag'),
    ...gesture.move(1, [{ x: 0.104, y: 0.5 }], PAPER),
    ...gesture.move(
      1,
      [
        { x: 0.2, y: 0.5 },
        { x: 0.3, y: 0.5 },
      ],
      PAPER,
    ),
    ...gesture.end(1, [{ x: 0.4, y: 0.5 }], PAPER),
  ]
  expect(ops.map((op) => op.type)).toEqual([
    'stroke.begin',
    'stroke.append',
    'stroke.append',
    'stroke.end',
  ])
  const state = apply(ops)
  expect(state.document.strokeOrder).toEqual(['drag'])
  expect(state.document.strokesById.drag?.points).toHaveLength(5)
  expect(gesture.liveStroke).toBeNull()
})

test('a second pointer is ignored and cancel drops the stroke', () => {
  const gesture = new StrokeGesture()
  gesture.begin(1, { x: 0.1, y: 0.1 }, STYLE, 'first')
  expect(gesture.begin(2, { x: 0.9, y: 0.9 }, STYLE)).toEqual([])
  expect(gesture.move(2, [{ x: 0.5, y: 0.5 }], PAPER)).toEqual([])
  expect(gesture.cancel(1)).toEqual([
    { type: 'stroke.delete', strokeId: 'first' },
  ])
  expect(gesture.activePointerId).toBeNull()
})

test('pointer positions are normalized to the paper and clamped', () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 }
  expect(
    normalizePointer({ clientX: 300, clientY: 200, pressure: 0 }, rect),
  ).toEqual({ x: 0.5, y: 0.5 })
  expect(
    normalizePointer({ clientX: 0, clientY: 999, pressure: 0.5 }, rect),
  ).toEqual({ x: 0, y: 1, pressure: 0.5 })
  expect(createStrokeId()).toMatch(/^[A-Za-z0-9_-]+$/)
})
