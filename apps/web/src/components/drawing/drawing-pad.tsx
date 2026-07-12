'use client'

import {
  createDrawingState,
  drawingReducer,
  findTopStrokeAtPoint,
  type DrawingAction,
  type DrawingDocument,
  type DrawingState,
  type NormalizedPoint,
  type Stroke,
  type StrokeStyle,
} from '@drawing-games/drawing-model'
import {
  MAX_DRAWING_OPERATIONS_PER_BATCH,
  MAX_POINTS_PER_APPEND,
} from '@drawing-games/protocol'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'

const TAP_MOVEMENT_THRESHOLD_PX = 3
const OBJECT_ERASER_RADIUS = 0.03
const MAX_APPEND_OPERATIONS_PER_GESTURE = MAX_DRAWING_OPERATIONS_PER_BATCH - 2
const MAX_POINTS_PER_GESTURE =
  1 + MAX_APPEND_OPERATIONS_PER_GESTURE * MAX_POINTS_PER_APPEND
const CANVAS_STYLE = { touchAction: 'none' } as const

export type DrawingTool = 'pen' | 'object-eraser'

export interface DrawingPadStatus {
  readonly canRedo: boolean
  readonly canUndo: boolean
  readonly hasDrawing: boolean
}

export interface DrawingPadHandle {
  clear(): void
  getDocument(): DrawingDocument
  redo(): void
  undo(): void
}

export interface DrawingPadProps {
  /**
   * An optional server-authoritative snapshot. Local edits remain optimistic;
   * a genuinely different snapshot replaces local history and wins.
   */
  readonly document?: DrawingDocument
  readonly editable?: boolean
  readonly tool: DrawingTool
  readonly strokeStyle: StrokeStyle
  readonly className?: string
  readonly ariaLabel?: string
  /**
   * Called after a semantic gesture, never for individual pointer samples.
   * Every callback is valid as one bounded `drawing.batch` command.
   */
  readonly onOperations?: (
    operations: readonly DrawingAction[],
  ) => boolean | void
  readonly onStatusChange?: (status: DrawingPadStatus) => void
}

interface ActivePointer {
  readonly pointerId: number
  readonly strokeId: string
  readonly startPoint: NormalizedPoint
  readonly style: StrokeStyle
  readonly points: NormalizedPoint[]
  readonly pendingPoints: NormalizedPoint[]
  dragStarted: boolean
  lastCollectedPoint: NormalizedPoint
  lastRenderedPoint: NormalizedPoint
  renderedPointCount: number
}

interface CallbackRefs {
  readonly onOperations: DrawingPadProps['onOperations']
  readonly onStatusChange: DrawingPadProps['onStatusChange']
}

