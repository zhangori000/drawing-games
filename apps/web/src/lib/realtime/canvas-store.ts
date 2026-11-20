import {
  createDrawingState,
  drawingReducer,
  type DrawingAction,
  type DrawingDocument,
  type DrawingState,
} from '@drawing-games/drawing-model'
import type { CanvasPreviewPayload } from '@drawing-games/protocol'

import { browserTimers } from './browser-adapters'
import { isRoomCommandError } from './command-error'
import type { TimerApi } from './connection-types'
import { planDrawingBatches } from './drawing-batches'

export interface CanvasStoreOptions {
  /** Sends one `drawing.batch`; resolves on ack, rejects if refused. */
  readonly sendBatch: (
    canvasId: string,
    ops: readonly DrawingAction[],
  ) => Promise<unknown>
  /** False while disconnected or backed up: ops are held and coalesced. */
  readonly canSend?: () => boolean
  /**
   * Local ink was dropped without reaching the room (a batch refused as
   * `TOO_LARGE`): ask for authoritative snapshots so the drawer's canvas
   * matches what everyone else sees.
   */
  readonly requestResync?: () => void
  readonly flushIntervalMs?: number
  readonly retryIntervalMs?: number
  readonly timers?: TimerApi
}

interface CanvasEntry {
  state: DrawingState
  /** Local ops applied optimistically but not yet sent. */
  queued: DrawingAction[]
  /** Sent batches awaiting their ack, in send order. */
  readonly inFlight: Map<number, readonly DrawingAction[]>
  preview: CanvasPreviewPayload | null
  readonly listeners: Set<() => void>
}

const EMPTY_STATE = createDrawingState()

/**
 * Client-side canvases keyed by canvasId, as an external store for
 * `useSyncExternalStore`. Remote canvases follow server snapshots and ops;
 * the drawer's own canvas applies local ops immediately and streams them to
 * the room in small batches. Local ops that the room has not acknowledged are
 * re-applied on top of any snapshot, so a reconnect never erases fresh ink.
 */
export class CanvasStore {
  private readonly entries = new Map<string, CanvasEntry>()
  private readonly options: CanvasStoreOptions
  private readonly timers: TimerApi
  private flushTimer: unknown = null
  private nextBatchId = 1

  constructor(options: CanvasStoreOptions) {
    this.options = options
    this.timers = options.timers ?? browserTimers
  }

  /* ------------------------------- reading -------------------------------- */

  getSnapshot = (canvasId: string): DrawingState =>
    this.entries.get(canvasId)?.state ?? EMPTY_STATE

  getPreview = (canvasId: string): CanvasPreviewPayload | null =>
    this.entries.get(canvasId)?.preview ?? null

