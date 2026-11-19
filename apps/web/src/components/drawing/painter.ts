import type {
  DrawingDocument,
  DrawingState,
  Stroke,
} from '@drawing-games/drawing-model'

/** Every device sees the same proportions; the paper is letterboxed. */
export const PAPER_ASPECT = 4 / 3
export const MAX_DEVICE_PIXEL_RATIO = 2

export function fitPaper(
  containerWidth: number,
  containerHeight: number,
): { width: number; height: number } {
  if (containerWidth <= 0 || containerHeight <= 0)
    return { width: 0, height: 0 }
  const width = Math.min(containerWidth, containerHeight * PAPER_ASPECT)
  return {
    width: Math.floor(width),
    height: Math.floor(width / PAPER_ASPECT),
  }
}

/**
 * Paints a drawing onto a canvas. Completed strokes are cached in an
 * offscreen layer that only re-renders when the document or size changes, so
 * a drawer's frame while dragging costs one blit plus the live stroke.
 */
export class DrawingPainter {
  private layer: HTMLCanvasElement | null = null
  private layerDocument: DrawingDocument | null = null
  private layerSize = ''

  paint(
    canvas: HTMLCanvasElement,
    drawing: DrawingState,
    liveStroke: Stroke | null,
  ): void {
    const context = canvas.getContext('2d')
    if (!context) return
    const { width, height } = canvas
    if (width === 0 || height === 0) return

    const layer = this.committedLayer(drawing.document, width, height)
    context.clearRect(0, 0, width, height)
    context.drawImage(layer, 0, 0)

    for (const strokeId of drawing.inProgressOrder) {
      if (strokeId === liveStroke?.id) continue
      const stroke = drawing.inProgressById[strokeId]
      if (stroke) paintStroke(context, stroke, width, height)
    }
    if (liveStroke) paintStroke(context, liveStroke, width, height)
  }

  private committedLayer(
    document: DrawingDocument,
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const layer = this.layer ?? window.document.createElement('canvas')
    this.layer = layer
    const sizeKey = `${width}x${height}`
    if (this.layerDocument === document && this.layerSize === sizeKey) {
      return layer
    }

    layer.width = width
    layer.height = height
    const context = layer.getContext('2d')
    if (context) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      for (const strokeId of document.strokeOrder) {
        const stroke = document.strokesById[strokeId]
        if (stroke) paintStroke(context, stroke, width, height)
      }
    }
    this.layerDocument = document
    this.layerSize = sizeKey
    return layer
  }
}

/** Width is relative to the paper's short side, matching the canvas lab. */
export function paintStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
): void {
  const [first, ...rest] = stroke.points
  if (!first) return

  context.save()
  context.globalAlpha = stroke.style.opacity
  context.strokeStyle = stroke.style.color
  context.fillStyle = stroke.style.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1, stroke.style.width * Math.min(width, height))

  if (rest.length === 0) {
    context.beginPath()
    context.arc(
      first.x * width,
      first.y * height,
      context.lineWidth / 2,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.restore()
    return
  }

  // Quadratic curves through segment midpoints smooth jittery input without
  // moving the stroke away from the sampled points.
  context.beginPath()
  context.moveTo(first.x * width, first.y * height)
  let previous = first
  for (let index = 0; index < rest.length; index += 1) {
    const point = rest[index]
    if (!point) continue
    const isLast = index === rest.length - 1
    if (isLast) {
      context.quadraticCurveTo(
        previous.x * width,
        previous.y * height,
        point.x * width,
        point.y * height,
      )
    } else {
      const midX = ((previous.x + point.x) / 2) * width
      const midY = ((previous.y + point.y) / 2) * height
      context.quadraticCurveTo(
        previous.x * width,
        previous.y * height,
        midX,
        midY,
      )
    }
    previous = point
  }
  context.stroke()
  context.restore()
}
