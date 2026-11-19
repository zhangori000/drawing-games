import type {
  DrawingDocument,
  NormalizedPoint,
  Stroke,
} from '@drawing-games/drawing-model'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PREVIEW_COLS,
  DEFAULT_PREVIEW_ROWS,
  computeCanvasPreview,
} from './canvas-preview'
import type { CanvasPreview } from './types'

const BLACK = '#000000'
const RED = '#ff0000'
const BLUE = '#0000ff'

/** Centre of a default-grid cell in canvas coordinates. */
function cellCenter(col: number, row: number): NormalizedPoint {
  return {
    x: (col + 0.5) / DEFAULT_PREVIEW_COLS,
    y: (row + 0.5) / DEFAULT_PREVIEW_ROWS,
  }
}

function stroke(
  id: string,
  points: readonly NormalizedPoint[],
  color = BLACK,
  width = 0.01,
  opacity = 1,
): Stroke {
  return { id, style: { color, width, opacity }, points }
}

function documentOf(...strokes: readonly Stroke[]): DrawingDocument {
  return {
    strokesById: Object.fromEntries(strokes.map((item) => [item.id, item])),
    strokeOrder: strokes.map((item) => item.id),
  }
}

function cellAt(preview: CanvasPreview, col: number, row: number) {
  return preview.cells[row * preview.cols + col]
}

function litCells(preview: CanvasPreview): [number, number][] {
  const lit: [number, number][] = []
  preview.cells.forEach((cell, index) => {
    if (cell !== null)
      lit.push([index % preview.cols, Math.floor(index / preview.cols)])
  })
  return lit
}

