import type {
  AppendStrokeAction,
  DrawingAction,
} from '@drawing-games/drawing-model'
import {
  MAX_DRAWING_OPERATIONS_PER_BATCH,
  MAX_POINTS_PER_APPEND,
} from '@drawing-games/protocol'

/**
 * Turns a queue of local drawing actions into wire-sized `drawing.batch`
 * operation lists without changing their meaning: contiguous appends to the
 * same stroke merge, appends split at the per-append point cap, and the
 * result is packed into batches of at most 32 operations, in order.
 */
export function planDrawingBatches(
  ops: readonly DrawingAction[],
): DrawingAction[][] {
  return packBatches(splitAppends(coalesceAppends(ops)))
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
      const chunk: AppendStrokeAction = {
        type: 'stroke.append',
        strokeId: op.strokeId,
        startPointIndex: op.startPointIndex + offset,
        points: op.points.slice(offset, offset + maxPoints),
      }
      result.push(chunk)
    }
  }
  return result
}

export function packBatches(
  ops: readonly DrawingAction[],
  maxOps: number = MAX_DRAWING_OPERATIONS_PER_BATCH,
): DrawingAction[][] {
  const batches: DrawingAction[][] = []
  for (let index = 0; index < ops.length; index += maxOps) {
    batches.push(ops.slice(index, index + maxOps))
  }
  return batches
}
