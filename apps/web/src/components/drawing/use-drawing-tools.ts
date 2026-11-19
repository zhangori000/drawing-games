'use client'

import type { DrawingState } from '@drawing-games/drawing-model'
import { useMemo, useState } from 'react'

import { DEFAULT_COLOR, DEFAULT_SIZE, type DrawingTool } from './palette'

export interface DrawingTools {
  readonly tool: DrawingTool
  readonly color: string
  readonly width: number
  setTool(tool: DrawingTool): void
  /** Picking a color also switches back to the pen. */
  setColor(color: string): void
  setWidth(width: number): void
}

/** Pen/eraser, color, and size state for one drawer. */
export function useDrawingTools(): DrawingTools {
  const [tool, setTool] = useState<DrawingTool>('pen')
  const [color, setColorState] = useState(DEFAULT_COLOR)
  const [width, setWidthState] = useState(DEFAULT_SIZE)

  return useMemo(
    () => ({
      tool,
      color,
      width,
      setTool,
      setColor: (next: string) => {
        setColorState(next)
        setTool('pen')
      },
      setWidth: (next: number) => {
        setWidthState(next)
        setTool('pen')
      },
    }),
    [tool, color, width],
  )
}

/** What the undo/redo/clear buttons may do for this local drawing state. */
export function drawingHistoryState(drawing: DrawingState): {
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly canClear: boolean
} {
  const idle = drawing.inProgressOrder.length === 0
  return {
    canUndo: idle && drawing.history.past.length > 0,
    canRedo: idle && drawing.history.future.length > 0,
    canClear: drawing.document.strokeOrder.length > 0,
  }
}
