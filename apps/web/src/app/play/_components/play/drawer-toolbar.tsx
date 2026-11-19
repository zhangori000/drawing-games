'use client'

import { DrawingToolbar } from '@/components/drawing/drawing-toolbar'
import {
  drawingHistoryState,
  type DrawingTools,
} from '@/components/drawing/use-drawing-tools'
import { useCanvasDrawing } from '@/lib/realtime/use-canvas'

import { useRoomSession } from '../room-session'
import { usePlayLayout } from './play-layout'

/** Tools for the active drawer; undo/redo/clear stream like strokes. */
export function DrawerToolbar({
  canvasId,
  tools,
}: {
  readonly canvasId: string
  readonly tools: DrawingTools
}) {
  const { canvasStore, actions } = useRoomSession()
  const drawing = useCanvasDrawing(canvasStore, canvasId)
  const history = drawingHistoryState(drawing)
  const wrap = usePlayLayout() === 'wide'
  return (
    <DrawingToolbar
      tool={tools.tool}
      onToolChange={tools.setTool}
      color={tools.color}
      onColorChange={tools.setColor}
      width={tools.width}
      onWidthChange={tools.setWidth}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      canClear={history.canClear}
      onOps={(ops) => actions.sendDrawing(canvasId, ops)}
      className={wrap ? 'flex-wrap justify-center' : undefined}
    />
  )
}
