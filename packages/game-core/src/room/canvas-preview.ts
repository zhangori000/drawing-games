import type { DrawingDocument } from '@drawing-games/drawing-model'

import type { CanvasPreview } from './types'

export const DEFAULT_PREVIEW_COLS = 16
export const DEFAULT_PREVIEW_ROWS = 12

/**
 * CONTRACT STUB. Rasterizes a document into a coarse grid of dominant ink
 * colors so opponents get an entertaining but unhelpful preview. The raw
 * strokes must not be recoverable from the result.
 */
export function computeCanvasPreview(
  _document: DrawingDocument,
  cols: number = DEFAULT_PREVIEW_COLS,
  rows: number = DEFAULT_PREVIEW_ROWS,
): CanvasPreview {
  return { cols, rows, cells: new Array<string | null>(cols * rows).fill(null) }
}