  subscribe = (canvasId: string, listener: () => void): (() => void) => {
    const entry = this.entry(canvasId)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  /** Whether any local ops for this canvas (or any canvas) are unacknowledged. */
  hasUnsentOps(canvasId?: string): boolean {
    const entries =
      canvasId === undefined
        ? [...this.entries.values()]
        : [this.entries.get(canvasId)].filter(
            (entry): entry is CanvasEntry => entry !== undefined,
          )
    return entries.some(
      (entry) => entry.queued.length > 0 || entry.inFlight.size > 0,
    )
  }

  /* ---------------------------- server updates ---------------------------- */

  /** Authoritative full canvas. Unacknowledged local ops are re-applied. */
  applySnapshot(canvasId: string, document: DrawingDocument): void {
    const entry = this.entry(canvasId)
    let next = createDrawingState({ document })
    for (const ops of entry.inFlight.values()) next = applyOps(next, ops)
    next = applyOps(next, entry.queued)

    // Same strokes as we already show: keep local state so undo history and
    // any half-drawn stroke survive a resume.
    if (sameDocument(next.document, entry.state.document)) return

    this.setState(entry, carryInProgress(next, entry.state))
  }

  applyRemoteOps(canvasId: string, ops: readonly DrawingAction[]): void {
    const entry = this.entry(canvasId)
    this.setState(entry, applyOps(entry.state, ops))
  }

  setPreview(preview: CanvasPreviewPayload): void {
    const entry = this.entry(preview.canvasId)
    entry.preview = preview
    this.notify(entry)
  }

  /* ----------------------------- local drawing ---------------------------- */

  /** Applies the drawer's ops now and schedules them for the next batch. */
  queueLocalOps(canvasId: string, ops: readonly DrawingAction[]): void {
    if (ops.length === 0) return
    const entry = this.entry(canvasId)
    entry.queued.push(...ops)
    this.setState(entry, applyOps(entry.state, ops))
    this.scheduleFlush(this.options.flushIntervalMs ?? 50)
  }

  /** Sends queued ops now, unless the connection asks us to hold them. */
  flush(): void {
    this.clearFlushTimer()
    const canSend = this.options.canSend?.() ?? true
    for (const [canvasId, entry] of this.entries) {
      if (entry.queued.length === 0) continue
      if (!canSend) continue
      const ops = entry.queued
      entry.queued = []
      for (const batch of planDrawingBatches(ops))
        this.sendBatch(canvasId, entry, batch)
    }
    if (!canSend && this.hasQueuedOps()) {
      this.scheduleFlush(this.options.retryIntervalMs ?? 100)
    }
  }

  dispose(): void {
    this.clearFlushTimer()
  }

  /* ------------------------------- internals ------------------------------ */

  private sendBatch(
    canvasId: string,
    entry: CanvasEntry,
    batch: readonly DrawingAction[],
  ): void {
    const batchId = this.nextBatchId
    this.nextBatchId += 1
    entry.inFlight.set(batchId, batch)
    const settle = () => {
      entry.inFlight.delete(batchId)
    }
    this.options.sendBatch(canvasId, batch).then(settle, (error: unknown) => {
      settle()
      // A refused batch is dropped, never resent: it would fail the same
      // way. That includes `STALE` (its canvas ended before it was written)
      // and the room's `STALE_CLIENT` (it ended while the batch was in
      // flight); that canvas is finished, so there is nothing to repair.
      // Too large: later batches may refer to strokes it began, so the
      // room's copy is the only safe truth.
      if (isRoomCommandError(error) && error.code === 'TOO_LARGE') {
        this.options.requestResync?.()
      }
    })
  }

  private hasQueuedOps(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.queued.length > 0) return true
    }
    return false
  }

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer !== null) return
    this.flushTimer = this.timers.setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, delayMs)
  }

  private clearFlushTimer(): void {
    if (this.flushTimer === null) return
    this.timers.clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private entry(canvasId: string): CanvasEntry {
    let entry = this.entries.get(canvasId)
    if (!entry) {
      entry = {
        state: EMPTY_STATE,
        queued: [],
        inFlight: new Map(),
        preview: null,
        listeners: new Set(),
      }
      this.entries.set(canvasId, entry)
    }
    return entry
  }

  private setState(entry: CanvasEntry, state: DrawingState): void {
    if (state === entry.state) return
    entry.state = state
    this.notify(entry)
  }

  private notify(entry: CanvasEntry): void {
    for (const listener of [...entry.listeners]) listener()
  }
}

function applyOps(
  state: DrawingState,
  ops: readonly DrawingAction[],
): DrawingState {
  let next = state
  for (const op of ops) next = drawingReducer(next, op)
  return next
}

function sameDocument(a: DrawingDocument, b: DrawingDocument): boolean {
  if (a === b) return true
  if (a.strokeOrder.length !== b.strokeOrder.length) return false
  return a.strokeOrder.every((strokeId, index) => {
    if (b.strokeOrder[index] !== strokeId) return false
    const left = a.strokesById[strokeId]
    const right = b.strokesById[strokeId]
    return (
      left !== undefined &&
      right !== undefined &&
      left.points.length === right.points.length &&
      left.style.color === right.style.color &&
      left.style.width === right.style.width
    )
  })
}

/**
 * Snapshots carry completed strokes only. Keep a stroke the drawer is still
 * dragging so its remaining appends and end still land locally.
 */
function carryInProgress(
  next: DrawingState,
  local: DrawingState,
): DrawingState {
  let result = next
  for (const strokeId of local.inProgressOrder) {
    const stroke = local.inProgressById[strokeId]
    const [first, ...rest] = stroke?.points ?? []
    if (!stroke || !first || result.knownStrokeIds[strokeId]) continue
    result = drawingReducer(result, {
      type: 'stroke.begin',
      strokeId,
      point: first,
      style: stroke.style,
    })
    if (rest.length > 0) {
      result = drawingReducer(result, {
        type: 'stroke.append',
        strokeId,
        startPointIndex: 1,
        points: rest,
      })
    }
  }
  return result
}
