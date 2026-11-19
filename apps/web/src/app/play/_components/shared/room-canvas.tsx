'use client'

import type { DrawingAction } from '@drawing-games/drawing-model'
import type { ReactNode } from 'react'

import { CanvasPreview } from '@/components/drawing/canvas-preview'
import { DrawingSurface } from '@/components/drawing/drawing-surface'
import { cx } from '@/components/ui/cx'
import { useCanvasDrawing, useCanvasPreview } from '@/lib/realtime/use-canvas'

import { useRoomSession } from '../room-session'

export interface ReadOnlyCanvasProps {
  readonly canvasId: string
  readonly label: string
  readonly className?: string
  readonly children?: ReactNode
  readonly testId?: string
}

/** A canvas this viewer has full access to, drawn from the canvas store. */
export function ReadOnlyCanvas({
  canvasId,
  label,
  className,
  children,
  testId,
}: ReadOnlyCanvasProps) {
  const { canvasStore } = useRoomSession()
  const drawing = useCanvasDrawing(canvasStore, canvasId)
  return (
    <div data-testid={testId} className={cx('min-h-0 min-w-0', className)}>
      <DrawingSurface drawing={drawing} ariaLabel={label}>
        {children}
      </DrawingSurface>
    </div>
  )
}

/** A small fixed-ratio thumbnail of a finished drawing. */
export function CanvasThumb({
  canvasId,
  label,
  className,
}: {
  readonly canvasId: string
  readonly label: string
  readonly className?: string
}) {
  return (
    <ReadOnlyCanvas
      canvasId={canvasId}
      label={label}
      className={cx('aspect-[4/3] w-full', className)}
    />
  )
}

export interface DrawerCanvasProps {
  readonly canvasId: string
  readonly label: string
  readonly tool: 'pen' | 'eraser'
  readonly color: string
  readonly width: number
  readonly className?: string
  readonly children?: ReactNode
  readonly testId?: string
}

/** The active drawer's interactive paper; ops stream to the room. */
export function DrawerCanvas({
  canvasId,
  label,
  tool,
  color,
  width,
  className,
  children,
  testId,
}: DrawerCanvasProps) {
  const { canvasStore, actions } = useRoomSession()
  const drawing = useCanvasDrawing(canvasStore, canvasId)
  const onOps = (ops: DrawingAction[]) => actions.sendDrawing(canvasId, ops)
  return (
    <div data-testid={testId} className={cx('min-h-0 min-w-0', className)}>
      <DrawingSurface
        drawing={drawing}
        ariaLabel={label}
        interactive={{ tool, color, width, onOps }}
      >
        {children}
      </DrawingSurface>
    </div>
  )
}

/** The other team's drawing as the server's coarse preview grid. */
export function OpponentPreview({
  canvasId,
  label,
  className,
}: {
  readonly canvasId: string
  readonly label: string
  readonly className?: string
}) {
  const { canvasStore } = useRoomSession()
  const preview = useCanvasPreview(canvasStore, canvasId)
  return <CanvasPreview preview={preview} label={label} className={className} />
}
