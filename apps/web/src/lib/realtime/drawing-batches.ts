import type {
  AppendStrokeAction,
  DrawingAction,
} from '@drawing-games/drawing-model'
import {
  MAX_DRAWING_OPERATIONS_PER_BATCH,
  MAX_POINTS_PER_APPEND,
} from '@drawing-games/protocol'

import { MAX_CLIENT_MESSAGE_BYTES, utf8ByteLength } from './message-size'

/**
 * Byte budget for one batch's `operations` JSON array. The rest of the
 * 64 KiB message cap is headroom for the envelope (ids, sequence numbers,
 * room code), which is well under 1 KiB.
 */
export const MAX_DRAWING_BATCH_BYTES = 48 * 1024

/** Envelope room left under the server's message cap by the batch budget. */
export const DRAWING_ENVELOPE_HEADROOM_BYTES =
  MAX_CLIENT_MESSAGE_BYTES - MAX_DRAWING_BATCH_BYTES

export interface BatchLimits {
  /** Operations per batch (protocol cap: 32). */
  readonly maxOps?: number
  /** UTF-8 bytes of the batch's JSON operations array. */
  readonly maxBytes?: number
}

/**
 * Turns a queue of local drawing actions into wire-sized `drawing.batch`
 * operation lists without changing their meaning: contiguous appends to the
 * same stroke merge, appends split at the per-append point cap, and the
 * result is packed in order into batches of at most 32 operations and at
 * most ~48 KiB of JSON (appends too large on their own are split further).
 */
export function planDrawingBatches(
  ops: readonly DrawingAction[],
  limits: BatchLimits = {},
): DrawingAction[][] {
  return packBatches(splitAppends(coalesceAppends(ops)), limits)
}

/** Merges adjacent appends that continue the same stroke. */
export function coalesceAppends(
  ops: readonly DrawingAction[],
): DrawingAction[] {
  const merged: DrawingAction[] = []
  for (const op of ops) {
    const previous = merged.at(-1)
    if (
      op.type === 'stroke.append' &&
      previous?.type === 'stroke.append' &&
      previous.strokeId === op.strokeId &&
      previous.startPointIndex + previous.points.length === op.startPointIndex
    ) {
      merged[merged.length - 1] = {
        ...previous,
        points: [...previous.points, ...op.points],
      }
      continue
    }
    merged.push(op)
  }
  return merged
}

/** Splits appends longer than the protocol cap, keeping indexes contiguous. */
export function splitAppends(
  ops: readonly DrawingAction[],
  maxPoints: number = MAX_POINTS_PER_APPEND,
): DrawingAction[] {
  const result: DrawingAction[] = []
  for (const op of ops) {
    if (op.type !== 'stroke.append' || op.points.length <= maxPoints) {
      result.push(op)
      continue
    }
    for (let offset = 0; offset < op.points.length; offset += maxPoints) {
      result.push(appendSlice(op, offset, offset + maxPoints))
    }
  }
  return result
}

/**
 * Packs ops into consecutive batches under both the operation count and the
 * encoded byte budget. An append that alone exceeds the byte budget is split
 * into smaller contiguous appends; any other single op that does not fit
 * travels alone (the connection refuses to send it rather than having the
 * server drop the socket).
 */
export function packBatches(
  ops: readonly DrawingAction[],
  limits: BatchLimits = {},
): DrawingAction[][] {
  const maxOps = Math.max(1, limits.maxOps ?? MAX_DRAWING_OPERATIONS_PER_BATCH)
  const maxBytes = limits.maxBytes ?? MAX_DRAWING_BATCH_BYTES
  const batches: DrawingAction[][] = []
  let current: DrawingAction[] = []
  // `[` + `]`, plus one comma between neighbours.
  let currentBytes = 2

  for (const op of ops) {
    for (const piece of fitOpToBudget(op, maxBytes)) {
      const size = encodedOpBytes(piece)
      const full =
        current.length >= maxOps ||
        (current.length > 0 && currentBytes + 1 + size > maxBytes)
      if (full) {
        batches.push(current)
        current = []
        currentBytes = 2
      }
      currentBytes += size + (current.length > 0 ? 1 : 0)
      current.push(piece)
    }
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** UTF-8 size of one op as it appears inside `operations`. */
export function encodedOpBytes(op: DrawingAction): number {
  return utf8ByteLength(JSON.stringify(op))
}

/** UTF-8 size of an `operations` array. */
export function encodedBatchBytes(ops: readonly DrawingAction[]): number {
  return utf8ByteLength(JSON.stringify(ops))
}

function fitOpToBudget(op: DrawingAction, maxBytes: number): DrawingAction[] {
  // `[op]` must fit on its own.
  if (encodedOpBytes(op) + 2 <= maxBytes) return [op]
  if (op.type !== 'stroke.append' || op.points.length < 2) return [op]
  const middle = Math.ceil(op.points.length / 2)
  return [
    ...fitOpToBudget(appendSlice(op, 0, middle), maxBytes),
    ...fitOpToBudget(appendSlice(op, middle, op.points.length), maxBytes),
  ]
}

function appendSlice(
  op: AppendStrokeAction,
  start: number,
  end: number,
): AppendStrokeAction {
  return {
    type: 'stroke.append',
    strokeId: op.strokeId,
    startPointIndex: op.startPointIndex + start,
    points: op.points.slice(start, end),
  }
}
