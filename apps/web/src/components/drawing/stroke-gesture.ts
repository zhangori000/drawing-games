import type {
  DrawingAction,
  NormalizedPoint,
  Stroke,
  StrokeStyle,
} from '@drawing-games/drawing-model'

import { randomId } from '@/lib/random-id'

/** Movement (in CSS px) below which a press stays a single-point dot. */
export const TAP_MOVEMENT_THRESHOLD_PX = 3

export interface PaperSize {
  readonly width: number
  readonly height: number
}

interface ActiveStroke {
  readonly pointerId: number
  readonly strokeId: string
  readonly style: StrokeStyle
  readonly startPoint: NormalizedPoint
  /** Samples held back until the press moves far enough to be a drag. */
  pending: NormalizedPoint[]
  points: NormalizedPoint[]
  dragStarted: boolean
}

/** Stroke ids are random and protocol-safe (`[A-Za-z0-9_-]`). */
export function createStrokeId(): string {
  return `s${randomId(14)}`
}

/**
 * Turns one pointer's samples into drawing-model actions. A tap commits one
 * round single-point stroke; once the pointer moves beyond the threshold the
 * held samples are appended, so a drag never leaves an extra dot under the
 * line. Only one pointer draws at a time; others are ignored.
 */
export class StrokeGesture {
  private active: ActiveStroke | null = null

  get activePointerId(): number | null {
    return this.active?.pointerId ?? null
  }

  /** The stroke as drawn so far, for immediate local rendering. */
  get liveStroke(): Stroke | null {
    const active = this.active
    return active
      ? { id: active.strokeId, style: active.style, points: active.points }
      : null
  }

  begin(
    pointerId: number,
    point: NormalizedPoint,
    style: StrokeStyle,
    strokeId: string = createStrokeId(),
  ): DrawingAction[] {
    if (this.active) return []
    this.active = {
      pointerId,
      strokeId,
      style,
      startPoint: point,
      pending: [],
      points: [point],
      dragStarted: false,
    }
    return [{ type: 'stroke.begin', strokeId, point, style }]
  }

  move(
    pointerId: number,
    samples: readonly NormalizedPoint[],
    paper: PaperSize,
  ): DrawingAction[] {
    const active = this.active
    if (!active || active.pointerId !== pointerId) return []

    const previous = active.dragStarted
      ? (active.points.at(-1) ?? active.startPoint)
      : (active.pending.at(-1) ?? active.startPoint)
    const fresh = distinctPoints(previous, samples)
    if (fresh.length === 0) return []

    if (!active.dragStarted) {
      active.pending.push(...fresh)
      const movedBeyondTap = active.pending.some(
        (point) =>
          distanceInPixels(active.startPoint, point, paper) >
          TAP_MOVEMENT_THRESHOLD_PX,
      )
      if (!movedBeyondTap) return []
      active.dragStarted = true
    }

    const points = active.pending.length > 0 ? active.pending.splice(0) : fresh
    const startPointIndex = active.points.length
    active.points = [...active.points, ...points]
    return [
      {
        type: 'stroke.append',
        strokeId: active.strokeId,
        startPointIndex,
        points,
      },
    ]
  }

  end(
    pointerId: number,
    samples: readonly NormalizedPoint[],
    paper: PaperSize,
  ): DrawingAction[] {
    const active = this.active
    if (!active || active.pointerId !== pointerId) return []
    const ops = this.move(pointerId, samples, paper)
    this.active = null
    return [
      ...ops,
      {
        type: 'stroke.end',
        strokeId: active.strokeId,
        pointCount: active.points.length,
      },
    ]
  }

  /** The OS took the pointer (palm rejection, scroll): drop the stroke. */
  cancel(pointerId?: number): DrawingAction[] {
    const active = this.active
    if (
      !active ||
      (pointerId !== undefined && active.pointerId !== pointerId)
    ) {
      return []
    }
    this.active = null
    return [{ type: 'stroke.delete', strokeId: active.strokeId }]
  }
}

function distinctPoints(
  previous: NormalizedPoint,
  points: readonly NormalizedPoint[],
): NormalizedPoint[] {
  const distinct: NormalizedPoint[] = []
  let last = previous
  for (const point of points) {
    if (point.x === last.x && point.y === last.y) continue
    distinct.push(point)
    last = point
  }
  return distinct
}

function distanceInPixels(
  start: NormalizedPoint,
  end: NormalizedPoint,
  paper: PaperSize,
): number {
  return Math.hypot(
    (end.x - start.x) * paper.width,
    (end.y - start.y) * paper.height,
  )
}

/** Normalizes a pointer sample to the paper (0..1 on both axes). */
export function normalizePointer(
  sample: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure: number
  },
  rect: {
    readonly left: number
    readonly top: number
    readonly width: number
    readonly height: number
  },
): NormalizedPoint {
  const x = clampUnit((sample.clientX - rect.left) / Math.max(1, rect.width))
  const y = clampUnit((sample.clientY - rect.top) / Math.max(1, rect.height))
  const pressure = sample.pressure > 0 ? clampUnit(sample.pressure) : undefined
  return pressure === undefined ? { x, y } : { x, y, pressure }
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
