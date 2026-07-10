import { describe, expect, it } from 'vitest'

import {
  createDrawingState,
  drawingReducer,
  findTopStrokeAtPoint,
  type DrawingAction,
  type DrawingState,
  type StrokeStyle,
} from './index'

const blackPen: StrokeStyle = {
  color: '#000000',
  width: 0.02,
  opacity: 1,
}

const begin = (strokeId: string, x = 0.1): DrawingAction => ({
  type: 'stroke.begin',
  strokeId,
  point: { x, y: 0.1, pressure: 0.5 },
  style: blackPen,
})

function finishStroke(
  state: DrawingState,
  strokeId: string,
  x = 0.1,
): DrawingState {
  const started = drawingReducer(state, begin(strokeId, x))
  const appended = drawingReducer(started, {
    type: 'stroke.append',
    strokeId,
    startPointIndex: 1,
    points: [{ x: x + 0.2, y: 0.3 }],
  })
  return drawingReducer(appended, {
    type: 'stroke.end',
    strokeId,
    pointCount: 2,
  })
}

describe('drawingReducer', () => {
  it('commits a tap as one single-point stroke that can be hit, undone, and redone', () => {
    const started = drawingReducer(createDrawingState(), begin('dot', 0.4))
    const tapped = drawingReducer(started, {
      type: 'stroke.end',
      strokeId: 'dot',
      pointCount: 1,
    })

    expect(tapped.document.strokeOrder).toEqual(['dot'])
    expect(tapped.document.strokesById.dot).toMatchObject({
      style: { width: blackPen.width },
      points: [{ x: 0.4, y: 0.1, pressure: 0.5 }],
    })
    expect(findTopStrokeAtPoint(tapped, { x: 0.4, y: 0.1 }, 0)?.id).toBe('dot')

    const undone = drawingReducer(tapped, { type: 'drawing.undo' })
    expect(undone.document.strokeOrder).toEqual([])
    expect(drawingReducer(undone, { type: 'drawing.redo' }).document).toEqual(
      tapped.document,
    )
  })

  it('builds a normalized stroke without mutating earlier states', () => {
    const empty = createDrawingState()
    const started = drawingReducer(empty, begin('stroke-1'))
    const appended = drawingReducer(started, {
      type: 'stroke.append',
      strokeId: 'stroke-1',
      startPointIndex: 1,
      points: [{ x: 0.2, y: 0.25, pressure: 0.7 }],
    })
    const ended = drawingReducer(appended, {
      type: 'stroke.end',
      strokeId: 'stroke-1',
      pointCount: 2,
    })

    expect(empty.inProgressOrder).toEqual([])
    expect(started.inProgressById['stroke-1']?.points).toHaveLength(1)
    expect(appended.inProgressById['stroke-1']?.points).toHaveLength(2)
    expect(ended.inProgressOrder).toEqual([])
    expect(ended.document.strokeOrder).toEqual(['stroke-1'])
    expect(ended.document.strokesById['stroke-1']).toMatchObject({
      id: 'stroke-1',
      style: blackPen,
      points: [
        { x: 0.1, y: 0.1, pressure: 0.5 },
        { x: 0.2, y: 0.25, pressure: 0.7 },
      ],
    })
  })

  it('treats one completed stroke as one undo/redo step', () => {
    const drawn = finishStroke(createDrawingState(), 'stroke-1')
    const undone = drawingReducer(drawn, { type: 'drawing.undo' })
    const redone = drawingReducer(undone, { type: 'drawing.redo' })

    expect(undone.document.strokeOrder).toEqual([])
    expect(redone.document).toEqual(drawn.document)
  })

  it('deletes a whole stroke by ID and restores it at the same layer on undo', () => {
    const withBottom = finishStroke(createDrawingState(), 'bottom', 0.1)
    const withBoth = finishStroke(withBottom, 'top', 0.2)
    const deleted = drawingReducer(withBoth, {
      type: 'stroke.delete',
      strokeId: 'bottom',
    })
    const restored = drawingReducer(deleted, { type: 'drawing.undo' })

    expect(deleted.document.strokeOrder).toEqual(['top'])
    expect(restored.document.strokeOrder).toEqual(['bottom', 'top'])
  })

  it('clears completed and in-progress strokes and can undo completed content', () => {
    const completed = finishStroke(createDrawingState(), 'complete')
    const drawing = drawingReducer(completed, begin('in-progress'))
    const cleared = drawingReducer(drawing, { type: 'drawing.clear' })
    const restored = drawingReducer(cleared, { type: 'drawing.undo' })

    expect(cleared.document.strokeOrder).toEqual([])
    expect(cleared.inProgressOrder).toEqual([])
    expect(restored.document.strokeOrder).toEqual(['complete'])
    expect(restored.inProgressOrder).toEqual([])
  })

  it('ignores duplicate and out-of-order chunks and ends', () => {
    const empty = createDrawingState()
    const appendBeforeBegin = drawingReducer(empty, {
      type: 'stroke.append',
      strokeId: 'stroke-1',
      startPointIndex: 1,
      points: [{ x: 0.2, y: 0.2 }],
    })
    const endBeforeBegin = drawingReducer(empty, {
      type: 'stroke.end',
      strokeId: 'stroke-1',
      pointCount: 1,
    })
    const started = drawingReducer(empty, begin('stroke-1'))
    const duplicateBegin = drawingReducer(started, begin('stroke-1'))
    const earlyChunk = drawingReducer(started, {
      type: 'stroke.append',
      strokeId: 'stroke-1',
      startPointIndex: 3,
      points: [{ x: 0.4, y: 0.4 }],
    })
    const appended = drawingReducer(started, {
      type: 'stroke.append',
      strokeId: 'stroke-1',
      startPointIndex: 1,
      points: [{ x: 0.2, y: 0.2 }],
    })
    const duplicateChunk = drawingReducer(appended, {
      type: 'stroke.append',
      strokeId: 'stroke-1',
      startPointIndex: 1,
      points: [{ x: 0.2, y: 0.2 }],
    })
    const earlyEnd = drawingReducer(appended, {
      type: 'stroke.end',
      strokeId: 'stroke-1',
      pointCount: 3,
    })
    const ended = drawingReducer(appended, {
      type: 'stroke.end',
      strokeId: 'stroke-1',
      pointCount: 2,
    })
    const duplicateEnd = drawingReducer(ended, {
      type: 'stroke.end',
      strokeId: 'stroke-1',
      pointCount: 2,
    })

    expect(appendBeforeBegin).toBe(empty)
    expect(endBeforeBegin).toBe(empty)
    expect(duplicateBegin).toBe(started)
    expect(earlyChunk).toBe(started)
    expect(duplicateChunk).toBe(appended)
    expect(earlyEnd).toBe(appended)
    expect(duplicateEnd).toBe(ended)
    expect(ended.document.strokesById['stroke-1']?.points).toHaveLength(2)
    expect(drawingReducer(ended, begin('stroke-1'))).toBe(ended)
  })

  it.each([
    begin('bad-point') as DrawingAction,
    {
      ...begin('outside'),
      point: { x: 1.01, y: 0.5 },
    } as DrawingAction,
    {
      ...begin('bad-color'),
      style: { ...blackPen, color: 'red' },
    } as DrawingAction,
    {
      ...begin('bad-width'),
      style: { ...blackPen, width: 0 },
    } as DrawingAction,
  ])('rejects malformed input without throwing', (action) => {
    const malformed =
      action.type === 'stroke.begin' && action.strokeId === 'bad-point'
        ? ({ ...action, point: { x: Number.NaN, y: 0.5 } } as DrawingAction)
        : action
    const state = createDrawingState()

    expect(drawingReducer(state, malformed)).toBe(state)
  })

  it('drops redo history when a new committed edit creates a branch', () => {
    const first = finishStroke(createDrawingState(), 'first')
    const undone = drawingReducer(first, { type: 'drawing.undo' })
    const branched = finishStroke(undone, 'second')

    expect(branched.history.future).toEqual([])
    expect(drawingReducer(branched, { type: 'drawing.redo' })).toBe(branched)
  })
})

describe('findTopStrokeAtPoint', () => {
  it('returns the topmost whole stroke intersecting a line segment', () => {
    const bottom = finishStroke(createDrawingState(), 'bottom', 0.1)
    const top = finishStroke(bottom, 'top', 0.1)

    expect(findTopStrokeAtPoint(top, { x: 0.2, y: 0.2 }, 0.01)?.id).toBe('top')
    expect(findTopStrokeAtPoint(top, { x: 0.9, y: 0.9 }, 0.01)).toBeUndefined()
  })
})
