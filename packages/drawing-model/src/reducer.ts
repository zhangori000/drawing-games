import {
  DEFAULT_HISTORY_LIMIT,
  type AppendStrokeAction,
  type BeginStrokeAction,
  type DeleteStrokeAction,
  type DrawingAction,
  type DrawingDocument,
  type DrawingState,
  type EndStrokeAction,
  type NormalizedPoint,
  type Stroke,
  type StrokeRecord,
  isNormalizedPoint,
  isStrokeId,
  isStrokeStyle,
} from './model'

export interface CreateDrawingStateOptions {
  readonly document?: DrawingDocument
  readonly historyLimit?: number
}

const EMPTY_DOCUMENT: DrawingDocument = {
  strokesById: {},
  strokeOrder: [],
}

export function createDrawingState(
  options: CreateDrawingStateOptions = {},
): DrawingState {
  const document = options.document ?? EMPTY_DOCUMENT
  const historyLimit = normalizeHistoryLimit(options.historyLimit)

  return {
    document,
    inProgressById: {},
    inProgressOrder: [],
    knownStrokeIds: Object.fromEntries(
      document.strokeOrder.map((strokeId) => [strokeId, true] as const),
    ),
    history: {
      past: [],
      future: [],
      limit: historyLimit,
    },
  }
}

/** Pure reducer: invalid, duplicate, and out-of-order actions return the same state. */
export function drawingReducer(
  state: DrawingState,
  action: DrawingAction,
): DrawingState {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return state
  }

  switch (action.type) {
    case 'stroke.begin':
      return beginStroke(state, action)
    case 'stroke.append':
      return appendStroke(state, action)
    case 'stroke.end':
      return endStroke(state, action)
    case 'stroke.delete':
      return deleteStroke(state, action)
    case 'drawing.clear':
      return clearDrawing(state)
    case 'drawing.undo':
      return undoDrawing(state)
    case 'drawing.redo':
      return redoDrawing(state)
    default:
      return state
  }
}

function beginStroke(
  state: DrawingState,
  action: BeginStrokeAction,
): DrawingState {
  if (
    !isStrokeId(action.strokeId) ||
    hasOwn(state.knownStrokeIds, action.strokeId) ||
    !isNormalizedPoint(action.point) ||
    !isStrokeStyle(action.style)
  ) {
    return state
  }

  const stroke: Stroke = {
    id: action.strokeId,
    style: copyStyle(action.style),
    points: [copyPoint(action.point)],
  }

  return {
    ...state,
    inProgressById: {
      ...state.inProgressById,
      [stroke.id]: stroke,
    },
    inProgressOrder: [...state.inProgressOrder, stroke.id],
    knownStrokeIds: {
      ...state.knownStrokeIds,
      [stroke.id]: true,
    },
  }
}

function appendStroke(
  state: DrawingState,
  action: AppendStrokeAction,
): DrawingState {
  if (
    !isStrokeId(action.strokeId) ||
    !Number.isSafeInteger(action.startPointIndex) ||
    !Array.isArray(action.points) ||
    action.points.length === 0 ||
    !action.points.every(isNormalizedPoint) ||
    !hasOwn(state.inProgressById, action.strokeId)
  ) {
    return state
  }

  const stroke = state.inProgressById[action.strokeId]
  if (!stroke || action.startPointIndex !== stroke.points.length) return state

  const nextStroke: Stroke = {
    ...stroke,
    points: [...stroke.points, ...action.points.map(copyPoint)],
  }

  return {
    ...state,
    inProgressById: {
      ...state.inProgressById,
      [stroke.id]: nextStroke,
    },
  }
}