export const DrawingPad = forwardRef<DrawingPadHandle, DrawingPadProps>(
  function DrawingPad(
    {
      document,
      editable = true,
      tool,
      strokeStyle,
      className,
      ariaLabel = 'Local drawing canvas. Use the toolbar to choose a pen or erase complete strokes.',
      onOperations,
      onStatusChange,
    },
    forwardedRef,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef<DrawingState>(createDrawingState({ document }))
    const activePointerRef = useRef<ActivePointer | null>(null)
    const authoritativeDocumentRef = useRef(document)
    const callbackRefs = useRef<CallbackRefs>({
      onOperations,
      onStatusChange,
    })

    const renderCurrentDrawing = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      renderDrawing(canvas, drawingRef.current, activePointerRef.current)
    }, [])

    const emitStatus = useCallback(() => {
      callbackRefs.current.onStatusChange?.(
        getDrawingPadStatus(drawingRef.current),
      )
    }, [])

    const applyOperations = useCallback(
      (operations: readonly DrawingAction[]) => {
        const previousState = drawingRef.current
        let nextState = previousState
        const appliedOperations: DrawingAction[] = []

        for (const operation of operations) {
          const reduced = drawingReducer(nextState, operation)
          if (reduced !== nextState) appliedOperations.push(operation)
          nextState = reduced
        }

        if (appliedOperations.length === 0) return

        drawingRef.current = nextState
        const accepted =
          callbackRefs.current.onOperations?.(appliedOperations) !== false
        if (!accepted) drawingRef.current = previousState

        renderCurrentDrawing()
        emitStatus()
      },
      [emitStatus, renderCurrentDrawing],
    )

    const cancelActiveGesture = useCallback(() => {
      const active = activePointerRef.current
      const canvas = canvasRef.current
      activePointerRef.current = null

      if (active && canvas?.hasPointerCapture(active.pointerId)) {
        canvas.releasePointerCapture(active.pointerId)
      }

      renderCurrentDrawing()
    }, [renderCurrentDrawing])

    useEffect(() => {
      callbackRefs.current = { onOperations, onStatusChange }
    }, [onOperations, onStatusChange])

    useImperativeHandle(
      forwardedRef,
      () => ({
        clear() {
          applyOperations([{ type: 'drawing.clear' }])
        },
        getDocument() {
          return drawingRef.current.document
        },
        redo() {
          applyOperations([{ type: 'drawing.redo' }])
        },
        undo() {
          applyOperations([{ type: 'drawing.undo' }])
        },
      }),
      [applyOperations],
    )

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const resizeAndRender = () => {
        sizeCanvas(canvas)
        renderCurrentDrawing()
      }
      const observer = new ResizeObserver(resizeAndRender)

      observer.observe(canvas)
      resizeAndRender()
      emitStatus()

      return () => observer.disconnect()
    }, [emitStatus, renderCurrentDrawing])

    useEffect(() => {
      if (document === authoritativeDocumentRef.current) return
      authoritativeDocumentRef.current = document
      if (document === undefined) return

      const currentState = drawingRef.current
      if (documentsEqual(currentState.document, document)) {
        drawingRef.current = { ...currentState, document }
        return
      }

      cancelActiveGesture()
      drawingRef.current = createDrawingState({ document })
      renderCurrentDrawing()
      emitStatus()
    }, [cancelActiveGesture, document, emitStatus, renderCurrentDrawing])

    useEffect(() => {
      if (!editable) cancelActiveGesture()
    }, [cancelActiveGesture, editable])

    function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
      if (!editable || event.button !== 0 || activePointerRef.current) {
        return
      }

      const point = eventPoint(event, event.currentTarget)

      if (tool === 'object-eraser') {
        const stroke = findTopStrokeAtPoint(
          drawingRef.current,
          point,
          OBJECT_ERASER_RADIUS,
        )
        if (stroke) {
          applyOperations([{ type: 'stroke.delete', strokeId: stroke.id }])
        }
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      const active: ActivePointer = {
        pointerId: event.pointerId,
        strokeId: crypto.randomUUID(),
        startPoint: point,
        style: copyStrokeStyle(strokeStyle),
        points: [point],
        pendingPoints: [],
        dragStarted: false,
        lastCollectedPoint: point,
        lastRenderedPoint: point,
        renderedPointCount: 1,
      }

      activePointerRef.current = active
      renderDot(event.currentTarget, point, active.style)
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
      const active = activePointerRef.current
      if (!active || active.pointerId !== event.pointerId) return

      appendPointerSamples(event, active)
    }

    function handlePointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
      const active = activePointerRef.current
      if (!active || active.pointerId !== event.pointerId) return

      appendPointerSamples(event, active)
      activePointerRef.current = null

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      const points = boundGesturePoints(
        active.dragStarted ? active.points : [active.startPoint],
      )
      const stroke: Stroke = {
        id: active.strokeId,
        style: active.style,
        points,
      }

      applyOperations(strokeOperations(stroke))
    }

    function appendPointerSamples(
      event: ReactPointerEvent<HTMLCanvasElement>,
      active: ActivePointer,
    ) {
      const canvas = event.currentTarget
      const samples = distinctPoints(
        active.lastCollectedPoint,
        coalescedPoints(event, canvas),
      )
      if (samples.length === 0) return

      active.lastCollectedPoint = samples.at(-1) ?? active.lastCollectedPoint

      if (!active.dragStarted) {
        active.pendingPoints.push(...samples)
        const movedBeyondTap = active.pendingPoints.some(
          (point) =>
            distanceInCanvasPixels(active.startPoint, point, canvas) >
            TAP_MOVEMENT_THRESHOLD_PX,
        )
        if (!movedBeyondTap) return

        active.dragStarted = true
        active.points.push(...active.pendingPoints.splice(0))
      } else {
        active.points.push(...samples)
      }

      const newPoints = active.points.slice(active.renderedPointCount)
      if (newPoints.length === 0) return

      renderSegments(canvas, active.lastRenderedPoint, newPoints, active.style)
      active.lastRenderedPoint = newPoints.at(-1) ?? active.lastRenderedPoint
      active.renderedPointCount = active.points.length
    }

    function handlePointerCancel(event: ReactPointerEvent<HTMLCanvasElement>) {
      const active = activePointerRef.current
      if (!active || active.pointerId !== event.pointerId) return

      cancelActiveGesture()
    }

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={CANVAS_STYLE}
        aria-label={ariaLabel}
        aria-disabled={!editable}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      />
    )
  },
)

