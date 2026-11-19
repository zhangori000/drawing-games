export type DrawingTool = 'pen' | 'eraser'

export interface NamedColor {
  readonly name: string
  readonly value: string
}

/**
 * Twelve inks with distinct hues and lightness so they stay tellable apart
 * for common color-vision differences; every swatch also has a name.
 * Keys 1–9 pick the first nine.
 */
export const DRAWING_COLORS: readonly NamedColor[] = [
  { name: 'Ink', value: '#181713' },
  { name: 'Violet', value: '#5c4cf2' },
  { name: 'Coral', value: '#ff6b4a' },
  { name: 'Green', value: '#1f9d72' },
  { name: 'Sunflower', value: '#f0b429' },
  { name: 'Sky', value: '#3b9eff' },
  { name: 'Red', value: '#d62828' },
  { name: 'Pink', value: '#ff5fa2' },
  { name: 'Brown', value: '#8a5a33' },
  { name: 'Leaf', value: '#7cc33a' },
  { name: 'Gray', value: '#8a8f98' },
  { name: 'White', value: '#ffffff' },
]

export interface NamedSize {
  readonly name: string
  /** Normalized stroke width (fraction of the paper's short side). */
  readonly value: number
}

export const STROKE_SIZES: readonly NamedSize[] = [
  { name: 'Fine', value: 0.006 },
  { name: 'Medium', value: 0.012 },
  { name: 'Bold', value: 0.022 },
  { name: 'Huge', value: 0.04 },
]

export const DEFAULT_COLOR = DRAWING_COLORS[0]?.value ?? '#181713'
export const DEFAULT_SIZE = STROKE_SIZES[1]?.value ?? 0.012

/** Object-eraser hit radius, normalized like stroke width. */
export const ERASER_RADIUS = 0.025

export function colorName(value: string): string {
  return (
    DRAWING_COLORS.find(
      (color) => color.value.toLowerCase() === value.toLowerCase(),
    )?.name ?? value
  )
}