function endStroke(state: DrawingState, action: EndStrokeAction): DrawingState {
  if (
    !isStrokeId(action.strokeId) ||
    !Number.isSafeInteger(action.pointCount) ||
    action.pointCount < 1 ||
    !hasOwn(state.inProgressById, action.strokeId)
  ) {
    return state
  }

  const stroke = state.inProgressById[action.strokeId]
  if (!stroke || action.pointCount !== stroke.points.length) return state

  const nextDocument: DrawingDocument = {
    strokesById: {
      ...state.document.strokesById,
      [stroke.id]: stroke,
    },
    strokeOrder: [...state.document.strokeOrder, stroke.id],
  }

  return commitDocument(
    {
      ...state,
      inProgressById: omitKey(state.inProgressById, stroke.id),
      inProgressOrder: state.inProgressOrder.filter((id) => id !== stroke.id),
    },
    nextDocument,
  )
}

function deleteStroke(
  state: DrawingState,
  action: DeleteStrokeAction,
): DrawingState {
  if (!isStrokeId(action.strokeId)) return state

  if (hasOwn(state.inProgressById, action.strokeId)) {
    return {
      ...state,
      inProgressById: omitKey(state.inProgressById, action.strokeId),
      inProgressOrder: state.inProgressOrder.filter(
        (strokeId) => strokeId !== action.strokeId,
      ),
    }
  }

  if (!hasOwn(state.document.strokesById, action.strokeId)) return state

  return commitDocument(state, {
    strokesById: omitKey(state.document.strokesById, action.strokeId),
    strokeOrder: state.document.strokeOrder.filter(
      (strokeId) => strokeId !== action.strokeId,
    ),
  })
}

function clearDrawing(state: DrawingState): DrawingState {
  const hasCompletedStrokes = state.document.strokeOrder.length > 0
  const hasInProgressStrokes = state.inProgressOrder.length > 0
  if (!hasCompletedStrokes && !hasInProgressStrokes) return state

  const withoutInProgress: DrawingState = {
    ...state,
    inProgressById: {},
    inProgressOrder: [],
  }

  return hasCompletedStrokes
    ? commitDocument(withoutInProgress, EMPTY_DOCUMENT)
    : withoutInProgress
}

function undoDrawing(state: DrawingState): DrawingState {
  if (state.inProgressOrder.length > 0 || state.history.past.length === 0) {
    return state
  }

  const document = state.history.past.at(-1)
  if (!document) return state

  return {
    ...state,
    document,
    history: {
      ...state.history,
      past: state.history.past.slice(0, -1),
      future: [state.document, ...state.history.future],
    },
  }
}

function redoDrawing(state: DrawingState): DrawingState {
  if (state.inProgressOrder.length > 0 || state.history.future.length === 0) {
    return state
  }

  const [document, ...future] = state.history.future
  if (!document) return state

  return {
    ...state,
    document,
    history: {
      ...state.history,
      past: appendPast(state.history.past, state.document, state.history.limit),
      future,
    },
  }
}

function commitDocument(
  state: DrawingState,
  document: DrawingDocument,
): DrawingState {
  return {
    ...state,
    document,
    history: {
      ...state.history,
      past: appendPast(state.history.past, state.document, state.history.limit),
      future: [],
    },
  }
}

function appendPast(
  past: readonly DrawingDocument[],
  document: DrawingDocument,
  limit: number,
): readonly DrawingDocument[] {
  if (limit === 0) return []
  return [...past, document].slice(-limit)
}

function normalizeHistoryLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HISTORY_LIMIT
  if (!Number.isSafeInteger(value) || value < 0) return DEFAULT_HISTORY_LIMIT
  return value
}

function hasOwn<T extends object>(object: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function omitKey<T>(record: Readonly<Record<string, T>>, key: string) {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key),
  ) as Readonly<Record<string, T>>
}

function copyPoint(point: NormalizedPoint): NormalizedPoint {
  return point.pressure === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, pressure: point.pressure }
}

function copyStyle(style: Stroke['style']): Stroke['style'] {
  return {
    color: style.color,
    width: style.width,
    opacity: style.opacity,
  }
}
