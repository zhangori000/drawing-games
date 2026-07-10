import {
  type DrawingDocument,
  type DrawingState,
  type NormalizedPoint,
  type Stroke,
  isNormalizedPoint,
} from './model'

/**
 * Finds the visually topmost completed stroke intersecting a normalized point.
 * `radius` is normalized like stroke width; the stroke's own half-width is added.
 */
export function findTopStrokeAtPoint(
  source: DrawingState | DrawingDocument,
  point: NormalizedPoint,
  radius = 0,
): Stroke | undefined {
  if (!isNormalizedPoint(point) || !Number.isFinite(radius) || radius < 0) {
    return undefined
  }

  const document = 'document' in source ? source.document : source

  for (let index = document.strokeOrder.length - 1; index >= 0; index -= 1) {
    const strokeId = document.strokeOrder[index]
    if (!strokeId) continue

    const stroke = document.strokesById[strokeId]
    if (stroke && strokeIntersectsPoint(stroke, point, radius)) return stroke
  }

  return undefined
}

function strokeIntersectsPoint(
  stroke: Stroke,
  point: NormalizedPoint,
  radius: number,
): boolean {
  const threshold = radius + stroke.style.width / 2
  const thresholdSquared = threshold * threshold

  if (stroke.points.length === 1) {
    const onlyPoint = stroke.points[0]
    return onlyPoint
      ? squaredDistance(point, onlyPoint) <= thresholdSquared
      : false
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1]
    const end = stroke.points[index]
    if (
      start &&
      end &&
      squaredDistanceToSegment(point, start, end) <= thresholdSquared
    ) {
      return true
    }
  }

  return false
}

function squaredDistance(a: NormalizedPoint, b: NormalizedPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function squaredDistanceToSegment(
  point: NormalizedPoint,
  start: NormalizedPoint,
  end: NormalizedPoint,
): number {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY

  if (segmentLengthSquared === 0) return squaredDistance(point, start)

  const projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared
  const clampedProjection = Math.max(0, Math.min(1, projection))
  const closestPoint = {
    x: start.x + clampedProjection * segmentX,
    y: start.y + clampedProjection * segmentY,
  }

  return squaredDistance(point, closestPoint)
}