function strokeOperations(stroke: Stroke): readonly DrawingAction[] {
  const operations: DrawingAction[] = [
    {
      type: 'stroke.begin',
      strokeId: stroke.id,
      point: stroke.points[0] as NormalizedPoint,
      style: stroke.style,
    },
  ]
  let startPointIndex = 1

  while (startPointIndex < stroke.points.length) {
    const points = stroke.points.slice(
      startPointIndex,
      startPointIndex + MAX_POINTS_PER_APPEND,
    )
    operations.push({
      type: 'stroke.append',
      strokeId: stroke.id,
      startPointIndex,
      points,
    })
    startPointIndex += points.length
  }

  operations.push({
    type: 'stroke.end',
    strokeId: stroke.id,
    pointCount: stroke.points.length,
  })

  return operations
}

function boundGesturePoints(
  points: readonly NormalizedPoint[],
): readonly NormalizedPoint[] {
  if (points.length <= MAX_POINTS_PER_GESTURE) return points

  const sampled: NormalizedPoint[] = []
  const lastIndex = points.length - 1
  for (let index = 0; index < MAX_POINTS_PER_GESTURE; index += 1) {
    const sourceIndex = Math.round(
      (index * lastIndex) / (MAX_POINTS_PER_GESTURE - 1),
    )
    const point = points[sourceIndex]
    if (point) sampled.push(point)
  }

  return sampled
}

function getDrawingPadStatus(state: DrawingState): DrawingPadStatus {
  return {
    canUndo:
      state.inProgressOrder.length === 0 && state.history.past.length > 0,
    canRedo:
      state.inProgressOrder.length === 0 && state.history.future.length > 0,
    hasDrawing:
      state.document.strokeOrder.length > 0 || state.inProgressOrder.length > 0,
  }
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * ratio))
  const height = Math.max(1, Math.round(rect.height * ratio))

  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

function renderDrawing(
  canvas: HTMLCanvasElement,
  state: DrawingState,
  active: ActivePointer | null,
) {
  const context = getDrawingContext(canvas)
  if (!context) return

  const width = canvas.width
  const height = canvas.height
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  for (const strokeId of state.document.strokeOrder) {
    const stroke = state.document.strokesById[strokeId]
    if (stroke) renderStroke(context, stroke, width, height)
  }

  for (const strokeId of state.inProgressOrder) {
    const stroke = state.inProgressById[strokeId]
    if (stroke) renderStroke(context, stroke, width, height)
  }

  if (active) {
    renderStroke(
      context,
      {
        id: active.strokeId,
        style: active.style,
        points: active.dragStarted ? active.points : [active.startPoint],
      },
      width,
      height,
    )
  }
}

function renderStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
) {
  const firstPoint = stroke.points[0]
  if (!firstPoint) return

  configureStrokeContext(context, stroke.style, width, height)

  if (stroke.points.length === 1) {
    drawDot(context, firstPoint, width, height)
    context.restore()
    return
  }

  context.beginPath()
  context.moveTo(firstPoint.x * width, firstPoint.y * height)
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index]
    if (!point) continue
    context.lineTo(point.x * width, point.y * height)
  }
  context.stroke()
  context.restore()
}

function renderDot(
  canvas: HTMLCanvasElement,
  point: NormalizedPoint,
  style: StrokeStyle,
) {
  const context = getDrawingContext(canvas)
  if (!context) return

  configureStrokeContext(context, style, canvas.width, canvas.height)
  drawDot(context, point, canvas.width, canvas.height)
  context.restore()
}

