import type {
  DrawingAction,
  DrawingDocument,
  NormalizedPoint,
} from '@drawing-games/drawing-model'
import { expect, test } from 'vitest'

import { ManualTimers } from '../testing/manual-timers'
import { CanvasStore } from './canvas-store'
import { RoomCommandError } from './command-error'
import {
  MAX_DRAWING_BATCH_BYTES,
  encodedBatchBytes,
  planDrawingBatches,
} from './drawing-batches'

const STYLE = { color: '#181713', width: 0.012, opacity: 1 }

function points(count: number, offset = 0): NormalizedPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    x: ((index + offset) % 100) / 100,
    y: 0.5,
  }))
}

function stroke(id: string, pointCount: number): DrawingAction[] {
  const [first, ...rest] = points(pointCount)
  return [
    {
      type: 'stroke.begin',
      strokeId: id,
      point: first ?? { x: 0, y: 0 },
      style: STYLE,
    },
    ...(rest.length > 0
      ? [
          {
            type: 'stroke.append',
            strokeId: id,
            startPointIndex: 1,
            points: rest,
          } as const,
        ]
      : []),
    { type: 'stroke.end', strokeId: id, pointCount },
  ]
}

/** A point with full float precision, like a real pointer event. */
function precisePoint(index: number): NormalizedPoint {
  return {
    x: (index + 0.123456789) / 1_000.987654321,
    y: 1 / (index + 3),
    pressure: 0.333333333333333,
  }
}

function setup(options: { canSend?: () => boolean } = {}) {
  const timers = new ManualTimers()
  const sent: { canvasId: string; ops: readonly DrawingAction[] }[] = []
  const settlers: {
    resolve: () => void
    reject: (error?: unknown) => void
  }[] = []
  let resyncs = 0
  const store = new CanvasStore({
    timers,
    canSend: options.canSend,
    requestResync: () => (resyncs += 1),
    sendBatch: (canvasId, ops) => {
      sent.push({ canvasId, ops })
      return new Promise<void>((resolve, reject) => {
        settlers.push({
          resolve,
          reject: (error = new Error('refused')) => reject(error),
        })
      })
    },
  })
  return { store, timers, sent, settlers, resyncs: () => resyncs }
}

test('batch planning merges appends, splits at 128 points, packs 32 ops', () => {
  const ops: DrawingAction[] = [
    {
      type: 'stroke.begin',
      strokeId: 's1',
      point: { x: 0, y: 0 },
      style: STYLE,
    },
    {
      type: 'stroke.append',
      strokeId: 's1',
      startPointIndex: 1,
      points: points(100),
    },
    {
      type: 'stroke.append',
      strokeId: 's1',
      startPointIndex: 101,
      points: points(100, 100),
    },
    { type: 'stroke.end', strokeId: 's1', pointCount: 201 },
  ]
  const [batch] = planDrawingBatches(ops)
  expect(batch?.map((op) => op.type)).toEqual([
    'stroke.begin',
    'stroke.append',
    'stroke.append',
    'stroke.end',
  ])
  const appends = batch?.filter((op) => op.type === 'stroke.append') ?? []
  expect(
    appends.map(
      (op) =>
        op.type === 'stroke.append' && [op.startPointIndex, op.points.length],
    ),
  ).toEqual([
    [1, 128],
    [129, 72],
  ])

  const many = Array.from({ length: 70 }, (_, index): DrawingAction => ({
    type: 'stroke.delete',
    strokeId: `s${index}`,
  }))
  expect(planDrawingBatches(many).map((entry) => entry.length)).toEqual([
    32, 32, 6,
  ])
})

test('batch planning caps each batch at ~48 KiB of JSON, in order', () => {
  // 32 strokes of 128 full-precision points: ~300 KB as one 32-op batch,
  // far over the room's 64 KiB message cap.
  const ops: DrawingAction[] = []
  for (let stroke = 0; stroke < 32; stroke += 1) {
    ops.push({
      type: 'stroke.append',
      strokeId: `s${stroke}`,
      startPointIndex: 1,
      points: Array.from({ length: 128 }, (_, index) => precisePoint(index)),
    })
  }
  expect(encodedBatchBytes(ops)).toBeGreaterThan(64 * 1024)

  const batches = planDrawingBatches(ops)
  expect(batches.length).toBeGreaterThan(1)
  for (const batch of batches) {
    expect(batch.length).toBeLessThanOrEqual(32)
    expect(encodedBatchBytes(batch)).toBeLessThanOrEqual(
      MAX_DRAWING_BATCH_BYTES,
    )
  }
  // Nothing lost, duplicated, or reordered.
  expect(batches.flat()).toEqual(ops)
})

test('an append too large for one batch is split into contiguous appends', () => {
  const points = Array.from({ length: 128 }, (_, index) => precisePoint(index))
  const ops: DrawingAction[] = [
    { type: 'stroke.append', strokeId: 'big', startPointIndex: 5, points },
  ]
  const maxBytes = 2_000
  const batches = planDrawingBatches(ops, { maxBytes })
  expect(batches.length).toBeGreaterThan(1)
  for (const batch of batches) {
    expect(encodedBatchBytes(batch)).toBeLessThanOrEqual(maxBytes)
  }
  const appends = batches.flat()
  let next = 5
  for (const op of appends) {
    if (op.type !== 'stroke.append') throw new Error(`unexpected ${op.type}`)
    expect(op.strokeId).toBe('big')
    expect(op.startPointIndex).toBe(next)
    next += op.points.length
  }
  expect(
    appends.flatMap((op) => (op.type === 'stroke.append' ? op.points : [])),
  ).toEqual(points)
})

