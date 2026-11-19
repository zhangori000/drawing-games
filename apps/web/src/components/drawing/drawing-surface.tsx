'use client'

import {
  findTopStrokeAtPoint,
  type DrawingAction,
  type DrawingState,
  type NormalizedPoint,
} from '@drawing-games/drawing-model'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { cx } from '../ui/cx'
import { DrawingPainter, MAX_DEVICE_PIXEL_RATIO, fitPaper } from './painter'
import { ERASER_RADIUS, type DrawingTool } from './palette'
import { StrokeGesture, normalizePointer } from './stroke-gesture'

export interface DrawingSurfaceInteraction {
  readonly tool: DrawingTool
  readonly color: string
  readonly width: number
  /** Receives drawing-model actions (send them via `actions.sendDrawing`). */
  readonly onOps: (ops: DrawingAction[]) => void
}

export interface DrawingSurfaceProps {
  readonly drawing: DrawingState
  /** Present only for the active drawer. */
  readonly interactive?: DrawingSurfaceInteraction | null
  readonly ariaLabel: string
  readonly className?: string
  /** Overlay content positioned over the paper (labels, chips). */
  readonly children?: ReactNode
}

interface EraseGesture {
  readonly pointerId: number
  readonly erased: Set<string>
}

/**
 * The 4:3 paper, letterboxed and centered in its parent. Renders on the next
 * animation frame after the drawing changes. When interactive it turns
 * pointer input (mouse, pen, touch) into drawing ops; it never lets the page
 * pan or zoom from a touch that starts on the paper.
 */
export function DrawingSurface({
  drawing,
  interactive,
  ariaLabel,
  className,
  children,
}: DrawingSurfaceProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painterRef = useRef<DrawingPainter | null>(null)
  const gestureRef = useRef(new StrokeGesture())
  const eraseRef = useRef<EraseGesture | null>(null)
  const drawingRef = useRef(drawing)
  const frameRequest = useRef(0)
  const [paper, setPaper] = useState({ width: 0, height: 0 })

  const scheduleRender = useCallback(() => {
    if (frameRequest.current !== 0) return
    frameRequest.current = window.requestAnimationFrame(() => {
      frameRequest.current = 0
      const canvas = canvasRef.current
      if (!canvas) return
      painterRef.current ??= new DrawingPainter()
      painterRef.current.paint(
        canvas,
        drawingRef.current,
        gestureRef.current.liveStroke,
      )
    })
  }, [])

  // Letterbox the paper inside whatever space the parent gives us.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const next = fitPaper(entry.contentRect.width, entry.contentRect.height)
      setPaper((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      )
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Size the backing store (capped DPR) and repaint.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || paper.width === 0) return
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
    canvas.width = Math.max(1, Math.round(paper.width * ratio))
    canvas.height = Math.max(1, Math.round(paper.height * ratio))
    scheduleRender()
  }, [paper, scheduleRender])

  useEffect(() => {
    drawingRef.current = drawing
    scheduleRender()
  }, [drawing, scheduleRender])

  useEffect(
    () => () => {
      if (frameRequest.current !== 0) {
        window.cancelAnimationFrame(frameRequest.current)
        // Reset so a remount (React strict mode re-runs effects) can paint.
        frameRequest.current = 0
      }
    },
    [],
  )

  // Safari pinch/rotate gestures must never zoom while touching the paper.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cancel = (event: Event) => event.preventDefault()
    const names = ['gesturestart', 'gesturechange', 'gestureend']
    for (const name of names) {
      canvas.addEventListener(name, cancel, { passive: false })
    }
    return () => {
      for (const name of names) canvas.removeEventListener(name, cancel)
    }
  }, [])

  // Losing drawer rights mid-stroke: forget the gesture without emitting.
  useEffect(() => {
    if (interactive) return
    gestureRef.current.cancel()
    eraseRef.current = null
    scheduleRender()
  }, [interactive, scheduleRender])

  const emit = (ops: DrawingAction[]) => {
    if (ops.length > 0) interactive?.onOps(ops)
    scheduleRender()
  }

  const eraseAt = (points: readonly NormalizedPoint[]) => {
    const erase = eraseRef.current
    if (!erase) return
    const ops: DrawingAction[] = []
    for (const point of points) {
      const hit = findTopStrokeAtPoint(drawingRef.current, point, ERASER_RADIUS)
      if (hit && !erase.erased.has(hit.id)) {
        erase.erased.add(hit.id)
        ops.push({ type: 'stroke.delete', strokeId: hit.id })
      }
    }
    emit(ops)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // One finger draws; any extra touch is ignored (never zooms or adds ink).
    if (gestureRef.current.activePointerId !== null || eraseRef.current) return
    event.preventDefault()

    const canvas = event.currentTarget
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic or already-released pointers cannot be captured.
    }
    const point = normalizePointer(event, canvas.getBoundingClientRect())

    if (interactive.tool === 'eraser') {
      eraseRef.current = { pointerId: event.pointerId, erased: new Set() }
      eraseAt([point])
      return
    }
    emit(
      gestureRef.current.begin(event.pointerId, point, {
        color: interactive.color,
        width: interactive.width,
        opacity: 1,
      }),
    )
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const erase = eraseRef.current
    if (erase?.pointerId === event.pointerId) {
      eraseAt(samplesOf(event))
      return
    }
    if (gestureRef.current.activePointerId !== event.pointerId) return
    emit(
      gestureRef.current.move(
        event.pointerId,
        samplesOf(event),
        paperOf(event),
      ),
    )
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (eraseRef.current?.pointerId === event.pointerId) {
      eraseRef.current = null
      return
    }
    if (gestureRef.current.activePointerId !== event.pointerId) return
    emit(
      gestureRef.current.end(event.pointerId, samplesOf(event), paperOf(event)),
    )
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (eraseRef.current?.pointerId === event.pointerId) {
      eraseRef.current = null
      return
    }
    emit(gestureRef.current.cancel(event.pointerId))
  }

  const tool = interactive?.tool
  return (
    <div
      ref={frameRef}
      className={cx(
        'relative flex size-full min-h-0 min-w-0 items-center justify-center',
        className,
      )}
    >
      <div
        className="relative overflow-hidden rounded-xl bg-white shadow-[0_0_0_2px_rgba(24,23,19,0.12),0_6px_18px_rgba(24,23,19,0.08)]"
        style={{
          width: paper.width,
          height: paper.height,
          visibility: paper.width === 0 ? 'hidden' : 'visible',
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          data-interactive={interactive ? 'true' : undefined}
          className={cx(
            'block size-full select-none',
            tool === 'eraser'
              ? 'cursor-cell'
              : tool === 'pen'
                ? 'cursor-crosshair'
                : 'cursor-default',
          )}
          style={{
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          onPointerCancel={handlePointerCancel}
        />
        {children}
      </div>
    </div>
  )
}

function samplesOf(
  event: ReactPointerEvent<HTMLCanvasElement>,
): NormalizedPoint[] {
  const rect = event.currentTarget.getBoundingClientRect()
  const native = event.nativeEvent
  const coalesced =
    typeof native.getCoalescedEvents === 'function'
      ? native.getCoalescedEvents()
      : []
  const samples = coalesced.length > 0 ? coalesced : [native]
  return samples.map((sample) => normalizePointer(sample, rect))
}

function paperOf(event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}
