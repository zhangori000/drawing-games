/** A stable identifier generated once per stroke. Stroke IDs must never be reused. */
export type StrokeId = string

/** Canvas coordinates and pressure are independent of the rendered pixel size. */
export interface NormalizedPoint {
  readonly x: number
  readonly y: number
  readonly pressure?: number
}

/** Width is a normalized canvas fraction; color is canonical six-digit hex. */
export interface StrokeStyle {
  readonly color: string
  readonly width: number
  readonly opacity: number
}

export interface Stroke {
  readonly id: StrokeId
  readonly style: StrokeStyle
  readonly points: readonly NormalizedPoint[]
}

export type StrokeRecord = Readonly<Record<StrokeId, Stroke>>

/** Serializable, history-free canvas state suitable for room snapshots. */
export interface DrawingDocument {
  readonly strokesById: StrokeRecord
  readonly strokeOrder: readonly StrokeId[]
}

export interface DrawingHistory {
  readonly past: readonly DrawingDocument[]
  readonly future: readonly DrawingDocument[]
  readonly limit: number
}

/**
 * Editing state. Completed strokes live in `document`; pointer-down strokes are
 * isolated in `inProgress*` so a whole stroke is one undo step.
 */
export interface DrawingState {
  readonly document: DrawingDocument
  readonly inProgressById: StrokeRecord
  readonly inProgressOrder: readonly StrokeId[]
  readonly knownStrokeIds: Readonly<Record<StrokeId, true>>
  readonly history: DrawingHistory
}

export interface BeginStrokeAction {
  readonly type: 'stroke.begin'
  readonly strokeId: StrokeId
  readonly point: NormalizedPoint
  readonly style: StrokeStyle
}

/**
 * `startPointIndex` makes an append idempotent. It must equal the current point
 * count, so duplicate or out-of-order chunks are ignored instead of corrupting
 * a stroke.
 */
export interface AppendStrokeAction {
  readonly type: 'stroke.append'
  readonly strokeId: StrokeId
  readonly startPointIndex: number
  readonly points: readonly NormalizedPoint[]
}

/** `pointCount` prevents an early/out-of-order end from committing a partial stroke. */
export interface EndStrokeAction {
  readonly type: 'stroke.end'
  readonly strokeId: StrokeId
  readonly pointCount: number
}

export interface DeleteStrokeAction {
  readonly type: 'stroke.delete'
  readonly strokeId: StrokeId
}

export interface ClearDrawingAction {
  readonly type: 'drawing.clear'
}

export interface UndoDrawingAction {
  readonly type: 'drawing.undo'
}

export interface RedoDrawingAction {
  readonly type: 'drawing.redo'
}

export type DrawingAction =
  | BeginStrokeAction
  | AppendStrokeAction
  | EndStrokeAction
  | DeleteStrokeAction
  | ClearDrawingAction
  | UndoDrawingAction
  | RedoDrawingAction

export const DEFAULT_HISTORY_LIMIT = 100
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
export const MIN_STROKE_WIDTH = 0.0001
export const MAX_STROKE_WIDTH = 1

const STROKE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export function isStrokeId(value: unknown): value is StrokeId {
  return typeof value === 'string' && STROKE_ID_PATTERN.test(value)
}

export function isNormalizedPoint(value: unknown): value is NormalizedPoint {
  if (typeof value !== 'object' || value === null) return false

  const point = value as Partial<NormalizedPoint>
  return (
    isUnitNumber(point.x) &&
    isUnitNumber(point.y) &&
    (point.pressure === undefined || isUnitNumber(point.pressure))
  )
}

export function isStrokeStyle(value: unknown): value is StrokeStyle {
  if (typeof value !== 'object' || value === null) return false

  const style = value as Partial<StrokeStyle>
  return (
    typeof style.color === 'string' &&
    HEX_COLOR_PATTERN.test(style.color) &&
    typeof style.width === 'number' &&
    Number.isFinite(style.width) &&
    style.width >= MIN_STROKE_WIDTH &&
    style.width <= MAX_STROKE_WIDTH &&
    isUnitNumber(style.opacity)
  )
}

function isUnitNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}