describe('computeCanvasPreview', () => {
  it('returns an all-null 16×12 grid for an empty document', () => {
    const preview = computeCanvasPreview(documentOf())
    expect(preview.cols).toBe(16)
    expect(preview.rows).toBe(12)
    expect(preview.cells).toHaveLength(16 * 12)
    expect(preview.cells.every((cell) => cell === null)).toBe(true)
  })

  it('lights exactly one cell for a dot', () => {
    const preview = computeCanvasPreview(
      documentOf(stroke('dot', [cellCenter(5, 7)], RED, 0.02)),
    )
    expect(litCells(preview)).toEqual([[5, 7]])
    expect(cellAt(preview, 5, 7)).toBe(RED)
  })

  it('treats a drag that never moved as a dot', () => {
    const point = cellCenter(2, 3)
    const preview = computeCanvasPreview(
      documentOf(stroke('still', [point, point, point])),
    )
    expect(litCells(preview)).toEqual([[2, 3]])
  })

  it('lights one row for a horizontal line', () => {
    const y = cellCenter(0, 4).y
    const preview = computeCanvasPreview(
      documentOf(
        stroke('line', [
          { x: 0.01, y },
          { x: 0.99, y },
        ]),
      ),
    )
    const lit = litCells(preview)
    expect(lit.every(([, row]) => row === 4)).toBe(true)
    expect(lit.map(([col]) => col)).toEqual(
      Array.from({ length: 16 }, (_, col) => col),
    )
  })

  it('lights every cell a diagonal passes through, without gaps', () => {
    const preview = computeCanvasPreview(
      documentOf(
        stroke(
          'diagonal',
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          BLUE,
        ),
      ),
    )
    for (let col = 0; col < 16; col += 1) {
      const row = Math.min(11, Math.floor((col + 0.5) * (12 / 16)))
      expect(cellAt(preview, col, row)).toBe(BLUE)
    }
  })

  it('spreads a thick stroke over the cells its width covers', () => {
    const y = cellCenter(0, 6).y
    const thin = computeCanvasPreview(
      documentOf(
        stroke(
          'thin',
          [
            { x: 0.3, y },
            { x: 0.7, y },
          ],
          BLACK,
          0.01,
        ),
      ),
    )
    const thick = computeCanvasPreview(
      documentOf(
        stroke(
          'thick',
          [
            { x: 0.3, y },
            { x: 0.7, y },
          ],
          BLACK,
          0.3,
        ),
      ),
    )
    const rows = (preview: CanvasPreview) =>
      new Set(litCells(preview).map(([, row]) => row))
    expect(rows(thin)).toEqual(new Set([6]))
    expect(rows(thick).size).toBeGreaterThanOrEqual(3)
  })

  it('gives each cell its dominant color', () => {
    const y = cellCenter(0, 2).y
    const preview = computeCanvasPreview(
      documentOf(
        // Lots of red ink across cell (8, 2)…
        stroke('red', [cellCenter(8, 2), { x: 8.95 / 16, y }], RED, 0.06),
        // …and a thin blue sliver through it, drawn later.
        stroke(
          'blue',
          [
            { x: 8.1 / 16, y },
            { x: 8.3 / 16, y },
          ],
          BLUE,
          0.005,
        ),
        // Blue dominates a cell it fills on its own.
        stroke('blue-only', [cellCenter(1, 9)], BLUE, 0.05),
      ),
    )
    expect(cellAt(preview, 8, 2)).toBe(RED)
    expect(cellAt(preview, 1, 9)).toBe(BLUE)
  })

  it('ignores invisible strokes and reports canonical lowercase colors', () => {
    const preview = computeCanvasPreview(
      documentOf(
        stroke('ghost', [cellCenter(3, 3)], RED, 0.05, 0),
        stroke('upper', [cellCenter(4, 4)], '#AABBCC', 0.05),
      ),
    )
    expect(cellAt(preview, 3, 3)).toBeNull()
    expect(cellAt(preview, 4, 4)).toBe('#aabbcc')
  })

  it('is robust to edge and out-of-range coordinates', () => {
    const preview = computeCanvasPreview(
      documentOf(
        stroke('corner-top-left', [{ x: 0, y: 0 }]),
        stroke('corner-bottom-right', [{ x: 1, y: 1 }]),
        stroke('outside', [{ x: 1.5, y: -2 }]),
        stroke('nan', [{ x: Number.NaN, y: 0.5 }]),
        stroke(
          'edge-line',
          [
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
          RED,
        ),
      ),
    )
    expect(cellAt(preview, 0, 0)).toBe(BLACK)
    expect(cellAt(preview, 15, 11)).not.toBeNull()
    expect(cellAt(preview, 15, 0)).not.toBeNull()
    const lit = litCells(preview)
    expect(
      lit.every(([col, row]) => col === 0 || col === 15 || row === 0),
    ).toBe(true)
    expect(preview.cells).toHaveLength(192)
  })

  it('skips missing strokes and honors custom grid sizes', () => {
    const document: DrawingDocument = {
      strokesById: { a: stroke('a', [{ x: 0.6, y: 0.5 }]) },
      strokeOrder: ['missing', 'a'],
    }
    const preview = computeCanvasPreview(document, 4, 3)
    expect(preview.cols).toBe(4)
    expect(preview.rows).toBe(3)
    expect(litCells(preview)).toEqual([[2, 1]])
    const clamped = computeCanvasPreview(document, 0, 999)
    expect([clamped.cols, clamped.rows]).toEqual([1, 64])
  })

  it('only ever reveals per-cell colors (no stroke geometry)', () => {
    const preview = computeCanvasPreview(
      documentOf(
        stroke('s', [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.6 },
        ]),
      ),
    )
    expect(Object.keys(preview).sort()).toEqual(['cells', 'cols', 'rows'])
    for (const cell of preview.cells) {
      expect(cell === null || /^#[0-9a-f]{6}$/.test(cell)).toBe(true)
    }
  })

  it('is deterministic and never loses ink', () => {
    const point = fc.record({
      x: fc.double({ min: 0, max: 1, noNaN: true }),
      y: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    const arbitraryStroke = fc.record({
      points: fc.array(point, { minLength: 1, maxLength: 12 }),
      color: fc.constantFrom(BLACK, RED, BLUE),
      width: fc.double({ min: 0.0001, max: 0.2, noNaN: true }),
    })
    fc.assert(
      fc.property(fc.array(arbitraryStroke, { maxLength: 8 }), (specs) => {
        const strokes = specs.map((spec, index) =>
          stroke(`s${index}`, spec.points, spec.color, spec.width),
        )
        const first = computeCanvasPreview(documentOf(...strokes))
        const second = computeCanvasPreview(documentOf(...strokes))
        expect(first).toEqual(second)
        expect(first.cells).toHaveLength(192)
        // Ink never disappears: any stroke lights at least one cell.
        if (strokes.length > 0) {
          expect(first.cells.some((cell) => cell !== null)).toBe(true)
        }
      }),
      { seed: 20261119, numRuns: 200 },
    )
  })

  it('stays fast on a canvas at the stroke and point caps', () => {
    const strokes = Array.from({ length: 400 }, (_, index) =>
      stroke(
        `s${index}`,
        Array.from({ length: 50 }, (_, step) => ({
          x: ((index * 37 + step * 13) % 100) / 100,
          y: ((index * 11 + step * 29) % 100) / 100,
        })),
        index % 2 === 0 ? RED : BLUE,
        0.02,
      ),
    )
    const started = performance.now()
    computeCanvasPreview(documentOf(...strokes))
    expect(performance.now() - started).toBeLessThan(500)
  })
})