function renderSegments(
  canvas: HTMLCanvasElement,
  start: NormalizedPoint,
  points: readonly NormalizedPoint[],
  style: StrokeStyle,
) {
  const context = getDrawingContext(canvas)
  if (!context || points.length === 0) return

  configureStrokeContext(context, style, canvas.width, canvas.height)
  context.beginPath()
  context.moveTo(start.x * canvas.width, start.y * canvas.height)
  for (const point of points) {
    context.lineTo(point.x * canvas.width, point.y * canvas.height)
  }
  context.stroke()
  context.restore()
}

function getDrawingContext(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d', { alpha: false })
}

function configureStrokeContext(
  context: CanvasRenderingContext2D,
  style: StrokeStyle,
  width: number,
  height: number,
) {
  context.save()
  context.globalAlpha = style.opacity
  context.strokeStyle = style.color
  context.fillStyle = style.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1, style.width * Math.min(width, height))
}

function drawDot(
  context: CanvasRenderingContext2D,
  point: NormalizedPoint,
  width: number,
  height: number,
) {
  context.beginPath()
  context.arc(
    point.x * width,
    point.y * height,
    context.lineWidth / 2,
    0,
    Math.PI * 2,
  )
  context.fill()
}

function eventPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure'>,
  canvas: HTMLCanvasElement,
): NormalizedPoint {
  const rect = canvas.getBoundingClientRect()
  const x = clampUnit((event.clientX - rect.left) / Math.max(1, rect.width))
  const y = clampUnit((event.clientY - rect.top) / Math.max(1, rect.height))
  const pressure = event.pressure > 0 ? clampUnit(event.pressure) : undefined

  return pressure === undefined ? { x, y } : { x, y, pressure }
}

function coalescedPoints(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): NormalizedPoint[] {
  const nativeEvent = event.nativeEvent
  const coalesced = nativeEvent.getCoalescedEvents?.() ?? []
  const samples = coalesced.length > 0 ? coalesced : [nativeEvent]
  return samples.map((sample) => eventPoint(sample, canvas))
}

function distinctPoints(
  previousPoint: NormalizedPoint,
  points: readonly NormalizedPoint[],
) {
  const distinct: NormalizedPoint[] = []
  let previous = previousPoint

  for (const point of points) {
    if (point.x === previous.x && point.y === previous.y) continue
    distinct.push(point)
    previous = point
  }

  return distinct
}

function distanceInCanvasPixels(
  start: NormalizedPoint,
  end: NormalizedPoint,
  canvas: HTMLCanvasElement,
) {
  const rect = canvas.getBoundingClientRect()
  return Math.hypot(
    (end.x - start.x) * rect.width,
    (end.y - start.y) * rect.height,
  )
}

function copyStrokeStyle(style: StrokeStyle): StrokeStyle {
  return {
    color: style.color,
    width: style.width,
    opacity: style.opacity,
  }
}

function documentsEqual(left: DrawingDocument, right: DrawingDocument) {
  if (left === right) return true
  if (left.strokeOrder.length !== right.strokeOrder.length) return false

  for (let index = 0; index < left.strokeOrder.length; index += 1) {
    const leftId = left.strokeOrder[index]
    const rightId = right.strokeOrder[index]
    if (!leftId || leftId !== rightId) return false

    const leftStroke = left.strokesById[leftId]
    const rightStroke = right.strokesById[leftId]
    if (!leftStroke || !rightStroke || !strokesEqual(leftStroke, rightStroke)) {
      return false
    }
  }

  return true
}

function strokesEqual(left: Stroke, right: Stroke) {
  if (left === right) return true
  if (
    left.id !== right.id ||
    left.style.color !== right.style.color ||
    left.style.width !== right.style.width ||
    left.style.opacity !== right.style.opacity ||
    left.points.length !== right.points.length
  ) {
    return false
  }

  return left.points.every((point, index) => {
    const other = right.points[index]
    return (
      other !== undefined &&
      point.x === other.x &&
      point.y === other.y &&
      point.pressure === other.pressure
    )
  })
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value))
}
