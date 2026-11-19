import type {
  DrawingDocument,
  NormalizedPoint,
  Stroke,
} from '@drawing-games/drawing-model'

import type { CanvasPreview } from './types'

export const DEFAULT_PREVIEW_COLS = 16
export const DEFAULT_PREVIEW_ROWS = 12
/** Every client renders the canvas at this logical width / height. */
export const PREVIEW_CANVAS_ASPECT = 4 / 3
/** Matches the protocol's preview limits. */
export const MAX_PREVIEW_DIMENSION = 64

/** Samples per cell length along a segment, so thin lines never skip a cell. */
const SAMPLES_PER_CELL = 4
/** Overlaps below this share of a cell are floating-point noise, not ink. */
const MIN_INK_SHARE = 1e-9
const MIN_RADIUS = 1e-6

interface Sample {
  readonly x: number
  readonly y: number
}

/**
 * Ink accumulator in "height units": x spans [0, aspect], y spans [0, 1], so
 * distances are isotropic and match how stroke widths are rendered.
 */
class InkGrid {
  readonly cellWidth: number
  readonly cellHeight: number
  private readonly ink: Map<number, number>[]
  private readonly colorIndex = new Map<string, number>()
  private readonly colors: string[] = []

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.cellWidth = PREVIEW_CANVAS_ASPECT / cols
    this.cellHeight = 1 / rows
    this.ink = Array.from({ length: cols * rows }, () => new Map())
  }

  colorId(color: string): number {
    const canonical = color.toLowerCase()
    let id = this.colorIndex.get(canonical)
    if (id === undefined) {
      id = this.colors.length
      this.colors.push(canonical)
      this.colorIndex.set(canonical, id)
    }
    return id
  }

  /** Spreads `amount` of ink over the square footprint of a brush at (x, y). */
  deposit(center: Sample, radius: number, amount: number, color: number) {
    const left = Math.max(0, center.x - radius)
    const right = Math.min(PREVIEW_CANVAS_ASPECT, center.x + radius)
    const top = Math.max(0, center.y - radius)
    const bottom = Math.min(1, center.y + radius)
    if (right <= left || bottom <= top) return
    const footprint = 4 * radius * radius
    const minOverlap = MIN_INK_SHARE * this.cellWidth * this.cellHeight
    const firstCol = this.colAt(left)
    const lastCol = this.colAt(right)
    const firstRow = this.rowAt(top)
    const lastRow = this.rowAt(bottom)
    for (let row = firstRow; row <= lastRow; row += 1) {
      const cellTop = row * this.cellHeight
      const height =
        Math.min(bottom, cellTop + this.cellHeight) - Math.max(top, cellTop)
      if (height <= 0) continue
      for (let col = firstCol; col <= lastCol; col += 1) {
        const cellLeft = col * this.cellWidth
        const width =
          Math.min(right, cellLeft + this.cellWidth) - Math.max(left, cellLeft)
        const overlap = width * height
        if (width <= 0 || overlap <= minOverlap) continue
        const cell = this.ink[row * this.cols + col] as Map<number, number>
        cell.set(color, (cell.get(color) ?? 0) + (amount * overlap) / footprint)
      }
    }
  }

  /** The most-inked color per cell; ties go to the color drawn first. */
  dominantColors(): (string | null)[] {
    return this.ink.map((cell) => {
      let best: number | null = null
      let bestInk = 0
      for (const [color, amount] of cell) {
        if (
          amount > bestInk ||
          (amount === bestInk && best !== null && color < best)
        ) {
          best = color
          bestInk = amount
        }
      }
      return best === null ? null : (this.colors[best] ?? null)
    })
  }

  private colAt(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellWidth)))
  }

  private rowAt(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellHeight)))
  }
}

function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MAX_PREVIEW_DIMENSION, Math.max(1, Math.floor(value)))
}

function unit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Canvas point → height units; non-finite points are dropped. */
function toSample(point: NormalizedPoint): Sample | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  return { x: unit(point.x) * PREVIEW_CANVAS_ASPECT, y: unit(point.y) }
}

function depositStroke(grid: InkGrid, stroke: Stroke) {
  const opacity = Number.isFinite(stroke.style.opacity)
    ? unit(stroke.style.opacity)
    : 1
  if (opacity === 0) return
  // Widths are fractions of the canvas's shorter side.
  const width = Number.isFinite(stroke.style.width) ? stroke.style.width : 0
  const radius = Math.max(
    MIN_RADIUS,
    (width / 2) * Math.min(1, PREVIEW_CANVAS_ASPECT),
  )
  const samples = stroke.points
    .map(toSample)
    .filter((sample): sample is Sample => sample !== null)
  const first = samples[0]
  if (first === undefined) return
  const color = grid.colorId(stroke.style.color)
  const step = Math.max(
    Math.min(grid.cellWidth, grid.cellHeight) / SAMPLES_PER_CELL,
    radius / 2,
  )

  let inked = false
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1] as Sample
    const to = samples[index] as Sample
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    if (length === 0) continue
    inked = true
    const pieces = Math.ceil(length / step)
    const amount = (length / pieces) * 2 * radius * opacity
    for (let piece = 0; piece < pieces; piece += 1) {
      const t = (piece + 0.5) / pieces
      grid.deposit(
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        radius,
        amount,
        color,
      )
    }
  }
  // A tap, or a drag that never moved, is a round dot.
  if (!inked)
    grid.deposit(first, radius, Math.PI * radius ** 2 * opacity, color)
}

/**
 * Rasterizes a document into a coarse grid of dominant ink colors so
 * opponents get an entertaining but unhelpful preview. Every dot and segment
 * is sampled at least `SAMPLES_PER_CELL` times per cell with its brush width,
 * and each cell reports only the color with the most ink coverage (or null).
 * Only those per-cell colors leave this function, so nothing finer than the
 * grid can be reconstructed. Deterministic; work is linear in stroke points.
 */
export function computeCanvasPreview(
  document: DrawingDocument,
  cols: number = DEFAULT_PREVIEW_COLS,
  rows: number = DEFAULT_PREVIEW_ROWS,
): CanvasPreview {
  const grid = new InkGrid(
    clampDimension(cols, DEFAULT_PREVIEW_COLS),
    clampDimension(rows, DEFAULT_PREVIEW_ROWS),
  )
  for (const strokeId of document.strokeOrder) {
    const stroke = document.strokesById[strokeId]
    if (stroke !== undefined) depositStroke(grid, stroke)
  }
  return { cols: grid.cols, rows: grid.rows, cells: grid.dominantColors() }
}