test('local ops apply immediately and flush as one batch after ~50 ms', () => {
  const { store, timers, sent } = setup()
  let notified = 0
  store.subscribe('m1-r1-A', () => (notified += 1))

  store.queueLocalOps('m1-r1-A', stroke('a', 3).slice(0, 1))
  store.queueLocalOps('m1-r1-A', stroke('a', 3).slice(1))
  expect(store.getSnapshot('m1-r1-A').document.strokeOrder).toEqual(['a'])
  expect(notified).toBe(2)
  expect(sent).toHaveLength(0)

  timers.advance(50)
  expect(sent).toHaveLength(1)
  expect(sent[0]?.ops.map((op) => op.type)).toEqual([
    'stroke.begin',
    'stroke.append',
    'stroke.end',
  ])
})

test('ops are held and coalesced while the connection cannot send', () => {
  let online = false
  const { store, timers, sent } = setup({ canSend: () => online })
  store.queueLocalOps('c', [
    {
      type: 'stroke.begin',
      strokeId: 'a',
      point: { x: 0, y: 0 },
      style: STYLE,
    },
  ])
  for (let index = 0; index < 10; index += 1) {
    store.queueLocalOps('c', [
      {
        type: 'stroke.append',
        strokeId: 'a',
        startPointIndex: 1 + index,
        points: points(1, index),
      },
    ])
  }
  timers.advance(500)
  expect(sent).toHaveLength(0)
  expect(store.hasUnsentOps('c')).toBe(true)

  online = true
  timers.advance(100)
  expect(sent).toHaveLength(1)
  expect(sent[0]?.ops).toHaveLength(2) // begin + one merged append
})

test('a snapshot keeps unacknowledged local ink on top', () => {
  const { store, timers, settlers } = setup()
  store.queueLocalOps('c', stroke('mine', 2))
  timers.advance(50)

  const server: DrawingDocument = {
    strokesById: { old: { id: 'old', style: STYLE, points: points(1) } },
    strokeOrder: ['old'],
  }
  store.applySnapshot('c', server)
  expect(store.getSnapshot('c').document.strokeOrder).toEqual(['old', 'mine'])

  settlers[0]?.resolve()
  return Promise.resolve().then(() => {
    expect(store.hasUnsentOps('c')).toBe(false)
  })
})

test('an identical snapshot keeps local undo history', () => {
  const { store, timers, settlers } = setup()
  store.queueLocalOps('c', stroke('a', 2))
  timers.advance(50)
  settlers[0]?.resolve()
  const before = store.getSnapshot('c')
  expect(before.history.past).toHaveLength(1)

  store.applySnapshot('c', before.document)
  expect(store.getSnapshot('c')).toBe(before)
})

test('a snapshot mid-stroke keeps the stroke the drawer is still dragging', async () => {
  const { store, timers, settlers } = setup()
  const [begin] = stroke('drag', 3)
  if (!begin) throw new Error('missing begin')
  store.queueLocalOps('c', [begin])
  timers.advance(50)
  settlers[0]?.resolve()
  await Promise.resolve()

  store.applySnapshot('c', { strokesById: {}, strokeOrder: [] })
  store.queueLocalOps('c', [
    {
      type: 'stroke.append',
      strokeId: 'drag',
      startPointIndex: 1,
      points: points(2, 1),
    },
    { type: 'stroke.end', strokeId: 'drag', pointCount: 3 },
  ])
  expect(store.getSnapshot('c').document.strokeOrder).toEqual(['drag'])
})

test('remote ops and previews notify only their canvas', () => {
  const { store } = setup()
  let a = 0
  let b = 0
  store.subscribe('A', () => (a += 1))
  store.subscribe('B', () => (b += 1))
  store.applyRemoteOps('A', stroke('r', 1))
  store.setPreview({
    canvasId: 'B',
    team: 'B',
    cols: 1,
    rows: 1,
    cells: ['#ff6b4a'],
  })
  expect(store.getSnapshot('A').document.strokeOrder).toEqual(['r'])
  expect(store.getPreview('B')?.cells).toEqual(['#ff6b4a'])
  expect([a, b]).toEqual([1, 1])
})

test('a batch refused as TOO_LARGE is dropped and asks for fresh snapshots', async () => {
  const { store, timers, sent, settlers, resyncs } = setup()
  store.queueLocalOps('c', stroke('lost', 3))
  timers.advance(50)
  expect(sent).toHaveLength(1)

  settlers[0]?.reject(new RoomCommandError('TOO_LARGE', 'too big'))
  await Promise.resolve()
  expect(store.hasUnsentOps('c')).toBe(false)
  expect(resyncs()).toBe(1)
  // Never resent.
  timers.advance(1_000)
  expect(sent).toHaveLength(1)

  // The room's snapshot (without the lost stroke) wins.
  store.applySnapshot('c', { strokesById: {}, strokeOrder: [] })
  expect(store.getSnapshot('c').document.strokeOrder).toEqual([])
})

test('other refusals drop the batch without a resync', async () => {
  const { store, timers, settlers, resyncs } = setup()
  store.queueLocalOps('c', stroke('late', 2))
  timers.advance(50)
  settlers[0]?.reject(new RoomCommandError('NOT_ALLOWED', 'round over'))
  await Promise.resolve()
  expect(store.hasUnsentOps('c')).toBe(false)
  expect(resyncs()).toBe(0)
})
